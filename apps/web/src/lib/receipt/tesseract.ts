import { createWorker, OEM, PSM } from 'tesseract.js';
import type { ReceiptParser } from '.';
import { prepareReceiptImage } from './image';
import { type OcrLine, parseReceiptText } from './parse';

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

/**
 * Tesseract.js di Web Worker, bahasa Indonesia, mesin LSTM saja. Satu worker per pindaian lalu
 * dimatikan agar memori HP lega; data bahasa tersimpan di IndexedDB sehingga pindaian berikutnya cepat.
 */
export const tesseractReceiptParser: ReceiptParser = {
  async parse(image, { today, signal, onProgress }) {
    const canvas = await abortable(prepareReceiptImage(image), signal);
    const starting = createWorker('ind', OEM.LSTM_ONLY, {
      workerPath: `${BASE}/worker.min.js`,
      corePath: `${BASE}/core`,
      langPath: `${BASE}/lang`,
      gzip: false,
      workerBlobURL: false,
      logger: (m) =>
        onProgress?.({
          stage: m.status === 'recognizing text' ? 'reading' : 'loading',
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
    try {
      await abortable(
        worker.setParameters({
          // Mode tata letak otomatis/kolom membuang teks di bawah garis putus-putus khas struk.
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
          preserve_interword_spaces: '1',
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
    } finally {
      void worker.terminate().catch(() => undefined);
    }
  },
};
