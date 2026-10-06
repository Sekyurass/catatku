import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
  UserDTO,
} from '@catatku/shared';
import { Prisma, type User } from '@prisma/client';
import { env } from '../../config/env';
import { AppError, notFound, unauthorized, validationError } from '../../lib/errors';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../lib/password';
import { prisma } from '../../lib/prisma';
import { generateRefreshToken, hashToken, signAccessToken } from '../../lib/tokens';

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
    },
  });
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
      },
    });
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

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
