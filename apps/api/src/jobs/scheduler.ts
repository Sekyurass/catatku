import { APP_TIME_ZONE } from '@catatku/shared';
import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { purgeOrphanAttachments } from '../modules/attachments/attachment.service';
import { pruneNotifications, runReminders } from '../modules/notifications/notification.service';
import { runDueRules } from '../modules/recurring/recurring.service';

async function runRecurring() {
  try {
    const created = await runDueRules();
    if (created > 0) logger.info({ created }, 'Transaksi berulang diproses');
  } catch (err) {
    logger.error({ err }, 'Putaran transaksi berulang gagal');
  }
}

async function runNotifications() {
  try {
    const sent = await runReminders();
    const pruned = await pruneNotifications();
    if (sent > 0 || pruned > 0) logger.info({ sent, pruned }, 'Pengingat diproses');
  } catch (err) {
    logger.error({ err }, 'Putaran pengingat gagal');
  }
  try {
    const purged = await purgeOrphanAttachments();
    if (purged > 0) logger.info({ purged }, 'Lampiran tanpa transaksi dibersihkan');
  } catch (err) {
    logger.error({ err }, 'Pembersihan lampiran gagal');
  }
}

/**
 * Job latar di dalam proses API (node-cron, tanpa Redis). Putaran pertama saat server menyala
 * sekaligus menyusul yang terlewat ketika server mati. Aman dijalankan di beberapa instance
 * karena setiap job idempoten; matikan dengan SCHEDULER_ENABLED=false.
 */
export function startScheduler() {
  if (!env.SCHEDULER_ENABLED) {
    logger.info('Scheduler dinonaktifkan (SCHEDULER_ENABLED=false)');
    return () => undefined;
  }
  const boot = setTimeout(() => void runRecurring().then(runNotifications), 5_000);
  const options = { timezone: APP_TIME_ZONE, noOverlap: true };
  const jobs = [
    cron.schedule('0 * * * *', runNotifications, { ...options, name: 'reminders' }),
    cron.schedule('5 * * * *', runRecurring, { ...options, name: 'recurring' }),
  ];
  return () => {
    clearTimeout(boot);
    for (const job of jobs) void job.stop();
  };
}
