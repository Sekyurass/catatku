import { APP_TIME_ZONE } from '@catatku/shared';
import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { runDueRules } from '../modules/recurring/recurring.service';

async function runRecurring() {
  try {
    const created = await runDueRules();
    if (created > 0) logger.info({ created }, 'Transaksi berulang diproses');
  } catch (err) {
    logger.error({ err }, 'Putaran transaksi berulang gagal');
  }
}

/**
 * Job latar di dalam proses API (node-cron, tanpa Redis). Putaran pertama saat server menyala
 * sekaligus menyusul hari-hari yang terlewat ketika server mati. Aman dijalankan di beberapa
 * instance karena pemrosesan aturan idempoten; matikan dengan SCHEDULER_ENABLED=false.
 */
export function startScheduler() {
  if (!env.SCHEDULER_ENABLED) {
    logger.info('Scheduler dinonaktifkan (SCHEDULER_ENABLED=false)');
    return () => undefined;
  }
  const boot = setTimeout(() => void runRecurring(), 5_000);
  const hourly = cron.schedule('5 * * * *', runRecurring, {
    name: 'recurring',
    timezone: APP_TIME_ZONE,
    noOverlap: true,
  });
  return () => {
    clearTimeout(boot);
    void hourly.stop();
  };
}
