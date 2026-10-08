import { APP_TIME_ZONE } from '@catatku/shared';
import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { purgeOrphanAttachments } from '../modules/attachments/attachment.service';
import { runPendingDigest } from '../modules/bankEmail/bankEmail.service';
import { isImapConfigured, pollImap } from '../modules/bankEmail/imap';
import { runDebtReminders } from '../modules/debts/debt.service';
import { pruneNotifications, runReminders } from '../modules/notifications/notification.service';
import { purgeExpiredSamples } from '../modules/quickText/quickText.service';
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
    const debts = await runDebtReminders();
    const bankPending = await runPendingDigest();
    const pruned = await pruneNotifications();
    if (sent > 0 || debts > 0 || bankPending > 0 || pruned > 0) {
      logger.info({ sent, debts, bankPending, pruned }, 'Pengingat diproses');
    }
  } catch (err) {
    logger.error({ err }, 'Putaran pengingat gagal');
  }
  try {
    const purged = await purgeOrphanAttachments();
    if (purged > 0) logger.info({ purged }, 'Lampiran tanpa transaksi dibersihkan');
  } catch (err) {
    logger.error({ err }, 'Pembersihan lampiran gagal');
  }
  try {
    const expired = await purgeExpiredSamples();
    if (expired > 0) logger.info({ expired }, 'Sampel ketik cepat kedaluwarsa dihapus');
  } catch (err) {
    logger.error({ err }, 'Pembersihan sampel ketik cepat gagal');
  }
}

async function runBankEmail() {
  try {
    const processed = await pollImap();
    if (processed > 0) logger.info({ processed }, 'Email bank diproses');
  } catch (err) {
    logger.error({ err }, 'Membaca kotak masuk email bank gagal');
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
  if (isImapConfigured()) {
    jobs.push(cron.schedule('*/2 * * * *', runBankEmail, { ...options, name: 'bank-email' }));
  }
  return () => {
    clearTimeout(boot);
    for (const job of jobs) void job.stop();
  };
}
