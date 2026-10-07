import { z } from 'zod';
import { INSIGHT_KINDS } from '../insights';

/** Event yang boleh dikirim langsung oleh klien; event lain hanya dicatat server. */
export const CLIENT_EVENTS = [
  'onboarding_completed',
  'onboarding_skipped',
  'receipt_scanned',
  'category_suggestion',
  'insight_opened',
  'quick_text_used',
] as const;
export type ClientEventName = (typeof CLIENT_EVENTS)[number];

export const SUGGESTION_SOURCES = ['history', 'keyword'] as const;
export type SuggestionSource = (typeof SUGGESTION_SOURCES)[number];

export const trackEventSchema = z
  .object({
    name: z.enum(CLIENT_EVENTS, { error: 'Event tidak dikenal' }),
    step: z.number().int().min(1).max(3).optional(),
    /** Jumlah isian yang terbaca: dari struk (maks. 3) atau dari ketik cepat (maks. 6). */
    fields: z.number().int().min(0).max(6).optional(),
    /** Saran kategori: asal saran. */
    source: z.enum(SUGGESTION_SOURCES).optional(),
    /**
     * Saran kategori: kategori yang disimpan sama dengan sarannya. Ketik cepat: hasil bacaan
     * disimpan tanpa diubah.
     */
    accepted: z.boolean().optional(),
    /** Jenis insight yang dibuka detailnya. */
    kind: z.enum(INSIGHT_KINDS).optional(),
  })
  .refine((v) => v.name !== 'receipt_scanned' || v.fields === undefined || v.fields <= 3, {
    path: ['fields'],
    error: 'Struk hanya punya 3 isian',
  });
export type TrackEventInput = z.infer<typeof trackEventSchema>;
