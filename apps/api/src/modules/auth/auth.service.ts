import {
  type ChangePasswordInput,
  type DeleteAccountInput,
  type ForgotPasswordInput,
  type LoginInput,
  PRIVACY_POLICY_VERSION,
  type PrivacyConsentInput,
  type RegisterInput,
  RESET_RESEND_COOLDOWN_SECONDS,
  type ResetPasswordInput,
  type UpdateProfileInput,
  type UserDTO,
} from '@catatku/shared';
import { Prisma, type User } from '@prisma/client';
import { env } from '../../config/env';
import { track } from '../../lib/analytics';
import { runInBackground } from '../../lib/background';
import { AppError, notFound, unauthorized, validationError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { mailer } from '../../lib/mailer';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../lib/password';
import { prisma } from '../../lib/prisma';
import { getStorage } from '../../lib/storage';
import { generateRefreshToken, hashToken, signAccessToken } from '../../lib/tokens';
import { asTimeZone, rememberUserTimeZone } from '../../lib/userZone';
import { passwordResetEmail } from './emails';

/** Token yang sudah dirotasi dalam jendela ini dianggap balapan antar-tab, bukan pencurian. */
const REUSE_GRACE_MS = 30_000;

export interface Session {
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

interface ClientMeta {
  userAgent?: string;
}

export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    createdAt: user.createdAt.toISOString(),
    avatarUpdatedAt: user.avatarUpdatedAt?.toISOString() ?? null,
    privacyVersion: user.privacyVersion,
    timeZone: asTimeZone(user.timeZone),
  };
}

async function issueSession(user: User, meta: ClientMeta): Promise<Session> {
  const refreshToken = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
      userAgent: meta.userAgent?.slice(0, 255),
    },
  });
  return {
    user: toUserDTO(user),
    accessToken: signAccessToken(user.id),
    refreshToken,
    refreshExpiresAt,
  };
}

const emailTaken = (hint = 'Email ini sudah terdaftar. Coba masuk.') =>
  new AppError(409, 'EMAIL_TAKEN', 'Email ini sudah terdaftar', { email: hint });

const wrongPassword = () =>
  validationError('Kata sandi saat ini salah', { currentPassword: 'Kata sandi saat ini salah' });

export async function register(input: RegisterInput, meta: ClientMeta): Promise<Session> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw emailTaken();
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      privacyVersion: PRIVACY_POLICY_VERSION,
      privacyAgreedAt: new Date(),
      shareQuickText: input.shareQuickText ?? false,
      ...(input.timeZone && { timeZone: input.timeZone }),
    },
  });
  track(user.id, 'user_registered');
  return issueSession(user, meta);
}

export async function login(input: LoginInput, meta: ClientMeta): Promise<Session> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    await burnPasswordCheck(input.password);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi tidak cocok');
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi tidak cocok');
  }
  track(user.id, 'user_logged_in');
  return issueSession(user, meta);
}

export async function refresh(rawToken: string | undefined, meta: ClientMeta): Promise<Session> {
  if (!rawToken) throw unauthorized();
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });
  if (!stored) throw unauthorized();

  if (stored.revokedAt) {
    if (Date.now() - stored.revokedAt.getTime() > REUSE_GRACE_MS) {
      // Token lama dipakai ulang: anggap bocor, cabut semua sesi pengguna.
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw unauthorized();
  }
  if (stored.expiresAt.getTime() <= Date.now()) throw unauthorized();

  const { count } = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) throw unauthorized();

  return issueSession(stored.user, meta);
}

async function findUser(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('Pengguna');
  return user;
}

export async function getProfile(userId: string): Promise<UserDTO> {
  return toUserDTO(await findUser(userId));
}

/** Menyetujui Kebijakan Privasi versi terbaru (pengguna lama, atau setelah kebijakan diperbarui). */
export async function agreePrivacy(userId: string, input: PrivacyConsentInput): Promise<UserDTO> {
  await findUser(userId);
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      privacyVersion: PRIVACY_POLICY_VERSION,
      privacyAgreedAt: new Date(),
      ...(input.shareQuickText !== undefined && { shareQuickText: input.shareQuickText }),
    },
  });
  return toUserDTO(user);
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<UserDTO> {
  const user = await findUser(userId);
  const emailChanged = input.email !== undefined && input.email !== user.email;
  if (emailChanged) {
    if (!input.currentPassword) {
      throw validationError('Masukkan kata sandi untuk mengganti email', {
        currentPassword: 'Masukkan kata sandi untuk mengganti email',
      });
    }
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) throw wrongPassword();
  }
  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(emailChanged && { email: input.email }),
        ...(input.timeZone !== undefined && { timeZone: input.timeZone }),
      },
    });
    rememberUserTimeZone(userId, updated.timeZone);
    return toUserDTO(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw emailTaken('Email ini sudah dipakai akun lain');
    }
    throw err;
  }
}

