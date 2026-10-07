import { describe, expect, it } from 'vitest';
import { splitNoteItems } from './noteItems';

describe('splitNoteItems', () => {
  it('memecah catatan hasil pindai struk', () => {
    expect(splitNoteItems('Indomaret: Indomie Goreng, Aqua 600ml, Roti Tawar +3 lainnya')).toEqual({
      merchant: 'Indomaret',
      items: ['Indomie Goreng', 'Aqua 600ml', 'Roti Tawar'],
      more: 3,
    });
  });

  it('daftar berkoma tanpa toko, angka desimal tetap utuh', () => {
    expect(splitNoteItems('Beras 1,5 kg, telur, minyak')).toEqual({
      merchant: null,
      items: ['Beras 1,5 kg', 'telur', 'minyak'],
      more: 0,
    });
  });

  it('catatan biasa tidak dipecah', () => {
    expect(splitNoteItems('Makan siang bareng tim')).toBeNull();
    expect(splitNoteItems('')).toBeNull();
    expect(splitNoteItems(null)).toBeNull();
  });
});
