import { z } from 'zod';

/** Event yang boleh dikirim langsung oleh klien; event lain hanya dicatat server. */
export const CLIENT_EVENTS = ['onboarding_completed', 'onboarding_skipped'] as const;
export type ClientEventName = (typeof CLIENT_EVENTS)[number];

export const trackEventSchema = z.object({
  name: z.enum(CLIENT_EVENTS, { error: 'Event tidak dikenal' }),
  step: z.number().int().min(1).max(3).optional(),
});
export type TrackEventInput = z.infer<typeof trackEventSchema>;
