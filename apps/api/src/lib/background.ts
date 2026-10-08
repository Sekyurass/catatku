import { waitUntil } from '@vercel/functions';
import { logger } from './logger';

/**
 * Pekerjaan yang tidak ditunggu respons (analitik, belajar kategori, impor besar). Di Vercel fungsi
 * bisa dibekukan begitu respons terkirim, jadi promise didaftarkan ke `waitUntil`; di server biasa
 * `waitUntil` tidak melakukan apa-apa dan promise tetap jalan seperti dulu. Kegagalan hanya dicatat.
 */
export function runInBackground(task: Promise<unknown>, message: string): void {
  waitUntil(
    task.catch((err: unknown) => {
      logger.warn({ err }, message);
    }),
  );
}