/**
 * Mengakhiri semua sesi (termasuk perangkat lain) lalu menerbitkan sesi baru untuk perangkat ini.
 * Token lama dihapus, bukan dicabut: token dicabut yang dipakai ulang memicu pencabutan massal
 * di `refresh` dan akan ikut mematikan sesi baru ini.
 */
export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  meta: ClientMeta,
): Promise<Session> {
  const user = await findUser(userId);
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) throw wrongPassword();
  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(input.newPassword) },
    }),
    prisma.refreshToken.deleteMany({ where: { userId } }),
  ]);
  return issueSession(updated, meta);
}

/**
 * Menghapus akun beserta seluruh datanya (relasi User onDelete: Cascade). Berkas lampiran di
 * object storage dihapus lebih dulu: bila gagal, akun tetap ada sehingga bisa dicoba lagi, alih-alih
 * meninggalkan berkas yatim yang tidak bisa dijangkau siapa pun.
 */
export async function deleteAccount(userId: string, input: DeleteAccountInput): Promise<void> {
  const user = await findUser(userId);
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    throw validationError('Kata sandi salah', { password: 'Kata sandi salah' });
  }
  const attachments = await prisma.attachment.findMany({
    where: { userId },
    select: { storageKey: true },
  });
  const storage = getStorage();
  if (attachments.length > 0 && storage) {
    try {
      await storage.remove(attachments.map((a) => a.storageKey));
    } catch (err) {
      logger.error({ err, userId }, 'Gagal menghapus lampiran saat hapus akun');
      throw new AppError(
        503,
        'SERVICE_UNAVAILABLE',
        'Foto lampiran belum bisa dihapus. Akun belum dihapus, coba lagi sebentar lagi.',
      );
    }
  }
  await prisma.user.delete({ where: { id: userId } });
  logger.info({ userId, attachments: attachments.length }, 'Akun dihapus atas permintaan pengguna');
}

/** Agar tombol "kirim ulang" tidak bisa dipakai membanjiri kotak masuk seseorang. */
const RESET_RESEND_COOLDOWN_MS = RESET_RESEND_COOLDOWN_SECONDS * 1000;

const invalidResetToken = () =>
  new AppError(
    400,
    'INVALID_RESET_TOKEN',
    'Tautan sudah tidak berlaku. Minta tautan baru dari halaman lupa kata sandi.',
  );

/**
 * Selalu selesai tanpa error dan tanpa menunggu pengiriman email, apa pun hasilnya,
 * supaya respons tidak membocorkan email mana yang terdaftar.
 */
export async function requestPasswordReset(input: ForgotPasswordInput): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) return;
  const recent = await prisma.passwordResetToken.findFirst({
    where: {
      userId: user.id,
      usedAt: null,
      createdAt: { gt: new Date(Date.now() - RESET_RESEND_COOLDOWN_MS) },
    },
    select: { id: true },
  });
  if (recent) return;

  const raw = generateRefreshToken();
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + env.RESET_TOKEN_TTL_MINUTES * 60_000),
      },
    }),
  ]);
  // Fragmen (#) tidak ikut terkirim ke server mana pun, termasuk lewat header Referer.
  const link = `${env.appUrl}/atur-ulang-kata-sandi#token=${raw}`;
  track(user.id, 'password_reset_requested');
  runInBackground(
    mailer
      .send(passwordResetEmail(user.email, user.name, link, env.RESET_TOKEN_TTL_MINUTES))
      .catch((err: unknown) => logger.error({ err }, 'Gagal mengirim email reset kata sandi')),
    'Gagal mengirim email reset kata sandi',
  );
}

/** Kata sandi baru berlaku, semua sesi lama berakhir, dan perangkat ini langsung masuk. */
export async function resetPassword(input: ResetPasswordInput, meta: ClientMeta): Promise<Session> {
  const stored = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
  });
  if (!stored || stored.usedAt || stored.expiresAt.getTime() <= Date.now()) {
    throw invalidResetToken();
  }
  const { count } = await prisma.passwordResetToken.updateMany({
    where: { id: stored.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count === 0) throw invalidResetToken();

  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: stored.userId },
      data: { passwordHash: await hashPassword(input.password) },
    }),
    prisma.refreshToken.deleteMany({ where: { userId: stored.userId } }),
    prisma.passwordResetToken.deleteMany({
      where: { userId: stored.userId, id: { not: stored.id } },
    }),
  ]);
  track(updated.id, 'password_reset');
  return issueSession(updated, meta);
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
