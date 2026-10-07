import type { ClientEventName } from '@catatku/shared';
import { logger } from './logger';
import { prisma } from './prisma';

export type EventName =
  | ClientEventName
  | 'user_registered'
  | 'user_logged_in'
  | 'password_reset_requested'
  | 'password_reset'
  | 'wallet_created'
  | 'transaction_created'
  | 'recurring_rule_created'
  | 'template_created'
  | 'template_used'
  | 'goal_created'
  | 'goal_contribution'
  | 'insight_dismissed'
  | 'import_completed'
  | 'import_rolled_back'
  | 'reminder_sent'
  | 'push_subscribed'
  | 'budget_saved'
  | 'export_csv'
  | 'export_pdf'
  | 'attachment_uploaded';

/** Hanya nilai non-sensitif (jenis, jumlah item, langkah). Jangan masukkan nominal, catatan, atau email. */
export type EventProps = Record<string, string | number | boolean>;

/**
 * Catat event produk untuk menilai gerbang antar fase. Tidak ditunggu: kegagalan
 * analitik tidak boleh memperlambat atau menggagalkan aksi pengguna.
 */
export function track(userId: string, name: EventName, props?: EventProps): void {
  prisma.analyticsEvent
    .create({ data: { userId, name, ...(props && { props }) } })
    .catch((err: unknown) => logger.warn({ err, name }, 'Gagal mencatat event analitik'));
}
