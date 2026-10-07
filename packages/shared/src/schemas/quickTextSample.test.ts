import { describe, expect, it } from 'vitest';
import { correctedFields, maskSensitive, type QuickTextValues } from './quickTextSample';

describe('maskSensitive', () => {
  it.each([
    ['tf 500rb ke 0812-3456-7890', 'tf 500rb ke [nomor]'],
    ['transfer ke +62 812 3456 7890 200k', 'transfer ke [nomor] 200k'],
    ['kirim ke 6281234567890', 'kirim ke [nomor]'],
    ['tf ke rek 1234567890 bca 1jt', 'tf ke rek [nomor] bca 1jt'],
    ['rek 123-456-7890', 'rek [nomor]'],
    ['bayar ke budi@contoh.id 50rb', 'bayar ke [email] 50rb'],
    ['nik 3171234567890001', 'nik [nomor]'],
  ])('%s', (input, expected) => {
    expect(maskSensitive(input)).toBe(expected);
  });

  it.each([
    'makan siang 25rb',
    'gaji 5.000.000 masuk bca',
    'beli hp 3500000',
    'Rp 15.000 parkir tgl 3/10',
    'transfer 1500000 2500000',
    'top up gopay 100000 kemarin',
  ])('nominal & tanggal tidak tersamar: %s', (input) => {
    expect(maskSensitive(input)).toBe(input);
  });
});

describe('correctedFields', () => {
  const base: QuickTextValues = {
    type: 'EXPENSE',
    amount: 25_000,
    dateOffset: 0,
    wallet: { name: 'Tunai', type: 'CASH' },
    toWallet: null,
    category: 'Makan',
    note: 'Makan siang',
  };

  it('kosong bila tidak ada yang diubah', () => {
    expect(correctedFields(base, { ...base })).toEqual([]);
  });

  it('mendaftar isian yang berbeda, termasuk objek dompet', () => {
    expect(
      correctedFields(base, {
        ...base,
        amount: 30_000,
        wallet: { name: 'BCA', type: 'BANK' },
        category: null,
      }),
    ).toEqual(['amount', 'wallet', 'category']);
  });
});
