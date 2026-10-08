import { logger } from '../lib/logger';
import { purgeOrphanAttachments } from '../modules/attachments/attachment.service';
import { runPendingDigest } from '../modules/bankEmail/bankEmail.service';
import { pollImap } from '../modules/bankEmail/imap';
import { runDebtReminders } from '../modules/debts/debt.service';
import { pruneNotifications, runReminders } from '../modules/notifications/notification.service';
import { purgeExpiredSamples } from '../modules/quickText/quickText.service';
import { runDueRules } from '../modules/recurring/recurring.service';

/**
 * Satu putaran tiap job, dipanggil node-cron (server biasa) atau endpoint /cron (Vercel + pg_cron).
 * Kegagalan dicatat dan tidak dilempar agar satu langkah yang gagal tidak menghentikan yang lain.
 */
export async function runRecurring(): Promise<{ created: number }> {
  try {
    const created = await runDueRules();
    if (created > 0) logger.info({ created }, 'Transaksi berulang diproses');
    return { created };
  } catch (err) {
    logger.error({ err }, 'Putaran transaksi berulang gagal');
    return { created: 0 };
  }
}

export async function runNotifications(): Promise<Record<string, number>> {
  const summary = { sent: 0, debts: 0, bankPending: 0, pruned: 0, purged: 0, expired: 0 };
  try {
    summary.sent = await runReminders();
    summary.debts = await runDebtReminders();
    summary.bankPending = await runPendingDigest();
    summary.pruned = await pruneNotifications();
    const { sent, debts, bankPending, pruned } = summary;
    if (sent > 0 || debts > 0 || bankPending > 0 || pruned > 0) {
      logger.info({ sent, debts, bankPending, pruned }, 'Pengingat diproses');
    }
  } catch (err) {
    logger.error({ err }, 'Putaran pengingat gagal');
  }
  try {
    summary.purged = await purgeOrphanAttachments();
    if (summary.purged > 0) {
      logger.info({ purged: summary.purged }, 'Lampiran tanpa transaksi dibersihkan');
    }
  } catch (err) {
    logger.error({ err }, 'Pembersihan lampiran gagal');
  }
  try {
    summary.expired = await purgeExpiredSamples();
    if (summary.expired > 0) {
      logger.info({ expired: summary.expired }, 'Sampel ketik cepat kedaluwarsa dihapus');
    }
  } catch (err) {
    logger.error({ err }, 'Pembersihan sampel ketik cepat gagal');
  }
  return summary;
}

export async function runBankEmail(): Promise<void> {
  try {
    const processed = await pollImap();
    if (processed > 0) logger.info({ processed }, 'Email bank diproses');
  } catch (err) {
    logger.error({ err }, 'Membaca kotak masuk email bank gagal');
  }
}
