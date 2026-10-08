import { ATTACHMENT_MAX_BYTES, type AttachmentDTO } from '@catatku/shared';
import { api } from './api';

/**
 * Ukuran yang dicoba berurutan (sisi terpanjang): sedetail mungkin selama hasilnya muat di
 * ATTACHMENT_MAX_BYTES. 4096 px juga batas aman kanvas Safari iOS (±16,7 juta piksel).
 */
export const ATTACHMENT_SIDES = [4096, 3072, 2048, 1600] as const;
const QUALITIES = [0.85, 0.72] as const;
const LAST_RESORT_QUALITIES = [0.6, 0.5] as const;

/** Foto kamera HP 50–200 MP bisa belasan hingga puluhan MB sebelum dikompres. */
export const ATTACHMENT_SOURCE_MAX_BYTES = 40 * 1024 * 1024;

export class AttachmentImageError extends Error {}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function encode(canvas: HTMLCanvasElement, quality: number) {
  let blob = await toBlob(canvas, 'image/webp', quality);
  if (blob?.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
  return blob;
}

/**
 * Putar sesuai EXIF lalu kompres ke WebP (JPEG bila browser tidak bisa meng-encode WebP), dengan
 * resolusi setinggi mungkin: mulai dari 4096 px dan baru diperkecil bila file masih terlalu besar.
 */
export async function compressAttachment(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new AttachmentImageError('Pilih file foto (JPG, PNG, atau WebP).');
  }
  if (file.size > ATTACHMENT_SOURCE_MAX_BYTES) {
    throw new AttachmentImageError(
      `Foto terlalu besar (maks ${ATTACHMENT_SOURCE_MAX_BYTES / 1024 / 1024} MB).`,
    );
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new AttachmentImageError('Format foto tidak didukung browser ini. Coba JPG atau PNG.');
  }
  const longSide = Math.max(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new AttachmentImageError('Browser ini tidak bisa memproses foto.');
  }

  try {
    const sides = ATTACHMENT_SIDES.filter((side, i) => i === 0 || side < longSide);
    for (const [i, side] of sides.entries()) {
      const scale = Math.min(1, side / longSide);
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const qualities =
        i === sides.length - 1 ? [...QUALITIES, ...LAST_RESORT_QUALITIES] : QUALITIES;
      for (const quality of qualities) {
        const blob = await encode(canvas, quality);
        if (blob && blob.size <= ATTACHMENT_MAX_BYTES) return blob;
      }
    }
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
  throw new AttachmentImageError('Foto terlalu besar. Coba foto lain.');
}

export function uploadAttachment(transactionId: string, blob: Blob) {
  return api<AttachmentDTO>(`/transactions/${transactionId}/attachments`, {
    method: 'POST',
    body: blob,
  });
}

export function deleteAttachment(id: string) {
  return api<void>(`/attachments/${id}`, { method: 'DELETE' });
}
