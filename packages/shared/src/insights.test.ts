import { describe, expect, it } from 'vitest';
import { computeInsights, type InsightExpense, type InsightsInput } from './insights';

const makan = { id: 'cat_makan', name: 'Makan', icon: 'utensils', color: '#F97316' };
const hiburan = { id: 'cat_hiburan', name: 'Hiburan', icon: 'clapperboard', color: '#8B5CF6' };
const belanja = { id: 'cat_belanja', name: 'Belanja', icon: 'shopping-bag', color: '#0EA5E9' };

let seq = 0;
const tx = (date: string, amount: number, patch: Partial<InsightExpense> = {}): InsightExpense => ({
  id: `t${++seq}`,
  date,
  amount,
  note: null,
  categoryId: 'cat_makan',
  walletId: 'w1',
  recurringRuleId: null,
  ...patch,
});

const run = (patch: Partial<InsightsInput>) =>
  computeInsights({
    today: '2026-10-15',
    expenses: [],
    categories: [makan, hiburan, belanja],
    budgets: [],
    recurringNotes: [],
    ...patch,
  });

describe('computeInsights', () => {
  it('tanpa data: tidak ada insight', () => {
    expect(run({})).toEqual([]);
  });

  describe('perubahan kategori', () => {
    it('membandingkan periode yang sama bulan lalu', () => {
      const [insight, ...rest] = run({
        expenses: [
          tx('2026-10-03', 300_000),
          tx('2026-10-10', 200_000),
          tx('2026-09-05', 300_000),
          // Di luar periode pembanding (sesudah tanggal 15 bulan lalu): tidak dihitung.
          tx('2026-09-20', 900_000),
        ],
      });
      expect(rest).toEqual([]);
      expect(insight).toMatchObject({
        id: 'category_change:2026-10:cat_makan:up',
        kind: 'category_change',
        tone: 'warning',
        priority: 'medium',
        title: 'Makan naik 67% dari bulan lalu',
        body: 'Rp 500.000 sampai 15 Okt, dibanding Rp 300.000 di periode yang sama bulan lalu.',
        detail: {
          current: 500_000,
          previous: 300_000,
          previousRange: { start: '2026-09-01', end: '2026-09-15' },
        },
      });
      if (insight?.kind !== 'category_change') throw new Error();
      expect(insight.detail.topTransactions.map((t) => t.amount)).toEqual([300_000, 200_000]);
    });

    it('turun ditandai positif; perubahan kecil diabaikan', () => {
      const insights = run({
        expenses: [
          tx('2026-10-02', 100_000),
          tx('2026-09-02', 400_000),
          tx('2026-10-02', 110_000, { categoryId: 'cat_hiburan' }),
          tx('2026-09-02', 100_000, { categoryId: 'cat_hiburan' }),
        ],
      });
      expect(insights).toHaveLength(1);
      expect(insights[0]).toMatchObject({
        tone: 'positive',
        title: 'Makan turun 75% dari bulan lalu',
      });
    });

    it('awal bulan dan kategori tanpa data bulan lalu tidak dibandingkan', () => {
      const expenses = [tx('2026-10-01', 500_000), tx('2026-09-01', 100_000)];
      expect(run({ today: '2026-10-04', expenses })).toEqual([]);
      expect(run({ expenses: [tx('2026-10-02', 500_000)] })).toEqual([]);
    });

    it('bulan lalu lebih pendek: periode pembanding berhenti di akhir bulan', () => {
      const [insight] = run({
        today: '2026-03-31',
        expenses: [tx('2026-03-10', 600_000), tx('2026-02-28', 200_000)],
      });
      expect(insight).toMatchObject({
        detail: { previousRange: { start: '2026-02-01', end: '2026-02-28' } },
      });
    });
  });

  describe('laju anggaran', () => {
    it('memperkirakan tanggal habis dan batas harian', () => {
      const [insight] = run({
        budgets: [{ categoryId: 'cat_makan', limitAmount: 1_000_000, spent: 600_000 }],
      });
      // 600rb / 15 hari = 40rb/hari -> 1,24 jt sebulan; habis di hari ke-25.
      expect(insight).toMatchObject({
        id: 'budget_pace:2026-10:cat_makan',
        priority: 'medium',
        title: 'Anggaran Makan bisa habis sekitar 25 Okt',
        detail: { projected: 1_240_000, runOutDate: '2026-10-25', dailyAllowance: 23_529 },
      });
    });

    it('prioritas tinggi bila habis dalam seminggu', () => {
      const [insight] = run({
        budgets: [{ categoryId: 'cat_makan', limitAmount: 1_000_000, spent: 900_000 }],
      });
      expect(insight).toMatchObject({ priority: 'high', detail: { runOutDate: '2026-10-17' } });
    });

    it('aman, sudah lewat batas, atau terlalu awal bulan: tidak ada insight', () => {
      expect(
        run({ budgets: [{ categoryId: 'cat_makan', limitAmount: 1_000_000, spent: 450_000 }] }),
      ).toEqual([]);
      expect(
        run({ budgets: [{ categoryId: 'cat_makan', limitAmount: 1_000_000, spent: 1_100_000 }] }),
      ).toEqual([]);
      expect(
        run({
          today: '2026-10-02',
          budgets: [{ categoryId: 'cat_makan', limitAmount: 1_000_000, spent: 500_000 }],
        }),
      ).toEqual([]);
    });
  });

  describe('langganan', () => {
    const netflix = (date: string, amount = 54_000) =>
      tx(date, amount, { note: 'Netflix', categoryId: 'cat_hiburan' });

    it('nominal mirip sebulan sekali terdeteksi, dengan tanggal berikutnya', () => {
      const [insight] = run({ expenses: [netflix('2026-08-20'), netflix('2026-09-20')] });
      expect(insight).toMatchObject({
        id: 'new_subscription:netflix',
        kind: 'new_subscription',
        title: 'Sepertinya ada langganan: Netflix',
        detail: {
          amount: 54_000,
          lastDate: '2026-09-20',
          nextDate: '2026-10-20',
          averageGapDays: 31,
          category: hiburan,
          walletId: 'w1',
        },
      });
    });

    it('tagihan berikutnya paling cepat hari ini, tidak pernah mundur', () => {
      const [insight] = run({ expenses: [netflix('2026-09-15'), netflix('2026-10-15')] });
      expect(insight).toMatchObject({ detail: { nextDate: '2026-11-15' } });
    });

    it('diabaikan bila sudah jadi transaksi berulang, jarak tidak bulanan, atau sudah lama', () => {
      const expenses = [netflix('2026-08-20'), netflix('2026-09-20')];
      expect(run({ expenses, recurringNotes: ['netflix 54rb'] })).toEqual([]);
      expect(run({ expenses, recurringNotes: ['Langganan Netflix'] })).toEqual([]);
      expect(run({ expenses, recurringNotes: ['Spotify', null] })).toHaveLength(1);
      expect(run({ expenses: [netflix('2026-09-01'), netflix('2026-09-20')] })).toEqual([]);
      expect(run({ expenses: [netflix('2026-07-01'), netflix('2026-08-01')] })).toEqual([]);
      expect(run({ expenses: [netflix('2026-08-20'), netflix('2026-09-20', 120_000)] })).toEqual(
        [],
      );
      expect(
        run({
          expenses: [netflix('2026-08-20'), { ...netflix('2026-09-20'), recurringRuleId: 'r1' }],
        }),
      ).toEqual([]);
    });
  });

  describe('pengeluaran tak biasa', () => {
    const history = ['2026-07-20', '2026-08-05', '2026-08-20', '2026-09-05', '2026-09-20'].map(
      (d) => tx(d, 100_000, { categoryId: 'cat_belanja' }),
    );

    const unusual = (expenses: InsightExpense[]) =>
      run({ expenses }).filter((i) => i.kind === 'unusual_expense');

    it('jauh di atas median 90 hari terakhir', () => {
      const [insight] = unusual([
        ...history,
        tx('2026-10-10', 600_000, { categoryId: 'cat_belanja', note: 'Tokopedia: Rice cooker' }),
      ]);
      expect(insight).toMatchObject({
        kind: 'unusual_expense',
        priority: 'medium',
        title: 'Pengeluaran Belanja lebih besar dari biasanya',
        body: 'Rp 600.000 untuk "Tokopedia: Rice cooker" pada 10 Okt, sekitar 6× pengeluaran Belanja yang biasa (Rp 100.000).',
        detail: { median: 100_000, multiple: 6, sampleSize: 5 },
      });
    });

    it('butuh cukup riwayat, nominal minimum, dan masih dalam 14 hari', () => {
      const big = (date: string, amount = 600_000) =>
        tx(date, amount, { categoryId: 'cat_belanja' });
      expect(unusual([...history.slice(1), big('2026-10-10')])).toEqual([]);
      expect(
        unusual([...history.map((h) => ({ ...h, amount: 50_000 })), big('2026-10-10', 190_000)]),
      ).toEqual([]);
      expect(unusual([...history, big('2026-09-30')])).toEqual([]);
    });
  });

  it('urut: prioritas tinggi dulu', () => {
    const insights = run({
      expenses: [tx('2026-10-03', 500_000), tx('2026-09-05', 300_000)],
      budgets: [{ categoryId: 'cat_hiburan', limitAmount: 1_000_000, spent: 900_000 }],
    });
    expect(insights.map((i) => i.kind)).toEqual(['budget_pace', 'category_change']);
  });
});
