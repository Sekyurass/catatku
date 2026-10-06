import { APP_TIME_ZONE } from '@catatku/shared';

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

function zoneParts(instant: Date) {
  const parts = Object.fromEntries(
    partsFormat.formatToParts(instant).map((p) => [p.type, Number(p.value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute', number>;
  return parts;
}

/** Jam (0–23) di APP_TIME_ZONE. */
export function hourInZone(instant: Date = new Date()): number {
  return zoneParts(instant).hour;
}

/** Instant pukul 00.00 tanggal "YYYY-MM-DD" di APP_TIME_ZONE. */
export function startOfDayInZone(date: string): Date {
  const guess = new Date(`${date}T00:00:00Z`);
  const p = zoneParts(guess);
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess.getTime();
  return new Date(guess.getTime() - offset);
}

/** 0 = Minggu … 6 = Sabtu untuk tanggal "YYYY-MM-DD". */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
