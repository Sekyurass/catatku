import { describe, expect, it } from 'vitest';
import { computeForecast, type ForecastInput, type ForecastUpcomingItem } from './forecast';

const DAY_MS = 86_400_000;
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Pengeluaran `amount` per hari untuk `days` hari sebelum `today`. */
function daily(today: string, days: number, amount: number | ((i: number) => number)) {
  return Array.from({ length: days }, (_, i) => ({
    date: addDays(today, -(i + 1)),
    amount: typeof amount === 'number' ? amount : amount(i),
  }));
}

function input(over: Partial<ForecastInput> = {}): ForecastInput {
  return {
    today: '2026-10-10',
    balance: 5_000_000,
    expenses: [],
    firstActivityDate: '2026-01-01',
    upcoming: [],
    ...over,
  };
}

const bill = (over: Partial<ForecastUpcomingItem> = {}): ForecastUpcomingItem => ({
  date: '2026-10-25',
  type: 'EXPENSE',
  amount: 300_000,
  note: 'Internet',
  category: null,
  status: 'scheduled',
  ...over,
});

describe('computeForecast', () => {
  it('saldo − rata-rata harian × sisa hari − tagihan + pemasukan', () => {
    const f = computeForecast(
      input({
        expenses: daily('2026-10-10', 30, 100_000),
        upcoming: [bill(), bill({ type: 'INCOME', amount: 1_000_000, note: 'Gaji' })],
      }),
    );
    expect(f.daysLeft).toBe(21);
    expect(f.historyDays).toBe(30);
    expect(f.daily).toEqual({ low: 100_000, average: 100_000, high: 100_000 });
    expect(f.upcoming).toMatchObject({ income: 1_000_000, expense: 300_000 });
    // 5jt + 1jt − 300rb − 100rb × 21
    expect(f.projected).toEqual({ low: 3_600_000, mid: 3_600_000, high: 3_600_000 });
    expect(f.status).toBe('safe');
  });

  it('rentang dari minggu paling hemat dan paling boros', () => {
    // Minggu terbaru 200rb/hari, minggu-minggu sebelumnya 50rb/hari; 2 hari tertua 50rb.
    const f = computeForecast(
      input({ expenses: daily('2026-10-10', 30, (i) => (i < 7 ? 200_000 : 50_000)) }),
    );
    expect(f.daily.low).toBe(50_000);
    expect(f.daily.high).toBe(200_000);
    expect(f.daily.average).toBe(85_000);
    expect(f.projected.low).toBe(5_000_000 - 200_000 * 21);
    expect(f.projected.high).toBe(5_000_000 - 50_000 * 21);
    expect(f.projected.low).toBeLessThan(f.projected.mid);
    expect(f.projected.mid).toBeLessThan(f.projected.high);
  });

  it('hari tanpa catatan dihitung 0 dalam rata-rata', () => {
    const f = computeForecast(input({ expenses: [{ date: '2026-10-09', amount: 3_000_000 }] }));
    expect(f.daily.average).toBe(100_000);
    expect(f.daily.low).toBe(0);
    expect(f.daily.high).toBe(Math.round(3_000_000 / 7));
  });

  it('pengguna baru (belum ada data): perkiraan belum ditampilkan', () => {
    const f = computeForecast(input({ firstActivityDate: null }));
    expect(f.enoughData).toBe(false);
    expect(f.historyDays).toBe(0);
    expect(f.daily).toEqual({ low: 0, average: 0, high: 0 });
    expect(f.projected.mid).toBe(5_000_000);
  });

  it('baru mencatat hari ini: belum cukup data', () => {
    const f = computeForecast(input({ firstActivityDate: '2026-10-10' }));
    expect(f.historyDays).toBe(0);
    expect(f.enoughData).toBe(false);
  });

  it('data 7–13 hari: rata-rata dari hari yang ada, rentang ±25%', () => {
    const f = computeForecast(
      input({ firstActivityDate: '2026-10-02', expenses: daily('2026-10-10', 8, 80_000) }),
    );
    expect(f.historyDays).toBe(8);
    expect(f.enoughData).toBe(true);
    expect(f.daily).toEqual({ low: 60_000, average: 80_000, high: 100_000 });
  });

  it('data 6 hari: belum cukup', () => {
    const f = computeForecast(
      input({ firstActivityDate: '2026-10-04', expenses: daily('2026-10-10', 6, 80_000) }),
    );
    expect(f.historyDays).toBe(6);
    expect(f.enoughData).toBe(false);
  });

  it('awal bulan: memakai data bulan lalu (lintas bulan)', () => {
    const f = computeForecast(
      input({ today: '2026-11-01', expenses: daily('2026-11-01', 30, 50_000) }),
    );
    expect(f.month).toBe('2026-11');
    expect(f.daysLeft).toBe(29);
    expect(f.daily.average).toBe(50_000);
    expect(f.projected.mid).toBe(5_000_000 - 50_000 * 29);
  });

  it('hari terakhir bulan: tidak ada sisa hari, hanya tagihan hari ini', () => {
    const f = computeForecast(
      input({
        today: '2026-10-31',
        expenses: daily('2026-10-31', 30, 100_000),
        upcoming: [bill({ date: '2026-10-31' }), bill({ date: '2026-11-01' })],
      }),
    );
    expect(f.daysLeft).toBe(0);
    expect(f.spending).toEqual({ low: 0, average: 0, high: 0 });
    expect(f.upcoming.items).toHaveLength(1);
    expect(f.projected.mid).toBe(4_700_000);
  });

  it('Februari tahun kabisat', () => {
    expect(computeForecast(input({ today: '2028-02-10' })).daysLeft).toBe(19);
    expect(computeForecast(input({ today: '2027-02-10' })).daysLeft).toBe(18);
  });

  it('pengeluaran di luar jendela 30 hari / hari ini diabaikan', () => {
    const f = computeForecast(
      input({
        expenses: [
          { date: '2026-10-10', amount: 9_000_000 },
          { date: '2026-09-09', amount: 9_000_000 },
          { date: '2026-09-10', amount: 300_000 },
        ],
      }),
    );
    expect(f.daily.average).toBe(10_000);
  });

  it('status: tight bila pesimis minus, short bila perkiraan tengah minus', () => {
    const tight = computeForecast(
      input({
        balance: 2_000_000,
        expenses: daily('2026-10-10', 30, (i) => (i < 7 ? 150_000 : 50_000)),
      }),
    );
    expect(tight.projected.low).toBeLessThan(0);
    expect(tight.projected.mid).toBeGreaterThanOrEqual(0);
    expect(tight.status).toBe('tight');

    const short = computeForecast(
      input({ balance: 500_000, expenses: daily('2026-10-10', 30, 100_000) }),
    );
    expect(short.status).toBe('short');
  });

  it('item terjadwal diurutkan menurut tanggal; kejadian menunggu konfirmasi tetap dihitung', () => {
    const f = computeForecast(
      input({
        upcoming: [bill({ date: '2026-10-28' }), bill({ date: '2026-10-05', status: 'pending' })],
      }),
    );
    expect(f.upcoming.items.map((u) => u.date)).toEqual(['2026-10-05', '2026-10-28']);
    expect(f.upcoming.expense).toBe(600_000);
  });
});
