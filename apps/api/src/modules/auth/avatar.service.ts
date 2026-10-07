import type { UserDTO } from '@catatku/shared';
import { notFound, validationError } from '../../lib/errors';
import { sniffImageType } from '../../lib/imageType';
import { prisma } from '../../lib/prisma';
import { toUserDTO } from './auth.service';

export async function setAvatar(userId: string, data: unknown): Promise<UserDTO> {
  const mimeType = Buffer.isBuffer(data) && data.length > 0 ? sniffImageType(data) : null;
  if (!Buffer.isBuffer(data) || !mimeType) {
    throw validationError('Foto harus berupa gambar JPEG, PNG, atau WebP');
  }
  const bytes = new Uint8Array(data);
  const now = new Date();
  const [, user] = await prisma.$transaction([
    prisma.userAvatar.upsert({
      where: { userId },
      create: { userId, mimeType, data: bytes },
      update: { mimeType, data: bytes },
    }),
    prisma.user.update({ where: { id: userId }, data: { avatarUpdatedAt: now } }),
  ]);
  return toUserDTO(user);
}

export async function getAvatar(userId: string) {
  const avatar = await prisma.userAvatar.findUnique({ where: { userId } });
  if (!avatar) throw notFound('Foto profil');
  return avatar;
}

export async function removeAvatar(userId: string): Promise<UserDTO> {
  const [, user] = await prisma.$transaction([
    prisma.userAvatar.deleteMany({ where: { userId } }),
    prisma.user.update({ where: { id: userId }, data: { avatarUpdatedAt: null } }),
  ]);
  return toUserDTO(user);
}
