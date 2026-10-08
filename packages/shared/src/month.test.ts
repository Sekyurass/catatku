import { describe, expect, it } from 'vitest';
import {
  currentMonth,
  defaultTimeZone,
  isTimeZoneId,
  lastMonths,
  matchTimeZone,
  monthRange,
  setTimeZoneResolver,
  shiftMonth,
  toDateString,
} from './month';

describe('month utils', () => {
  it('shiftMonth melewati batas tahun', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-10', -12)).toBe('2025-10');
  });

  it('monthRange menghitung hari terakhir termasuk kabisat', () => {
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthRange('2028-02').end).toBe('2028-02-29');
    expect(monthRange('2026-10').end).toBe('2026-10-31');
  });

  it('lastMonths urut naik', () => {
    expect(lastMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });

  it('toDateString memakai zona Asia/Jakarta', () => {
    // 2026-10-05T18:00Z = 6 Okt 01:00 WIB
    const instant = new Date('2026-10-05T18:00:00Z');
    expect(toDateString(instant)).toBe('2026-10-06');
    expect(currentMonth(new Date('2026-10-31T17:30:00Z'))).toBe('2026-11');
  });

  it('zona bawaan mengikuti resolver', () => {
    // 2026-10-05T16:30Z = 23:30 WIB, 00:30 WITA, 01:30 WIT
    const instant = new Date('2026-10-05T16:30:00Z');
    try {
      setTimeZoneResolver(() => 'Asia/Jayapura');
      expect(defaultTimeZone()).toBe('Asia/Jayapura');
      expect(toDateString(instant)).toBe('2026-10-06');
      expect(toDateString(instant, 'Asia/Jakarta')).toBe('2026-10-05');
    } finally {
      setTimeZoneResolver(null);
    }
    expect(toDateString(instant)).toBe('2026-10-05');
    expect(isTimeZoneId('Asia/Makassar')).toBe(true);
    expect(isTimeZoneId('Asia/Tokyo')).toBe(false);
    expect(matchTimeZone('Asia/Pontianak')).toBe('Asia/Jakarta');
    expect(matchTimeZone('Asia/Jayapura')).toBe('Asia/Jayapura');
    expect(matchTimeZone('Europe/Berlin')).toBeUndefined();
  });
});
