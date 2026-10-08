import { defaultTimeZone } from '@catatku/shared';

const formats = new Map<string, Intl.DateTimeFormat>();

function partsFormat(timeZone: string) {
  let format = formats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });
    formats.set(timeZone, format);
  }
  return format;
}

function zoneParts(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    partsFormat(timeZone)
      .formatToParts(instant)
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute', number>;
  return parts;
}

/** Jam (0–23) di zona waktu (bawaan: zona pengguna request). */
export function hourInZone(instant: Date = new Date(), timeZone = defaultTimeZone()): number {
  return zoneParts(instant, timeZone).hour;
}

/** Instant pukul 00.00 tanggal "YYYY-MM-DD" di zona waktu (bawaan: zona pengguna request). */
export function startOfDayInZone(date: string, timeZone = defaultTimeZone()): Date {
  const guess = new Date(`${date}T00:00:00Z`);
  const p = zoneParts(guess, timeZone);
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess.getTime();
  return new Date(guess.getTime() - offset);
}

/** 0 = Minggu … 6 = Sabtu untuk tanggal "YYYY-MM-DD". */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
