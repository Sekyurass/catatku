import type { ReceiptFields } from './parse';

export type { Confidence, ReceiptField, ReceiptFields } from './parse';
export { countFields, receiptNote } from './parse';
export { ReceiptImageError, validateReceiptFile } from './image';

export interface ReceiptProgress {
  /** `loading` = menyiapkan mesin OCR (unduhan pertama ±5 MB), `reading` = membaca teks. */
  stage: 'loading' | 'reading';
  /** 0–1 */
  progress: number;
}

export interface ReceiptScanResult extends ReceiptFields {
  text: string;
}

/** Penyedia OCR bisa diganti (mis. layanan vision di server) tanpa mengubah form. */
export interface ReceiptParser {
  parse(
    image: Blob,
    options: {
      today: string;
      signal?: AbortSignal;
      onProgress?: (progress: ReceiptProgress) => void;
    },
  ): Promise<ReceiptScanResult>;
}

/** Mesin OCR (±5 MB) baru dimuat saat pengguna memindai struk. */
export function loadReceiptParser(): Promise<ReceiptParser> {
  return import('./tesseract').then((m) => m.tesseractReceiptParser);
}
