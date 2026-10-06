import { RECEIPT_MAX_BYTES } from '@catatku/shared';

export class ReceiptImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReceiptImageError';
  }
}

export function validateReceiptFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    throw new ReceiptImageError('Pilih file foto (JPG, PNG, atau WebP).');
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    throw new ReceiptImageError(
      `Foto terlalu besar (maks ${RECEIPT_MAX_BYTES / 1024 / 1024} MB). Coba foto ulang.`,
    );
  }
}

const MAX_SIDE = 2000;
const MIN_SIDE = 1200;

/**
 * Putar sesuai EXIF, ubah ukuran ke kisaran yang paling baik dibaca OCR, lalu jadikan abu-abu
 * dengan kontras sedikit dinaikkan. Hasilnya hanya ada di memori.
 */
export async function prepareReceiptImage(file: Blob): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ReceiptImageError('Format foto tidak didukung browser ini. Coba JPG atau PNG.');
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale =
    longest > MAX_SIDE
      ? MAX_SIDE / longest
      : longest < MIN_SIDE
        ? Math.min(2, MIN_SIDE / longest)
        : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  for (let i = 0; i < px.length; i += 4) {
    const gray = 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!;
    const v = Math.max(0, Math.min(255, (gray - 128) * 1.3 + 128));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
