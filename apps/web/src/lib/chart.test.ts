import { describe, expect, it } from 'vitest';
import { rupiahTicks } from './chart';

describe('rupiahTicks', () => {
  it('kelipatan 500 rb untuk pengeluaran bulanan ±5 jt', () => {
    expect(rupiahTicks(5_404_000)).toEqual([
      0, 500_000, 1_000_000, 1_500_000, 2_000_000, 2_500_000, 3_000_000, 3_500_000, 4_000_000,
      4_500_000, 5_000_000, 5_500_000,
    ]);
  });

  it('langkah lebih kecil untuk nominal kecil', () => {
    expect(rupiahTicks(120_000)).toEqual([
      0, 10_000, 20_000, 30_000, 40_000, 50_000, 60_000, 70_000, 80_000, 90_000, 100_000, 110_000,
      120_000,
    ]);
  });

  it('langkah membesar agar garis tidak terlalu rapat', () => {
    const ticks = rupiahTicks(40_000_000);
    expect(ticks.length - 1).toBeLessThanOrEqual(12);
    expect(ticks[1]).toBe(5_000_000);
    expect(ticks.at(-1)).toBe(40_000_000);
  });

  it('data kosong tetap punya sumbu', () => {
    expect(rupiahTicks(0)).toEqual([0, 500_000]);
  });
});
