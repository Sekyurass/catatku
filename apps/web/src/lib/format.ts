import { toDateString } from '@catatku/shared';

const longDate = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const shortDate = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const parse = (date: string) => new Date(`${date}T00:00:00Z`);

export function today(): string {
  return toDateString();
}

export function yesterday(): string {
  return toDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

/** "Hari ini", "Kemarin", atau "Senin, 5 Oktober 2026". */
export function formatDayLabel(date: string): string {
  if (date === today()) return 'Hari ini';
  if (date === yesterday()) return 'Kemarin';
  return longDate.format(parse(date));
}

export function formatShortDate(date: string): string {
  return shortDate.format(parse(date));
}

const monthLong = new Intl.DateTimeFormat('id-ID', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthShort = new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: 'UTC' });

/** "2026-10" -> "Oktober 2026". */
export function formatMonthLabel(month: string): string {
  return monthLong.format(parse(`${month}-01`));
}

/** "2026-10" -> "Okt". */
export function formatMonthShort(month: string): string {
  return monthShort.format(parse(`${month}-01`));
}

const compact = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });

/** Angka ringkas untuk sumbu grafik: 1.250.000 -> "1,3 jt". */
export function formatCompact(amount: number): string {
  return compact.format(amount);
}
