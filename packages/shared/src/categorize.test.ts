import { describe, expect, it } from 'vitest';
import { merchantKey, normalizeCategoryText, suggestCategoryByKeyword } from './categorize';

/** Catatan yang biasa diketik pengguna / hasil pindai struk, dengan kategori yang benar. */
const EXPENSE_SAMPLES: [string, string | null][] = [
  ['Makan siang di warteg', 'cat_makan'],
  ['nasi padang', 'cat_makan'],
  ['GoFood ayam geprek', 'cat_makan'],
  ['Kopi Kenangan', 'cat_makan'],
  ["McDonald's", 'cat_makan'],
  ['Hotways Chicken Bali: Strawberry Orange Milk, Paha Atas Crispy', 'cat_makan'],
  ['Mie Gacoan: Mie Hompimpa LV, Es Gobak Sodor', 'cat_makan'],
  ['Starbucks: Caffe Latte Grande, Butter Croissant', 'cat_makan'],
  ['sarapan bubur', 'cat_makan'],
  ['jajan martabak', 'cat_makan'],
  ['es teh manis', 'cat_makan'],
  ['bakso pak kumis', 'cat_makan'],
  ['Isi bensin pertalite', 'cat_transport'],
  ['Pertamina', 'cat_transport'],
  ['gojek ke kantor', 'cat_transport'],
  ['Grab car bandara', 'cat_transport'],
  ['parkir mall', 'cat_transport'],
  ['bayar tol', 'cat_transport'],
  ['KRL', 'cat_transport'],
  ['Bengkel Motor Jaya Abadi: Ganti Oli MPX, Kampas Rem Depan', 'cat_transport'],
  ['tambal ban', 'cat_transport'],
  ['Indomaret: Indomie GRG SPC, Aqua 600ml, Roti Tawar Sari', 'cat_belanja'],
  ['Alfamart: Susu UHT Coklat, Sabun Mandi', 'cat_belanja'],
  ['Superindo: Minyak Goreng 2L, Telur Ayam 1kg', 'cat_belanja'],
  ['belanja bulanan', 'cat_belanja'],
  ['beli sayur di pasar', 'cat_belanja'],
  ['checkout shopee', 'cat_belanja'],
  ['Tokopedia sepatu', 'cat_belanja'],
  ['isi galon', 'cat_belanja'],
  ['beli baju lebaran', 'cat_belanja'],
  ['token listrik', 'cat_tagihan'],
  ['Bayar PLN', 'cat_tagihan'],
  ['wifi indihome', 'cat_tagihan'],
  ['pulsa telkomsel', 'cat_tagihan'],
  ['bayar kos', 'cat_tagihan'],
  ['cicilan motor', 'cat_tagihan'],
  ['BPJS', 'cat_tagihan'],
  ['PDAM', 'cat_tagihan'],
  ['nonton di XXI', 'cat_hiburan'],
  ['langganan netflix', 'cat_hiburan'],
  ['Spotify', 'cat_hiburan'],
  ['karaoke bareng', 'cat_hiburan'],
  ['top up game', 'cat_hiburan'],
  ['hotel liburan', 'cat_hiburan'],
  ['Apotek K24: Paracetamol 500mg, Vitamin C', 'cat_kesehatan'],
  ['beli obat', 'cat_kesehatan'],
  ['periksa ke dokter', 'cat_kesehatan'],
  ['Klinik gigi', 'cat_kesehatan'],
  ['bayar SPP', 'cat_pendidikan'],
  ['les bahasa inggris', 'cat_pendidikan'],
  ['beli buku', 'cat_pendidikan'],
  ['Gramedia', 'cat_pendidikan'],
  ['fotokopi', 'cat_pendidikan'],
  ['Transfer ke ibu', null],
  ['Toko Bangunan Sinar Jaya', 'cat_belanja'],
  ['Kafe Senja: Kopi Susu Aren, Croissant', 'cat_makan'],
];

const INCOME_SAMPLES: [string, string | null][] = [
  ['Gaji Oktober', 'cat_gaji'],
  ['gajian', 'cat_gaji'],
  ['THR', 'cat_gaji'],
  ['bonus tahunan', 'cat_gaji'],
  ['honor ngajar', 'cat_gaji'],
  ['uang lembur', 'cat_gaji'],
  ['dikasih ibu', null],
];

describe('saran kategori dari kata kunci', () => {
  const run = (samples: [string, string | null][], type: 'EXPENSE' | 'INCOME') =>
    samples.map(([note, expected]) => ({
      note,
      expected,
      got: suggestCategoryByKeyword(note, type),
    }));
  const results = [...run(EXPENSE_SAMPLES, 'EXPENSE'), ...run(INCOME_SAMPLES, 'INCOME')];

  it.each(results.map((r) => [r.note, r] as const))('%s', (_note, { expected, got }) => {
    expect(got).toBe(expected);
  });

  it('akurasi dataset memenuhi target dan tidak pernah salah jenis', () => {
    const correct = results.filter((r) => r.got === r.expected).length / results.length;
    console.info('Akurasi kamus kategori', { correct, n: results.length });
    expect(results.length).toBeGreaterThanOrEqual(50);
    expect(correct).toBeGreaterThanOrEqual(0.9);
    for (const [note] of EXPENSE_SAMPLES) {
      expect(suggestCategoryByKeyword(note, 'EXPENSE')).not.toBe('cat_gaji');
    }
    expect(suggestCategoryByKeyword('Gaji Oktober', 'EXPENSE')).toBeNull();
  });

  it('frasa terpanjang menang dan nama toko lebih berbobot dari barang', () => {
    expect(suggestCategoryByKeyword('telur ayam', 'EXPENSE')).toBe('cat_belanja');
    expect(suggestCategoryByKeyword('ayam goreng', 'EXPENSE')).toBe('cat_makan');
    expect(suggestCategoryByKeyword('Indomaret: Kopi, Roti Bakar', 'EXPENSE')).toBe('cat_belanja');
  });

  it('kata tidak dicocokkan di tengah kata lain', () => {
    expect(suggestCategoryByKeyword('kosmetik', 'EXPENSE')).toBeNull();
    expect(suggestCategoryByKeyword('pastel', 'EXPENSE')).toBeNull();
  });
});

describe('merchantKey', () => {
  it('memakai nama toko dari catatan struk dan membuang angka', () => {
    expect(merchantKey('Hotways Chicken Bali: Strawberry Orange Milk')).toBe(
      'hotways chicken bali',
    );
    expect(merchantKey('Makan siang 25rb')).toBe('makan siang');
    expect(merchantKey('  Kopi   Kenangan!! ')).toBe('kopi kenangan');
    expect(merchantKey('123')).toBeNull();
    expect(merchantKey('')).toBeNull();
    expect(merchantKey('x'.repeat(100))!.length).toBe(60);
  });

  it('normalisasi teks', () => {
    expect(normalizeCategoryText("McDonald's Go-Food")).toBe('mcdonalds go food');
  });
});
