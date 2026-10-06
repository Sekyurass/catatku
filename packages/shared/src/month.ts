export const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const APP_TIME_ZONE = 'Asia/Jakarta';

/** Tanggal "YYYY-MM-DD" untuk sebuah instant di zona waktu tertentu. */
export function toDateString(instant: Date = new Date(), timeZone = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export function currentMonth(instant: Date = new Date(), timeZone = APP_TIME_ZONE): string {
  return toDateString(instant, timeZone).slice(0, 7);
}

/** Geser bulan "YYYY-MM" sebanyak delta (boleh negatif). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  const mon = (index % 12) + 1;
  return `${year}-${String(mon).padStart(2, '0')}`;
}

/** Rentang tanggal inklusif [start, end] untuk bulan "YYYY-MM". */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/** Daftar n bulan berakhir di `endMonth`, urut naik. */
export function lastMonths(endMonth: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(endMonth, i - (n - 1)));
}
