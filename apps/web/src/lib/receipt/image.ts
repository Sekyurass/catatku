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

/**
 * Struk panjang yang difoto utuh punya huruf kecil; dibatasi jumlah piksel (bukan sisi terpanjang)
 * agar hurufnya tetap cukup besar untuk OCR tanpa membuat HP kehabisan memori.
 */
const MAX_PIXELS = 4_500_000;
const MAX_SIDE = 3600;
const MIN_SIDE = 1600;

/** Regangkan kontras: 1% piksel tergelap jadi hitam, 1% paling terang jadi putih. */
export function stretchContrast(gray: Uint8ClampedArray): void {
  const hist = new Uint32Array(256);
  for (const v of gray) hist[v] = hist[v]! + 1;
  const cut = gray.length * 0.01;
  let lo = 0;
  for (let acc = 0; lo < 255 && acc + hist[lo]! <= cut; lo++) acc += hist[lo]!;
  let hi = 255;
  for (let acc = 0; hi > 0 && acc + hist[hi]! <= cut; hi--) acc += hist[hi]!;
  if (hi - lo < 16) return;
  const k = 255 / (hi - lo);
  for (let i = 0; i < gray.length; i++) gray[i] = (gray[i]! - lo) * k;
}

/**
 * Ratakan pencahayaan: tiap piksel dibagi rata-rata sekitarnya, sehingga bayangan tangan/HP dan
 * kertas yang menguning jadi putih rata sementara huruf tetap gelap.
 */
export function flattenLighting(gray: Uint8ClampedArray, width: number, height: number) {
  const radius = Math.max(15, Math.round(Math.min(width, height) / 10));
  const stride = width + 1;
  const integral = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += gray[y * width + x]!;
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1]! + row;
    }
  }
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const sum =
        integral[y1 * stride + x1]! -
        integral[y0 * stride + x1]! -
        integral[y1 * stride + x0]! +
        integral[y0 * stride + x0]!;
      const count = (x1 - x0) * (y1 - y0);
      out[y * width + x] = sum === 0 ? 255 : (gray[y * width + x]! * 255 * count) / sum;
    }
  }
  stretchContrast(out);
  return out;
}

function grayToCanvas(gray: Uint8ClampedArray, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(width, height);
  const px = image.data;
  for (let i = 0; i < gray.length; i++) {
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = gray[i]!;
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export interface PreparedReceipt {
  /** Pencahayaan diratakan; paling baik untuk foto HP dengan bayangan. */
  flattened: HTMLCanvasElement;
  /** Abu-abu + kontras diregangkan saja; cadangan bila perataan merusak huruf tebal/logo. */
  contrast: () => HTMLCanvasElement;
}

/** Putar sesuai EXIF, ubah ukuran ke kisaran terbaik untuk OCR, lalu siapkan dua versi abu-abu. */
export async function prepareReceiptImage(file: Blob): Promise<PreparedReceipt> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ReceiptImageError('Format foto tidak didukung browser ini. Coba JPG atau PNG.');
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(
    longest < MIN_SIDE ? Math.min(2, MIN_SIDE / longest) : 1,
    MAX_SIDE / longest,
    Math.sqrt(MAX_PIXELS / (bitmap.width * bitmap.height)),
  );
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const px = ctx.getImageData(0, 0, width, height).data;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * px[i * 4]! + 0.587 * px[i * 4 + 1]! + 0.114 * px[i * 4 + 2]!;
  }
  stretchContrast(gray);
  canvas.width = 0;
  canvas.height = 0;

  return {
    flattened: grayToCanvas(flattenLighting(gray, width, height), width, height),
    contrast: () => grayToCanvas(gray, width, height),
  };
}
