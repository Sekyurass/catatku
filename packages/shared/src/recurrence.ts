import type { RecurrenceFrequency } from './constants';

const DAY_MS = 86_400_000;
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];
/** Perkiraan panjang satu periode (hari), hanya untuk menebak indeks awal pencarian. */
const APPROX_DAYS: Record<RecurrenceFrequency, number> = {
  DAILY: 1,
  WEEKLY: 7,
  MONTHLY: 30.44,
  YEARLY: 365.25,
};

export interface RecurrenceSchedule {
  startDate: string;
  frequency: RecurrenceFrequency;
  interval: number;
}

const parts = (date: string) => date.split('-').map(Number) as [number, number, number];
const pad = (n: number) => String(n).padStart(2, '0');
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Tanggal kejadian ke-`index` (0 = tanggal mulai). Bulanan/tahunan selalu dihitung dari tanggal
 * mulai, jadi "tiap tanggal 31" jatuh di hari terakhir bulan pendek lalu kembali ke 31.
 */
export function occurrenceDate(s: RecurrenceSchedule, index: number): string {
  const [y, m, d] = parts(s.startDate);
  if (s.frequency === 'DAILY' || s.frequency === 'WEEKLY') {
    const days = index * s.interval * (s.frequency === 'WEEKLY' ? 7 : 1);
    return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
  }
  const months = index * s.interval * (s.frequency === 'YEARLY' ? 12 : 1);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${pad(month)}-${pad(Math.min(d, daysInMonth(year, month)))}`;
}

/** Indeks kejadian pertama yang jatuh pada atau sesudah `date`. */
export function firstIndexOnOrAfter(s: RecurrenceSchedule, date: string): number {
  if (date <= s.startDate) return 0;
  const diffDays = (Date.parse(date) - Date.parse(s.startDate)) / DAY_MS;
  let i = Math.max(0, Math.floor(diffDays / (APPROX_DAYS[s.frequency] * s.interval)) - 1);
  while (i > 0 && occurrenceDate(s, i - 1) >= date) i--;
  while (occurrenceDate(s, i) < date) i++;
  return i;
}

/** Contoh: "Setiap tanggal 25", "Setiap 2 minggu, hari Senin", "Setiap tahun, 17 Agustus". */
export function describeRecurrence(s: RecurrenceSchedule): string {
  const [y, m, d] = parts(s.startDate);
  const every = (unit: string) => (s.interval === 1 ? 'Setiap' : `Setiap ${s.interval} ${unit},`);
  switch (s.frequency) {
    case 'DAILY':
      return s.interval === 1 ? 'Setiap hari' : `Setiap ${s.interval} hari`;
    case 'WEEKLY': {
      const day = DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
      return s.interval === 1 ? `Setiap ${day}` : `${every('minggu')} hari ${day}`;
    }
    case 'MONTHLY': {
      const tail = d > 28 ? ` (atau akhir bulan)` : '';
      return s.interval === 1
        ? `Setiap tanggal ${d}${tail}`
        : `${every('bulan')} tanggal ${d}${tail}`;
    }
    case 'YEARLY':
      return `${s.interval === 1 ? 'Setiap tahun,' : every('tahun')} ${d} ${MONTH_NAMES[m - 1]}`;
  }
}
