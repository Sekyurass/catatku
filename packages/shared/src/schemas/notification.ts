import { z } from 'zod';
import { REMINDER_HOUR_MAX, REMINDER_HOUR_MIN } from '../constants';

export const listNotificationsQuerySchema = z.object({
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListNotificationsQuery = z.input<typeof listNotificationsQuerySchema>;

export const updateNotificationSettingsSchema = z
  .object({
    reminderEnabled: z.boolean(),
    reminderHour: z
      .number({ error: 'Pilih jam pengingat' })
      .int()
      .min(REMINDER_HOUR_MIN, { error: `Jam pengingat mulai ${REMINDER_HOUR_MIN}.00` })
      .max(REMINDER_HOUR_MAX, { error: `Jam pengingat paling lambat ${REMINDER_HOUR_MAX}.00` }),
    /** 0 = Minggu … 6 = Sabtu (sama dengan Date#getDay). */
    reminderDays: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  })
  .refine((v) => !v.reminderEnabled || v.reminderDays.length > 0, {
    error: 'Pilih minimal satu hari',
    path: ['reminderDays'],
  });
export type UpdateNotificationSettingsInput = z.input<typeof updateNotificationSettingsSchema>;

/**
 * Server mengirim request ke endpoint ini, jadi hanya layanan push resmi browser yang diterima
 * (Chrome/Android, Firefox, Safari/iOS, Edge) agar tidak bisa dipakai untuk SSRF.
 */
export const PUSH_SERVICE_HOSTNAME =
  /(^|\.)(googleapis\.com|mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;

/** Bentuk `PushSubscription.toJSON()` dari browser. */
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .url({
      protocol: /^https$/,
      hostname: PUSH_SERVICE_HOSTNAME,
      error: 'Endpoint push tidak valid',
    })
    .max(2048, { error: 'Endpoint push tidak valid' }),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(64),
  }),
});
export type PushSubscriptionInput = z.input<typeof pushSubscriptionSchema>;

export const removePushSubscriptionSchema = z.object({ endpoint: z.string().min(1).max(2048) });
