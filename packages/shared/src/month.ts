export const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const APP_TIME_ZONE = 'Asia/Jakarta';

/** Zona waktu yang bisa dipilih pengguna. */
export const TIME_ZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'] as const;
export type TimeZoneId = (typeof TIME_ZONES)[number];

export const TIME_ZONE_LABELS: Record<TimeZoneId, { short: string; region: string }> = {
  'Asia/Jakarta': { short: 'WIB', region: 'Sumatra, Jawa, Kalimantan Barat & Tengah' },
  'Asia/Makassar': { short: 'WITA', region: 'Bali, Nusa Tenggara, Kalimantan lain, Sulawesi' },
  'Asia/Jayapura': { short: 'WIT', region: 'Maluku dan Papua' },
};

export const isTimeZoneId = (v: unknown): v is TimeZoneId =>
  typeof v === 'string' && (TIME_ZONES as readonly string[]).includes(v);

const ZONE_ALIASES: Record<string, TimeZoneId> = {
  'Asia/Pontianak': 'Asia/Jakarta',
  'Asia/Ujung_Pandang': 'Asia/Makassar',
};

/** Zona IANA perangkat → pilihan Catatku; undefined bila di luar Indonesia. */
export function matchTimeZone(zone: string | undefined): TimeZoneId | undefined {
  if (!zone) return undefined;
  return isTimeZoneId(zone) ? zone : ZONE_ALIASES[zone];
}

let resolveTimeZone: () => string = () => APP_TIME_ZONE;

/**
 * Zona bawaan `toDateString`/`currentMonth` tanpa argumen zona. Web: zona pengguna yang masuk.
 * API: zona pengguna request yang sedang berjalan (AsyncLocalStorage), WIB di luar request.
 */
export function setTimeZoneResolver(resolver: (() => string) | null): void {
  resolveTimeZone = resolver ?? (() => APP_TIME_ZONE);
}

export const defaultTimeZone = (): string => resolveTimeZone();

/** Tanggal "YYYY-MM-DD" untuk sebuah instant di zona waktu tertentu. */
export function toDateString(instant: Date = new Date(), timeZone = resolveTimeZone()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export function currentMonth(instant: Date = new Date(), timeZone = resolveTimeZone()): string {
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
