import type { AvatarMimeType } from '@catatku/shared';

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
