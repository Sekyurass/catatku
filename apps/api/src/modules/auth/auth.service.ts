import type { LoginInput, RegisterInput, UserDTO } from '@catatku/shared';
import type { User } from '@prisma/client';
import { env } from '../../config/env';
import { AppError, unauthorized } from '../../lib/errors';
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

export async function register(input: RegisterInput, meta: ClientMeta): Promise<Session> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, 'EMAIL_TAKEN', 'Email ini sudah terdaftar', {
      email: 'Email ini sudah terdaftar. Coba masuk.',
    });
  }
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

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
