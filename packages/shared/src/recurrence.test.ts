import { describe, expect, it } from 'vitest';
import {
  describeRecurrence,
  firstIndexOnOrAfter,
  occurrenceDate,
  type RecurrenceSchedule,
} from './recurrence';

const monthly = (startDate: string, interval = 1): RecurrenceSchedule => ({
  startDate,
  frequency: 'MONTHLY',
  interval,
});

describe('occurrenceDate', () => {
  it('tanggal 31 jatuh di hari terakhir bulan pendek lalu kembali ke 31', () => {
    const s = monthly('2026-01-31');
    expect([0, 1, 2, 3].map((i) => occurrenceDate(s, i))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('29 Februari tahunan jatuh di 28 Februari pada tahun biasa', () => {
    const s: RecurrenceSchedule = { startDate: '2028-02-29', frequency: 'YEARLY', interval: 1 };
    expect(occurrenceDate(s, 1)).toBe('2029-02-28');
    expect(occurrenceDate(s, 4)).toBe('2032-02-29');
  });

  it('harian dan mingguan dengan interval, melewati pergantian tahun', () => {
    expect(occurrenceDate({ startDate: '2026-12-30', frequency: 'DAILY', interval: 2 }, 1)).toBe(
      '2027-01-01',
    );
    expect(occurrenceDate({ startDate: '2026-10-05', frequency: 'WEEKLY', interval: 2 }, 3)).toBe(
      '2026-11-16',
    );
  });

  it('bulanan dengan interval 3 melewati tahun', () => {
    expect(occurrenceDate(monthly('2026-11-15', 3), 1)).toBe('2027-02-15');
  });
});

describe('firstIndexOnOrAfter', () => {
  it('menemukan kejadian pertama pada atau sesudah tanggal', () => {
    const s = monthly('2026-01-25');
    expect(firstIndexOnOrAfter(s, '2026-01-01')).toBe(0);
    expect(firstIndexOnOrAfter(s, '2026-10-06')).toBe(9);
    expect(occurrenceDate(s, 9)).toBe('2026-10-25');
    expect(firstIndexOnOrAfter(s, '2026-10-25')).toBe(9);
    expect(firstIndexOnOrAfter(s, '2026-10-26')).toBe(10);
  });

  it('konsisten dengan occurrenceDate untuk banyak tanggal', () => {
    const schedules: RecurrenceSchedule[] = [
      monthly('2025-01-31'),
      { startDate: '2025-03-03', frequency: 'WEEKLY', interval: 3 },
      { startDate: '2024-02-29', frequency: 'YEARLY', interval: 1 },
      { startDate: '2025-06-10', frequency: 'DAILY', interval: 5 },
    ];
    for (const s of schedules) {
      for (let day = 0; day < 900; day += 7) {
        const date = new Date(Date.parse('2025-01-01') + day * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const i = firstIndexOnOrAfter(s, date);
        expect(occurrenceDate(s, i) >= date).toBe(true);
        if (i > 0) expect(occurrenceDate(s, i - 1) < date).toBe(true);
      }
    }
  });
});

describe('describeRecurrence', () => {
  it('menulis jadwal dalam bahasa sehari-hari', () => {
    expect(describeRecurrence(monthly('2026-10-25'))).toBe('Setiap tanggal 25');
    expect(describeRecurrence(monthly('2026-10-31'))).toBe('Setiap tanggal 31 (atau akhir bulan)');
    expect(describeRecurrence(monthly('2026-10-01', 3))).toBe('Setiap 3 bulan, tanggal 1');
    expect(describeRecurrence({ startDate: '2026-10-05', frequency: 'WEEKLY', interval: 1 })).toBe(
      'Setiap Senin',
    );
    expect(describeRecurrence({ startDate: '2026-10-05', frequency: 'WEEKLY', interval: 2 })).toBe(
      'Setiap 2 minggu, hari Senin',
    );
    expect(describeRecurrence({ startDate: '2026-08-17', frequency: 'YEARLY', interval: 1 })).toBe(
      'Setiap tahun, 17 Agustus',
    );
    expect(describeRecurrence({ startDate: '2026-08-17', frequency: 'DAILY', interval: 1 })).toBe(
      'Setiap hari',
    );
  });
});
