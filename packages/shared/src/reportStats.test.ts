import { describe, expect, it } from 'vitest';
import { dailyStats } from './reportStats';

const row = (date: string, expense: number, expenseCount = 1, income = 0) => ({
  date,
  income,
  expense,
  expenseCount,
});

describe('dailyStats', () => {
  it('bulan lalu: rata-rata dibagi semua hari, hari paling boros & per hari dalam seminggu', () => {
    const s = dailyStats('2026-09', '2026-10-07', [
      row('2026-09-05', 300_000, 3), // Sabtu
      row('2026-09-12', 100_000), // Sabtu
      row('2026-09-14', 200_000, 2, 5_000_000), // Senin
    ]);
    expect(s.daysCounted).toBe(30);
    expect(s.averageDaily).toBe(20_000);
    expect(s.busiestDay).toEqual({ date: '2026-09-05', total: 300_000, count: 3 });
    expect(s.daily).toHaveLength(30);
    expect(s.daily[13]).toEqual({ date: '2026-09-14', income: 5_000_000, expense: 200_000 });
    // September 2026 punya 4 hari Sabtu dan 4 hari Senin.
    expect(s.weekdays[6]).toEqual({ weekday: 6, total: 400_000, average: 100_000 });
    expect(s.weekdays[1]).toEqual({ weekday: 1, total: 200_000, average: 50_000 });
  });

  it('bulan berjalan: hanya sampai hari ini; transaksi terjadwal tetap masuk total', () => {
    const s = dailyStats('2026-10', '2026-10-07', [
      row('2026-10-02', 70_000),
      row('2026-10-25', 700_000),
    ]);
    expect(s.daysCounted).toBe(7);
    expect(s.averageDaily).toBe(110_000);
    expect(s.busiestDay?.date).toBe('2026-10-25');
    expect(s.weekdays.reduce((n, w) => n + w.total, 0)).toBe(70_000);
  });

  it('tanggal 1, bulan mendatang, dan tanpa data', () => {
    expect(dailyStats('2026-10', '2026-10-01', [row('2026-10-01', 50_000)])).toMatchObject({
      daysCounted: 1,
      averageDaily: 50_000,
    });
    const future = dailyStats('2026-11', '2026-10-07', []);
    expect(future).toMatchObject({ daysCounted: 0, averageDaily: 0, busiestDay: null });
    expect(future.weekdays.every((w) => w.total === 0 && w.average === 0)).toBe(true);
    expect(dailyStats('2026-02', '2026-10-07', []).daily).toHaveLength(28);
  });
});
