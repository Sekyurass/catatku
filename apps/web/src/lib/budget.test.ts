import { describe, expect, it } from 'vitest';
import { budgetMessage, budgetPercent, remainingLabel } from './budget';

const category = { id: 'c', name: 'Makan', icon: 'utensils', color: '#000' };

describe('pesan anggaran', () => {
  it('peringatan menyebut persen dan sisa', () => {
    expect(budgetMessage({ category, ratio: 0.85, remaining: 150_000 })).toBe(
      'Anggaran Makan sudah 85%, sisa Rp 150.000.',
    );
  });

  it('tepat habis dan terlampaui', () => {
    expect(budgetMessage({ category, ratio: 1, remaining: 0 })).toBe('Anggaran Makan sudah habis.');
    expect(budgetMessage({ category, ratio: 1.3, remaining: -60_000 })).toBe(
      'Anggaran Makan terlampaui Rp 60.000.',
    );
  });

  it('persen tidak dibulatkan ke atas menjadi 100%', () => {
    expect(budgetPercent(0.999)).toBe(99);
  });

  it('label sisa / lewat', () => {
    expect(remainingLabel(150_000)).toBe('Sisa Rp 150.000');
    expect(remainingLabel(0)).toBe('Sisa Rp 0');
    expect(remainingLabel(-60_000)).toBe('Lewat Rp 60.000');
  });
});
