import { z } from 'zod';

/** Event yang boleh dikirim langsung oleh klien; event lain hanya dicatat server. */
export const CLIENT_EVENTS = [
  'onboarding_completed',
  'onboarding_skipped',
  'receipt_scanned',
] as const;
export type ClientEventName = (typeof CLIENT_EVENTS)[number];

export const trackEventSchema = z.object({
  name: z.enum(CLIENT_EVENTS, { error: 'Event tidak dikenal' }),
  step: z.number().int().min(1).max(3).optional(),
  /** Jumlah isian yang berhasil dibaca dari struk (total, tanggal, nama toko). */
  fields: z.number().int().min(0).max(3).optional(),
});
export type TrackEventInput = z.infer<typeof trackEventSchema>;
