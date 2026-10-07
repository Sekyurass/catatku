import { monthRange } from './month';

/** Rata-rata harian dihitung dari maksimal sekian hari terakhir (tanpa hari ini). */
export const FORECAST_LOOKBACK_DAYS = 30;
/** Di bawah ini perkiraan belum ditampilkan karena polanya belum terbaca. */
export const FORECAST_MIN_DAYS = 7;
/** Data 7–13 hari belum cukup untuk dibagi per minggu; rentangnya ± sekian dari rata-rata. */
const SHORT_HISTORY_SPREAD = 0.25;

export interface ForecastUpcomingItem {
  date: string;
  type: 'INCOME' | 'EXPENSE';
  /** Selalu positif. */
  amount: number;
  note: string | null;
  category: { id: string; name: string; icon: string; color: string } | null;
  /** pending = sudah jatuh tempo tapi menunggu konfirmasi; scheduled = akan datang. */
  status: 'pending' | 'scheduled';
}

export interface ForecastInput {
  today: string;
  /** Total saldo dompet aktif sekarang. */
  balance: number;
  /** Pengeluaran per tanggal (positif) sebelum hari ini, TANPA transaksi dari aturan berulang. */
  expenses: { date: string; amount: number }[];
  /** Tanggal transaksi pertama pengguna; null = belum pernah mencatat. */
  firstActivityDate: string | null;
  /** Kejadian aturan berulang sampai akhir bulan yang belum masuk saldo. */
  upcoming: ForecastUpcomingItem[];
}

export type ForecastStatus = 'safe' | 'tight' | 'short';

export interface ForecastDTO {
  month: string;
  today: string;
  monthEnd: string;
  /** Hari setelah hari ini sampai akhir bulan. */
  daysLeft: number;
  balance: number;
  /** Hari yang dipakai untuk rata-rata (≤ 30). */
  historyDays: number;
  enoughData: boolean;
  /** Pengeluaran per hari: low = minggu paling hemat, high = minggu paling boros. */
  daily: { low: number; average: number; high: number };
  /** Perkiraan pengeluaran harian sampai akhir bulan (daily × daysLeft). */
  spending: { low: number; average: number; high: number };
  upcoming: { items: ForecastUpcomingItem[]; income: number; expense: number };
  /** Saldo akhir bulan: low = pesimis, high = optimis. */
  projected: { low: number; mid: number; high: number };
  status: ForecastStatus;
}

const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const addDays = (date: string, days: number) =>
  new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);

/**
 * Perkiraan saldo akhir bulan = saldo sekarang − pengeluaran harian × sisa hari − tagihan berulang
 * + pemasukan terjadwal. Ditampilkan sebagai rentang karena pengeluaran tiap minggu berbeda.
 */
export function computeForecast(input: ForecastInput): ForecastDTO {
  const { today, balance } = input;
  const month = today.slice(0, 7);
  const { end: monthEnd } = monthRange(month);
  const daysLeft = dayNumber(monthEnd) - dayNumber(today);

  const yesterday = addDays(today, -1);
  const historyDays = input.firstActivityDate
    ? Math.max(
        0,
        Math.min(
          FORECAST_LOOKBACK_DAYS,
          dayNumber(yesterday) - dayNumber(input.firstActivityDate) + 1,
        ),
      )
    : 0;
  const enoughData = historyDays >= FORECAST_MIN_DAYS;

  // Total per hari untuk jendela [kemarin − historyDays + 1, kemarin]; hari tanpa transaksi = 0.
  const perDay = Array.from({ length: historyDays }, () => 0);
  const firstDay = dayNumber(yesterday) - historyDays + 1;
  for (const e of input.expenses) {
    const i = dayNumber(e.date) - firstDay;
    if (i >= 0 && i < historyDays) perDay[i]! += e.amount;
  }
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const average = historyDays > 0 ? sum(perDay) / historyDays : 0;

  let low = average;
  let high = average;
  if (historyDays >= 14) {
    // Minggu penuh dihitung mundur dari kemarin, maks. 4 minggu.
    const weeks: number[] = [];
    for (let end = historyDays; end - 7 >= 0 && weeks.length < 4; end -= 7) {
      weeks.push(sum(perDay.slice(end - 7, end)) / 7);
    }
    low = Math.min(average, ...weeks);
    high = Math.max(average, ...weeks);
  } else if (enoughData) {
    low = average * (1 - SHORT_HISTORY_SPREAD);
    high = average * (1 + SHORT_HISTORY_SPREAD);
  }

  const daily = enoughData
    ? { low: Math.round(low), average: Math.round(average), high: Math.round(high) }
    : { low: 0, average: 0, high: 0 };
  const spending = {
    low: daily.low * daysLeft,
    average: daily.average * daysLeft,
    high: daily.high * daysLeft,
  };

  const items = input.upcoming
    .filter((u) => u.date <= monthEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
  const income = sum(items.filter((u) => u.type === 'INCOME').map((u) => u.amount));
  const expense = sum(items.filter((u) => u.type === 'EXPENSE').map((u) => u.amount));
  const base = balance + income - expense;
  const projected = {
    low: base - spending.high,
    mid: base - spending.average,
    high: base - spending.low,
  };
  const status: ForecastStatus =
    projected.low >= 0 ? 'safe' : projected.mid >= 0 ? 'tight' : 'short';

  return {
    month,
    today,
    monthEnd,
    daysLeft,
    balance,
    historyDays,
    enoughData,
    daily,
    spending,
    upcoming: { items, income, expense },
    projected,
    status,
  };
}
