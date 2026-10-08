import { APP_TIME_ZONE } from '@catatku/shared';
import cron from 'node-cron';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { isImapConfigured } from '../modules/bankEmail/imap';
import { runBankEmail, runNotifications, runRecurring } from './runners';

/**
 * Job latar di dalam proses API (node-cron, tanpa Redis). Putaran pertama saat server menyala
 * sekaligus menyusul yang terlewat ketika server mati. Aman dijalankan di beberapa instance
 * karena setiap job idempoten; matikan dengan SCHEDULER_ENABLED=false (mis. di Vercel, tempat
 * job dipicu dari luar lewat /api/v1/cron/*).
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
