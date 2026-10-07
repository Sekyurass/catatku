import { ATTACHMENT_MAX_BYTES, type AttachmentDTO, RECEIPT_MAX_BYTES } from '@catatku/shared';
import { api } from './api';

/** Sisi terpanjang foto lampiran; cukup untuk membaca struk tanpa memboroskan kuota penyimpanan. */
export const ATTACHMENT_MAX_SIDE = 1600;

export class AttachmentImageError extends Error {}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Putar sesuai EXIF, perkecil, lalu kompres ke WebP (JPEG bila browser tidak bisa meng-encode WebP).
 * Foto HP 3–8 MB biasanya jadi 150–400 KB.
 */
export async function compressAttachment(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new AttachmentImageError('Pilih file foto (JPG, PNG, atau WebP).');
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    throw new AttachmentImageError(
      `Foto terlalu besar (maks ${RECEIPT_MAX_BYTES / 1024 / 1024} MB).`,
    );
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new AttachmentImageError('Format foto tidak didukung browser ini. Coba JPG atau PNG.');
  }
  const scale = Math.min(1, ATTACHMENT_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AttachmentImageError('Browser ini tidak bisa memproses foto.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.8, 0.65, 0.5]) {
    let blob = await toBlob(canvas, 'image/webp', quality);
    if (blob?.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
    if (blob && blob.size <= ATTACHMENT_MAX_BYTES) return blob;
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
