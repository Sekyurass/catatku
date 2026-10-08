import { describe, expect, it } from 'vitest';
import type { ReceiptScanResult } from '.';
import { flattenLighting, stretchContrast } from './image';
import { mergeScans, needsSecondPass } from './tesseract';

const scan = (over: Partial<ReceiptScanResult>): ReceiptScanResult => ({
  total: null,
  date: null,
  merchant: null,
  items: [],
  text: '',
  ...over,
});

describe('pengolahan foto struk', () => {
  it('meregangkan kontras foto pudar ke hitam–putih penuh', () => {
    const gray = new Uint8ClampedArray(1000);
    for (let i = 0; i < gray.length; i++) gray[i] = i % 10 === 0 ? 120 : 200;
    stretchContrast(gray);
    expect(Math.min(...gray)).toBe(0);
    expect(Math.max(...gray)).toBe(255);
  });

  it('membiarkan gambar polos tanpa kontras', () => {
    const gray = new Uint8ClampedArray(100).fill(180);
    stretchContrast(gray);
    expect(gray.every((v) => v === 180)).toBe(true);
  });

  it('meratakan bayangan: kertas terang dan kertas berbayang jadi sama-sama putih, huruf tetap gelap', () => {
    const width = 200;
    const height = 100;
    const gray = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const paper = x < width / 2 ? 230 : 110; // separuh kanan tertutup bayangan
        const ink = x % 20 < 2 && y % 10 < 6;
        gray[y * width + x] = ink ? paper * 0.35 : paper;
      }
    }
    const out = flattenLighting(gray, width, height);
    const at = (x: number, y: number) => out[y * width + x]!;
    expect(at(55, 50)).toBeGreaterThan(200);
    expect(at(155, 50)).toBeGreaterThan(200);
    expect(at(40, 50)).toBeLessThan(110);
    expect(at(140, 50)).toBeLessThan(110);
  });
});

describe('bacaan ulang', () => {
  const highTotal = { value: 54_300, confidence: 'high' as const };
  const lowTotal = { value: 5_430, confidence: 'low' as const };
  const date = { value: '2026-10-07', confidence: 'high' as const };

  it('tidak dibaca ulang bila total yakin dan ada dua isian', () => {
    expect(needsSecondPass(scan({ total: highTotal, date }))).toBe(false);
  });

  it('dibaca ulang bila total tidak ada, kurang yakin, atau isian terlalu sedikit', () => {
    expect(needsSecondPass(scan({ date }))).toBe(true);
    expect(needsSecondPass(scan({ total: lowTotal, date }))).toBe(true);
    expect(needsSecondPass(scan({ total: highTotal }))).toBe(true);
  });

  it('menggabungkan per isian: yang yakin menang, lalu bacaan pertama', () => {
    const merged = mergeScans(
      scan({ total: lowTotal, merchant: { value: 'Indomaret', confidence: 'high' } }),
      scan({
        total: highTotal,
        date,
        items: [{ name: 'Indomie', price: 3_500 }],
      }),
    );
    expect(merged.total).toEqual(highTotal);
    expect(merged.date).toEqual(date);
    expect(merged.merchant?.value).toBe('Indomaret');
    expect(merged.items).toHaveLength(1);
  });
});
