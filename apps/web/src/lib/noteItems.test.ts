import { describe, expect, it } from 'vitest';
import { splitNoteItems } from './noteItems';

describe('splitNoteItems', () => {
  it('memecah catatan hasil pindai struk', () => {
    expect(splitNoteItems('Indomaret: Indomie Goreng, Aqua 600ml, Roti Tawar +3 lainnya')).toEqual({
      merchant: 'Indomaret',
      items: [
        { name: 'Indomie Goreng', price: null },
        { name: 'Aqua 600ml', price: null },
        { name: 'Roti Tawar', price: null },
      ],
      more: 3,
    });
  });

  it('membaca harga di akhir tiap barang', () => {
    expect(
      splitNoteItems(
        'Indomaret: Indomie Goreng Rp6.200, Aqua 600ml Rp3.500, Kopi Rp 1.250.000, Gula',
      ),
    ).toEqual({
      merchant: 'Indomaret',
      items: [
        { name: 'Indomie Goreng', price: 6_200 },
        { name: 'Aqua 600ml', price: 3_500 },
        { name: 'Kopi', price: 1_250_000 },
        { name: 'Gula', price: null },
      ],
      more: 0,
    });
  });

  it('daftar berkoma tanpa toko, angka desimal tetap utuh', () => {
    expect(splitNoteItems('Beras 1,5 kg, telur, minyak')).toEqual({
      merchant: null,
      items: [
        { name: 'Beras 1,5 kg', price: null },
        { name: 'telur', price: null },
        { name: 'minyak', price: null },
      ],
      more: 0,
    });
  });

  it('catatan biasa tidak dipecah', () => {
    expect(splitNoteItems('Makan siang bareng tim')).toBeNull();
    expect(splitNoteItems('')).toBeNull();
    expect(splitNoteItems(null)).toBeNull();
  });
});
