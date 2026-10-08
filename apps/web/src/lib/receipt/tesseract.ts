import { createWorker, OEM, PSM } from 'tesseract.js';
import type { ReceiptParser, ReceiptProgress, ReceiptScanResult } from '.';
import { prepareReceiptImage } from './image';
import { type OcrLine, parseReceiptText, type ReceiptField, type ReceiptFields } from './parse';

const BASE = import.meta.env.VITE_TESSERACT_PATH;

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason as Error);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Total yang tidak terbaca/kurang yakin, atau kurang dari dua isian, layak dibaca ulang. */
export function needsSecondPass(fields: ReceiptFields): boolean {
  const found = [fields.total, fields.date, fields.merchant].filter(Boolean).length;
  return fields.total?.confidence !== 'high' || found < 2;
}

function pick<T>(a: ReceiptField<T> | null, b: ReceiptField<T> | null) {
  if (a?.confidence === 'high') return a;
  if (b?.confidence === 'high') return b;
  return a ?? b;
}

/** Gabungkan dua bacaan per isian: yang yakin menang, lalu bacaan pertama. */
export function mergeScans(first: ReceiptScanResult, second: ReceiptScanResult): ReceiptScanResult {
  return {
    total: pick(first.total, second.total),
    date: pick(first.date, second.date),
    merchant: pick(first.merchant, second.merchant),
    items: second.items.length > first.items.length ? second.items : first.items,
    text: `${first.text}\n${second.text}`,
  };
}

/**
 * Tesseract.js di Web Worker, bahasa Indonesia, mesin LSTM saja. Bacaan pertama memakai foto yang
 * pencahayaannya diratakan; bila hasilnya lemah, dibaca ulang dengan versi kontras biasa dan mode
 * kolom lalu digabung. Satu worker per pindaian lalu dimatikan agar memori HP lega; data bahasa
 * tersimpan di IndexedDB sehingga pindaian berikutnya cepat.
 */
export const tesseractReceiptParser: ReceiptParser = {
  async parse(image, { today, signal, onProgress }) {
    const prepared = await abortable(prepareReceiptImage(image), signal);
    let reading: ReceiptProgress['stage'] = 'reading';
    const starting = createWorker('ind', OEM.LSTM_ONLY, {
      workerPath: `${BASE}/worker.min.js`,
      corePath: `${BASE}/core`,
      langPath: `${BASE}/lang`,
      gzip: false,
      workerBlobURL: false,
      logger: (m) =>
        onProgress?.({
          stage: m.status === 'recognizing text' ? reading : 'loading',
          progress: m.progress,
        }),
    });
    let worker: Awaited<typeof starting>;
    try {
      worker = await abortable(starting, signal);
    } catch (err) {
      void starting.then((w) => w.terminate()).catch(() => undefined);
      throw err;
    }

    const read = async (canvas: HTMLCanvasElement, psm: PSM): Promise<ReceiptScanResult> => {
      await abortable(
        worker.setParameters({
          tessedit_pageseg_mode: psm,
          preserve_interword_spaces: '1',
          // Gambar sudah diskalakan ke ukuran huruf yang wajar; tanpa ini Tesseract menebak DPI.
          user_defined_dpi: '300',
        }),
        signal,
      );
      const { data } = await abortable(
        worker.recognize(canvas, {}, { text: true, blocks: true }),
        signal,
      );
      const lines: OcrLine[] = (data.blocks ?? []).flatMap((block) =>
        block.paragraphs.flatMap((p) =>
          p.lines.map((l) => ({ text: l.text.trim(), confidence: l.confidence })),
        ),
      );
      return { ...parseReceiptText(lines.length > 0 ? lines : data.text, today), text: data.text };
    };

    try {
      // Mode tata letak otomatis membuang teks di bawah garis putus-putus khas struk.
      const first = await read(prepared.flattened, PSM.SINGLE_BLOCK);
      if (!needsSecondPass(first)) return first;
      reading = 'rereading';
      const second = await read(prepared.contrast(), PSM.SINGLE_COLUMN);
      return mergeScans(first, second);
    } finally {
      void worker.terminate().catch(() => undefined);
    }
  },
};
