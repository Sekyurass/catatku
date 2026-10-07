import { describe, expect, it } from 'vitest';
import { goalProgress, type GoalProgressInput } from './goal';

const base: GoalProgressInput = {
  target: 3_000_000,
  saved: 0,
  savedThisMonth: 0,
  deadline: '2026-12-31',
  startDate: '2026-10-07',
  today: '2026-10-07',
};
const run = (patch: Partial<GoalProgressInput>) => goalProgress({ ...base, ...patch });

describe('goalProgress', () => {
  it('target baru tanpa setoran: sesuai rencana, saran dibagi rata termasuk bulan ini', () => {
    expect(run({})).toEqual({
      remaining: 3_000_000,
      ratio: 0,
      status: 'on_track',
      monthsLeft: 3,
      overdue: false,
      suggestedMonthly: 1_000_000,
      dueThisMonth: 1_000_000,
    });
  });

  it('setoran bulan ini tidak mengecilkan saran per bulan, hanya sisa bulan ini', () => {
    const p = run({ saved: 1_000_000, savedThisMonth: 1_000_000 });
    expect(p.suggestedMonthly).toBe(1_000_000);
    expect(p.dueThisMonth).toBe(0);
    expect(p.ratio).toBeCloseTo(1 / 3);
    expect(p.status).toBe('on_track');
  });

  it('pergantian bulan: setoran bulan lalu masuk dasar hitungan, saran bulan baru dihitung ulang', () => {
    const p = run({ today: '2026-11-01', saved: 1_000_000, savedThisMonth: 0 });
    expect(p.monthsLeft).toBe(2);
    expect(p.suggestedMonthly).toBe(1_000_000);
    expect(p.dueThisMonth).toBe(1_000_000);
    expect(p.status).toBe('on_track');
  });

  it('bulan berganti tanpa setoran sama sekali: tertinggal dan saran naik', () => {
    const p = run({ today: '2026-11-01' });
    expect(p.status).toBe('behind');
    expect(p.suggestedMonthly).toBe(1_500_000);
  });

  it('mengejar ketertinggalan di bulan berjalan kembali sesuai rencana', () => {
    const p = run({ today: '2026-11-20', saved: 1_000_000, savedThisMonth: 1_000_000 });
    expect(p.status).toBe('on_track');
    expect(p.suggestedMonthly).toBe(1_500_000);
    expect(p.dueThisMonth).toBe(500_000);
  });

  it('saran dibulatkan ke atas ke ribuan, tetapi tidak melebihi kekurangan', () => {
    expect(run({ target: 1_000_000 }).suggestedMonthly).toBe(334_000);
    expect(run({ target: 1_500, deadline: '2026-10-31' }).suggestedMonthly).toBe(1_500);
  });

  it('tenggat hari ini masih dihitung satu bulan', () => {
    const p = run({ deadline: '2026-10-07', saved: 2_000_000 });
    expect(p.overdue).toBe(false);
    expect(p.monthsLeft).toBe(1);
    expect(p.suggestedMonthly).toBe(1_000_000);
  });

  it('tenggat lewat dan belum tercapai: tertinggal, seluruh sisa jadi saran', () => {
    const p = run({ today: '2027-01-02', saved: 2_500_000 });
    expect(p).toMatchObject({
      status: 'behind',
      overdue: true,
      monthsLeft: 0,
      suggestedMonthly: 500_000,
      dueThisMonth: 500_000,
    });
  });

  it('tercapai mengalahkan status lain, termasuk tenggat yang sudah lewat', () => {
    const p = run({ today: '2027-03-01', saved: 3_200_000 });
    expect(p).toMatchObject({
      status: 'achieved',
      remaining: 0,
      ratio: 1,
      suggestedMonthly: null,
      dueThisMonth: null,
    });
  });

  it('tanpa tenggat: tidak ada saran dan bulan tersisa', () => {
    const p = run({ deadline: null, saved: 500_000 });
    expect(p).toMatchObject({
      status: 'no_deadline',
      monthsLeft: null,
      suggestedMonthly: null,
      dueThisMonth: null,
    });
    expect(p.ratio).toBeCloseTo(1 / 6);
  });

  it('melewati pergantian tahun', () => {
    expect(run({ today: '2026-12-15', deadline: '2027-02-10' }).monthsLeft).toBe(3);
  });

  it('tanggal dibuat setelah hari ini (selisih zona waktu) tetap dianggap bulan pertama', () => {
    expect(run({ startDate: '2026-11-01', today: '2026-10-31' }).status).toBe('on_track');
  });

  it('saldo negatif dianggap nol', () => {
    const p = run({ saved: -50_000, savedThisMonth: -50_000 });
    expect(p.ratio).toBe(0);
    expect(p.remaining).toBe(3_000_000);
  });
});
