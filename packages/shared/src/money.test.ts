import { describe, expect, it } from 'vitest';
import { formatRupiah, parseRupiahInput } from './money';

describe('formatRupiah', () => {
  it('memformat dengan pemisah ribuan titik', () => {
    expect(formatRupiah(1250000)).toBe('Rp 1.250.000');
    expect(formatRupiah(0)).toBe('Rp 0');
  });

  it('memberi tanda untuk negatif dan opsi signed', () => {
    expect(formatRupiah(-25000)).toBe('-Rp 25.000');
    expect(formatRupiah(25000, { signed: true })).toBe('+Rp 25.000');
  });
});

describe('parseRupiahInput', () => {
  it('mengambil digit saja', () => {
    expect(parseRupiahInput('Rp 25.000')).toBe(25000);
    expect(parseRupiahInput('')).toBeNull();
    expect(parseRupiahInput('abc')).toBeNull();
  });
});
