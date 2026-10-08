import { describe, expect, it } from 'vitest';
import { debtProgress, debtReminder, debtSchedule, type DebtProgressInput } from './debt';
import { createDebtSchema, updateDebtSchema } from './schemas/debt';

const base: DebtProgressInput = {
  total: 1_000_000,
  installments: 3,
  firstDueDate: '2026-01-31',
  dueDate: null,
  paid: 0,
  today: '2026-01-10',
};
const run = (patch: Partial<DebtProgressInput>) => debtProgress({ ...base, ...patch });

describe('debtSchedule', () => {
  it('dibagi rata, sisa pembagian di angsuran terakhir, tanggal ikut akhir bulan', () => {
    expect(debtSchedule(1_000_000, 3, '2026-01-31', null)).toEqual([
      { index: 0, amount: 333_333, dueDate: '2026-01-31' },
      { index: 1, amount: 333_333, dueDate: '2026-02-28' },
      { index: 2, amount: 333_334, dueDate: '2026-03-31' },
    ]);
  });

  it('tanpa cicilan: satu tagihan di jatuh tempo (atau tanpa tanggal)', () => {
    expect(debtSchedule(500_000, null, null, '2026-05-01')).toEqual([
      { index: 0, amount: 500_000, dueDate: '2026-05-01' },
    ]);
    expect(debtSchedule(500_000, null, null, null)[0]!.dueDate).toBeNull();
    expect(debtSchedule(500_000, 1, '2026-06-01', null)[0]!.dueDate).toBe('2026-06-01');
  });
});

describe('debtProgress', () => {
  it('belum dibayar: angsuran pertama jadi berikutnya', () => {
    const p = run({});
    expect(p.remaining).toBe(1_000_000);
    expect(p.settled).toBe(false);
    expect(p.next?.index).toBe(0);
    expect(p.overdueAmount).toBe(0);
  });

  it('pembayaran dialokasikan berurutan: lunas, sebagian, belum', () => {
    const p = run({ paid: 500_000 });
    expect(p.schedule.map((s) => [s.status, s.paid])).toEqual([
      ['PAID', 333_333],
      ['PARTIAL', 166_667],
      ['UNPAID', 0],
    ]);
    expect(p.next?.index).toBe(1);
    expect(p.ratio).toBe(0.5);
  });

  it('angsuran lewat jatuh tempo dihitung sebagai tunggakan', () => {
    const p = run({ paid: 100_000, today: '2026-03-01' });
    expect(p.schedule.map((s) => s.overdue)).toEqual([true, true, false]);
    expect(p.overdueAmount).toBe(333_333 * 2 - 100_000);
  });

  it('lunas: tanpa angsuran berikutnya, sisa 0', () => {
    const p = run({ paid: 1_000_000, today: '2027-01-01' });
    expect(p.settled).toBe(true);
    expect(p.next).toBeNull();
    expect(p.overdueAmount).toBe(0);
  });
});

describe('debtReminder', () => {
  it('soon dalam 3 hari, overdue sesudah lewat, null bila masih jauh atau tanpa tanggal', () => {
    expect(debtReminder(run({ today: '2026-01-27' }), '2026-01-27')).toBeNull();
    expect(debtReminder(run({ today: '2026-01-28' }), '2026-01-28')).toMatchObject({
      index: 0,
      kind: 'soon',
      amount: 333_333,
    });
    expect(debtReminder(run({ today: '2026-01-31' }), '2026-01-31')?.kind).toBe('soon');
    expect(debtReminder(run({ paid: 100_000, today: '2026-02-01' }), '2026-02-01')).toMatchObject({
      index: 0,
      kind: 'overdue',
      amount: 233_333,
    });
    const noDate = debtProgress({ ...base, installments: null, firstDueDate: null });
    expect(debtReminder(noDate, '2030-01-01')).toBeNull();
  });
});

describe('createDebtSchema', () => {
  const ok = {
    direction: 'PAYABLE',
    counterparty: 'Budi',
    principal: 100_000,
    startDate: '2026-01-01',
  };

  it('default: tanpa bunga, sekali bayar, tanpa dompet', () => {
    expect(createDebtSchema.parse(ok)).toMatchObject({
      interest: 0,
      installments: null,
      dueDate: null,
      walletId: null,
    });
  });

  it('cicilan wajib tanggal angsuran pertama; jatuh tempo tidak sebelum tanggal pinjam', () => {
    expect(createDebtSchema.safeParse({ ...ok, installments: 3 }).success).toBe(false);
    expect(
      createDebtSchema.safeParse({ ...ok, installments: 3, firstDueDate: '2025-12-01' }).success,
    ).toBe(false);
    expect(createDebtSchema.safeParse({ ...ok, dueDate: '2025-12-31' }).success).toBe(false);
    expect(
      createDebtSchema.safeParse({ ...ok, installments: 3, firstDueDate: '2026-02-01' }).success,
    ).toBe(true);
  });

  it('update tidak bisa mengubah arah', () => {
    expect(updateDebtSchema.parse({ direction: 'RECEIVABLE', note: 'x' })).toEqual({ note: 'x' });
  });
});
