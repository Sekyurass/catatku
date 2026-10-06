import { describe, expect, it } from 'vitest';
import { rupiahTicks } from './chart';

describe('rupiahTicks', () => {
  it('kelipatan 1 jt untuk nominal bulanan ±5 jt', () => {
    expect(rupiahTicks(5_404_000)).toEqual([
      0, 1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000,
    ]);
  });

  it('kelipatan 500 rb untuk nominal ±3 jt', () => {
    expect(rupiahTicks(2_965_000)).toEqual([
      0, 500_000, 1_000_000, 1_500_000, 2_000_000, 2_500_000, 3_000_000,
    ]);
  });

  it('langkah lebih kecil untuk nominal kecil', () => {
    expect(rupiahTicks(120_000)).toEqual([0, 25_000, 50_000, 75_000, 100_000, 125_000]);
  });

  it('tidak pernah lebih dari 8 garis', () => {
    for (const max of [1, 99_999, 7_300_000, 40_000_000, 3_000_000_000]) {
      expect(rupiahTicks(max).length).toBeLessThanOrEqual(8);
    }
  });

  it('data kosong tetap punya sumbu', () => {
    expect(rupiahTicks(0)).toEqual([0, 500_000]);
  });
});
