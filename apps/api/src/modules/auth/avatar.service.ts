import type { AvatarMimeType, UserDTO } from '@catatku/shared';
import { notFound, validationError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { toUserDTO } from './auth.service';

/** Jenis file ditentukan dari isi byte, bukan dari header Content-Type kiriman klien. */
export function sniffImageType(data: Uint8Array): AvatarMimeType | null {
  const startsWith = (bytes: number[], offset = 0) => bytes.every((b, i) => data[offset + i] === b);
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // "RIFF" .... "WEBP"
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}

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
