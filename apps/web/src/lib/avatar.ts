import { AVATAR_MAX_BYTES, type UserDTO } from '@catatku/shared';
import { useEffect, useState } from 'react';
import { fetchBlob } from './api';

/** 3× ukuran avatar terbesar (96 px) agar tetap tajam di layar retina. */
export const AVATAR_SIZE = 384;

export class AvatarImageError extends Error {}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Potong tengah jadi persegi, perkecil, lalu kompres ke WebP. Browser yang tidak bisa
 * meng-encode WebP (Safari lama) diam-diam menghasilkan PNG, jadi jatuh ke JPEG.
 */
export async function compressAvatar(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AvatarImageError('Format foto tidak didukung. Pilih foto JPG, PNG, atau WebP.');
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(AVATAR_SIZE, side);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AvatarImageError('Browser ini tidak bisa memproses foto.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  bitmap.close();

  for (const quality of [0.85, 0.7, 0.5]) {
    let blob = await toBlob(canvas, 'image/webp', quality);
    if (blob?.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
    if (blob && blob.size <= AVATAR_MAX_BYTES) return blob;
  }
  throw new AvatarImageError('Foto terlalu besar. Coba foto lain.');
}

/** URL objek per versi foto, dibagi semua komponen Avatar supaya foto tidak diunduh berulang. */
const urls = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

const avatarKey = (user: Pick<UserDTO, 'id' | 'avatarUpdatedAt'>) =>
  user.avatarUpdatedAt ? `${user.id}:${user.avatarUpdatedAt}` : null;

function loadAvatar(key: string, version: string): Promise<string> {
  let promise = pending.get(key);
  if (!promise) {
    promise = fetchBlob('/me/avatar', { v: version }).then((blob) => {
      const url = URL.createObjectURL(blob);
      urls.set(key, url);
      return url;
    });
    promise.catch(() => pending.delete(key));
    pending.set(key, promise);
  }
  return promise;
}

/** Dipanggil saat keluar agar foto pengguna sebelumnya tidak tertinggal di memori. */
export function clearAvatarCache() {
  urls.forEach((url) => URL.revokeObjectURL(url));
  urls.clear();
  pending.clear();
}

export function useAvatarSrc(user: Pick<UserDTO, 'id' | 'avatarUpdatedAt'>): string | null {
  const key = avatarKey(user);
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);

  useEffect(() => {
    if (!key || urls.has(key)) return;
    let active = true;
    loadAvatar(key, user.avatarUpdatedAt!)
      .then((url) => active && setLoaded({ key, url }))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [key, user.avatarUpdatedAt]);

  if (!key) return null;
  return urls.get(key) ?? (loaded?.key === key ? loaded.url : null);
}
