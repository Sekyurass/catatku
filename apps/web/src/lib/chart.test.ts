import { describe, expect, it } from 'vitest';
import type { CategoryBreakdownItem } from '@catatku/shared';
import { groupCategories, rupiahTicks } from './chart';

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

describe('groupCategories', () => {
  const item = (n: number, total: number): CategoryBreakdownItem => ({
    categoryId: `c${n}`,
    name: `Kategori ${n}`,
    icon: 'tag',
    color: '#000',
    total,
    ratio: total / 1000,
    count: 1,
  });

  it('tidak mengubah daftar yang sudah pendek', () => {
    const items = [item(1, 600), item(2, 400)];
    expect(groupCategories(items)).toBe(items);
  });

  it('menggabungkan sisa kategori menjadi "Lainnya"', () => {
    const items = [500, 200, 100, 80, 70, 50].map((t, i) => item(i, t));
    const grouped = groupCategories(items);
    expect(grouped).toHaveLength(5);
    expect(grouped.slice(0, 4)).toEqual(items.slice(0, 4));
    expect(grouped[4]).toMatchObject({
      categoryId: null,
      name: '2 kategori lainnya',
      total: 120,
      count: 2,
    });
    expect(grouped[4]?.ratio).toBeCloseTo(0.12);
  });
});
