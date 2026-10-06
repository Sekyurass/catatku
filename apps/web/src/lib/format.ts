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
