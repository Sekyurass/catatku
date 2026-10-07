import type { MonthlyReportDTO } from './dto';
import { monthRange } from './month';

export interface DailyRow {
  date: string;
  income: number;
  expense: number;
  /** Jumlah transaksi pengeluaran di tanggal itu. */
  expenseCount: number;
}

export type DailyStats = Pick<
  MonthlyReportDTO,
  'daysCounted' | 'averageDaily' | 'busiestDay' | 'daily' | 'weekdays'
>;

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/**
 * Pola harian satu bulan. Rata-rata dibagi hari yang sudah lewat (bulan berjalan: sampai `today`),
 * jadi tidak mengecil palsu di awal bulan. Transaksi bertanggal sesudah `today` tetap masuk total
 * dan grafik, tetapi tidak menambah hari yang dihitung.
 */
export function dailyStats(month: string, today: string, rows: DailyRow[]): DailyStats {
  const { start, end } = monthRange(month);
  const lastDay = Number(end.slice(8, 10));
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const daily = Array.from({ length: lastDay }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`;
    const row = byDate.get(date);
    return { date, income: row?.income ?? 0, expense: row?.expense ?? 0 };
  });

  const daysCounted = today < start ? 0 : today > end ? lastDay : Number(today.slice(8, 10));
  const counted = daily.slice(0, daysCounted);
  const expense = daily.reduce((s, d) => s + d.expense, 0);
  const averageDaily = daysCounted > 0 ? Math.round(expense / daysCounted) : 0;

  let busiestDay: DailyStats['busiestDay'] = null;
  for (const d of daily) {
    if (d.expense > 0 && (!busiestDay || d.expense > busiestDay.total)) {
      busiestDay = { date: d.date, total: d.expense, count: byDate.get(d.date)?.expenseCount ?? 0 };
    }
  }

  const weekdays = Array.from({ length: 7 }, (_, weekday) => {
    const days = counted.filter((d) => weekdayOf(d.date) === weekday);
    const total = days.reduce((s, d) => s + d.expense, 0);
    return { weekday, total, average: days.length > 0 ? Math.round(total / days.length) : 0 };
  });

  return { daysCounted, averageDaily, busiestDay, daily, weekdays };
}
