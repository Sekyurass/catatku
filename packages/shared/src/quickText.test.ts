import { describe, expect, it } from 'vitest';
import {
  parseQuickText,
  type QuickTextCategory,
  type QuickTextContext,
  type QuickTextResult,
  type QuickTextWallet,
} from './quickText';

// Rabu, 7 Oktober 2026.
const TODAY = '2026-10-07';

const WALLETS: QuickTextWallet[] = [
  { id: 'w_cash', name: 'Tunai', type: 'CASH' },
  { id: 'w_bca', name: 'BCA', type: 'BANK' },
  { id: 'w_mandiri', name: 'Mandiri', type: 'BANK' },
  { id: 'w_gopay', name: 'GoPay', type: 'EWALLET' },
  { id: 'w_ovo', name: 'OVO', type: 'EWALLET' },
  { id: 'w_tab', name: 'Tabungan Rumah', type: 'BANK' },
];

const CATEGORIES: QuickTextCategory[] = [
  { id: 'cat_makan', name: 'Makan', type: 'EXPENSE' },
  { id: 'cat_transport', name: 'Transport', type: 'EXPENSE' },
  { id: 'cat_belanja', name: 'Belanja', type: 'EXPENSE' },
  { id: 'cat_tagihan', name: 'Tagihan', type: 'EXPENSE' },
  { id: 'cat_hiburan', name: 'Hiburan', type: 'EXPENSE' },
  { id: 'cat_kesehatan', name: 'Kesehatan', type: 'EXPENSE' },
  { id: 'cat_pendidikan', name: 'Pendidikan', type: 'EXPENSE' },
  { id: 'cat_lainnya_keluar', name: 'Lainnya', type: 'EXPENSE' },
  { id: 'cat_kopi', name: 'Kopi', type: 'EXPENSE' },
  { id: 'cat_gaji', name: 'Gaji', type: 'INCOME' },
  { id: 'cat_freelance', name: 'Freelance', type: 'INCOME' },
  { id: 'cat_lainnya_masuk', name: 'Lainnya', type: 'INCOME' },
];

const CTX: QuickTextContext = { today: TODAY, wallets: WALLETS, categories: CATEGORIES };
const parse = (text: string, ctx: Partial<QuickTextContext> = {}) =>
  parseQuickText(text, { ...CTX, ...ctx });

interface Expected {
  type?: QuickTextResult['type'];
  amount: number | null;
  date?: string | null;
  wallet?: string | null;
  to?: string | null;
  category?: string | null;
  note?: string;
}

/**
 * Set uji 3.3: kalimat seperti yang diketik pengguna, dengan isian yang diharapkan. Kolom yang
 * tidak disebut diharapkan kosong (tanggal null = hari ini, dompet null = bawaan form, jenis =
 * pengeluaran). Target: ≥ 95% kalimat terbaca benar seluruhnya.
 */
const DATASET: Array<[string, Expected]> = [
  // Contoh dari spesifikasi
  [
    'makan siang 25rb di warteg',
    { amount: 25_000, category: 'cat_makan', note: 'Makan siang di warteg' },
  ],
  [
    'gaji 5jt masuk bca kemarin',
    {
      type: 'INCOME',
      amount: 5_000_000,
      date: '2026-10-06',
      wallet: 'w_bca',
      category: 'cat_gaji',
      note: 'Gaji',
    },
  ],
  [
    'transfer 200k bca ke gopay',
    { type: 'TRANSFER', amount: 200_000, wallet: 'w_bca', to: 'w_gopay', note: '' },
  ],
  // Singkatan nominal
  ['kopi susu 18rb', { amount: 18_000, category: 'cat_kopi' }],
  ['bensin 30 ribu', { amount: 30_000, category: 'cat_transport' }],
  ['beli sepatu 1,5jt', { amount: 1_500_000, category: 'cat_belanja' }],
  ['servis motor 1.2jt', { amount: 1_200_000, category: 'cat_transport' }],
  ['es teh 5k', { amount: 5_000, category: 'cat_makan' }],
  ['parkir 2000', { amount: 2_000, category: 'cat_transport' }],
  ['bayar listrik 350.000', { amount: 350_000, category: 'cat_tagihan' }],
  ['Rp 15.000 fotokopi', { amount: 15_000, category: 'cat_pendidikan' }],
  ['rp25000 tambal ban', { amount: 25_000, category: 'cat_transport' }],
  ['gorengan goceng', { amount: 5_000, category: 'cat_makan' }],
  ['bakso ceban', { amount: 10_000, category: 'cat_makan' }],
  ['sewa kos sejuta', { amount: 1_000_000, category: 'cat_tagihan' }],
  ['nonton bioskop 50rban', { amount: 50_000, category: 'cat_hiburan' }],
  ['beli 2 kopi 36rb', { amount: 36_000, category: 'cat_kopi', note: 'Beli 2 kopi' }],
  ['laptop 12 juta', { amount: 12_000_000 }],
  ['obat batuk 27.500', { amount: 27_500, category: 'cat_kesehatan' }],
  ['spp 750rb', { amount: 750_000, category: 'cat_pendidikan' }],
  // Tanggal relatif & absolut
  [
    'sarapan 12rb tadi pagi',
    { amount: 12_000, date: TODAY, category: 'cat_makan', note: 'Sarapan' },
  ],
  ['makan malam 45rb kemarin', { amount: 45_000, date: '2026-10-06', category: 'cat_makan' }],
  ['kmrn grab 23rb', { amount: 23_000, date: '2026-10-06', category: 'cat_transport' }],
  ['bakmi 30rb kemarin lusa', { amount: 30_000, date: '2026-10-05', category: 'cat_makan' }],
  ['pulsa 50rb 3 hari lalu', { amount: 50_000, date: '2026-10-04', category: 'cat_tagihan' }],
  ['indomaret 87rb tgl 3', { amount: 87_000, date: '2026-10-03', category: 'cat_belanja' }],
  [
    'tagihan wifi 300rb tanggal 15',
    { amount: 300_000, date: '2026-09-15', category: 'cat_tagihan' },
  ],
  ['bpjs 150rb 25 sep', { amount: 150_000, date: '2026-09-25', category: 'cat_tagihan' }],
  ['buku 85rb 3/10', { amount: 85_000, date: '2026-10-03', category: 'cat_pendidikan' }],
  ['kado natal 200rb 24 des', { amount: 200_000, date: '2025-12-24' }],
  ['martabak 40rb senin', { amount: 40_000, date: '2026-10-05', category: 'cat_makan' }],
  ['futsal 50rb hari sabtu', { amount: 50_000, date: '2026-10-03' }],
  ['gereja persembahan 50rb minggu', { amount: 50_000, date: '2026-10-04' }],
  ['laundry 35rb rabu lalu', { amount: 35_000, date: '2026-09-30' }],
  ['makan 20rb hari ini', { amount: 20_000, date: TODAY, category: 'cat_makan' }],
  [
    'tiket kereta 150rb tgl 1 okt',
    { amount: 150_000, date: '2026-10-01', category: 'cat_transport' },
  ],
  // Dompet
  [
    'pulsa 50rb pakai gopay',
    { amount: 50_000, wallet: 'w_gopay', category: 'cat_tagihan', note: 'Pulsa' },
  ],
  ['mie ayam 15rb tunai', { amount: 15_000, wallet: 'w_cash', category: 'cat_makan' }],
  ['shopee 120rb via bca', { amount: 120_000, wallet: 'w_bca', category: 'cat_belanja' }],
  ['grabfood 65rb ovo', { amount: 65_000, wallet: 'w_ovo', category: 'cat_makan' }],
  [
    'bayar kontrakan 2jt dari mandiri',
    { amount: 2_000_000, wallet: 'w_mandiri', category: 'cat_tagihan' },
  ],
  ['bensin 20rb pake cash', { amount: 20_000, wallet: 'w_cash', category: 'cat_transport' }],
  ['netflix 54rb go-pay', { amount: 54_000, wallet: 'w_gopay', category: 'cat_hiburan' }],
  // Pemasukan
  ['bonus 2jt', { type: 'INCOME', amount: 2_000_000, category: 'cat_gaji' }],
  [
    'thr 4,5jt masuk mandiri',
    { type: 'INCOME', amount: 4_500_000, wallet: 'w_mandiri', category: 'cat_gaji' },
  ],
  ['dapat uang dari ibu 500rb', { type: 'INCOME', amount: 500_000 }],
  [
    'freelance desain 1,2jt masuk bca',
    { type: 'INCOME', amount: 1_200_000, wallet: 'w_bca', category: 'cat_freelance' },
  ],
  ['jual sepatu bekas 300rb', { type: 'INCOME', amount: 300_000 }],
  ['refund tokopedia 89rb ke gopay', { type: 'INCOME', amount: 89_000, wallet: 'w_gopay' }],
  ['terima transferan 250rb', { type: 'INCOME', amount: 250_000 }],
  [
    'gajian 7.500.000 tgl 25 sep',
    { type: 'INCOME', amount: 7_500_000, date: '2026-09-25', category: 'cat_gaji' },
  ],
  // Transfer antardompet
  ['tf 100rb dari bca ke ovo', { type: 'TRANSFER', amount: 100_000, wallet: 'w_bca', to: 'w_ovo' }],
  [
    'top up gopay 100rb pakai bca',
    { type: 'TRANSFER', amount: 100_000, wallet: 'w_bca', to: 'w_gopay' },
  ],
  ['topup ovo 50rb', { type: 'TRANSFER', amount: 50_000, to: 'w_ovo' }],
  [
    'tarik tunai 500rb dari bca',
    { type: 'TRANSFER', amount: 500_000, wallet: 'w_bca', to: 'w_cash' },
  ],
  [
    'tarik 1jt di atm mandiri',
    { type: 'TRANSFER', amount: 1_000_000, wallet: 'w_mandiri', to: 'w_cash' },
  ],
  [
    'setor tunai 2jt ke bca',
    { type: 'TRANSFER', amount: 2_000_000, wallet: 'w_cash', to: 'w_bca' },
  ],
  [
    'pindahin 300rb mandiri ke bca',
    { type: 'TRANSFER', amount: 300_000, wallet: 'w_mandiri', to: 'w_bca' },
  ],
  ['nabung 1jt ke tabungan rumah', { type: 'TRANSFER', amount: 1_000_000, to: 'w_tab' }],
  [
    'bca ke gopay 75rb kemarin',
    { type: 'TRANSFER', amount: 75_000, date: '2026-10-06', wallet: 'w_bca', to: 'w_gopay' },
  ],
  // Transfer ke orang = pengeluaran, bukan transfer antardompet
  ['tf ke adik 100rb', { amount: 100_000, note: 'Tf ke adik' }],
  ['transfer ke ibu 1jt pakai bca', { amount: 1_000_000, wallet: 'w_bca' }],
];

function check(text: string, e: Expected) {
  const r = parse(text);
  const actual = {
    type: r.type,
    amount: r.amount,
    date: r.date,
    wallet: r.walletId,
    to: r.toWalletId,
    category: r.categoryId,
    ...(e.note !== undefined && { note: r.note }),
  };
  const expected = {
    type: e.type ?? 'EXPENSE',
    amount: e.amount,
    date: e.date ?? null,
    wallet: e.wallet ?? null,
    to: e.to ?? null,
    category: e.category ?? null,
    ...(e.note !== undefined && { note: e.note }),
  };
  return { ok: JSON.stringify(actual) === JSON.stringify(expected), actual, expected };
}

describe('parseQuickText — set uji', () => {
  it(`punya ≥ 50 kalimat dan akurasi ≥ 95%`, () => {
    expect(DATASET.length).toBeGreaterThanOrEqual(50);
    const results = DATASET.map(([text, e]) => ({ text, ...check(text, e) }));
    const failed = results.filter((r) => !r.ok);
    const amountOk = DATASET.filter(([text, e]) => parse(text).amount === e.amount).length;
    console.info(
      `Ketik cepat: ${results.length - failed.length}/${results.length} kalimat benar, nominal ${amountOk}/${DATASET.length}`,
    );
    for (const f of failed)
      console.info(f.text, '\n  dapat  ', f.actual, '\n  harusnya', f.expected);
    expect(amountOk).toBe(DATASET.length);
    expect((results.length - failed.length) / results.length).toBeGreaterThanOrEqual(0.95);
  });
});

describe('parseQuickText — perilaku', () => {
  it('nominal berlipat dijumlahkan tapi ditandai kurang yakin', () => {
    const r = parse('kopi 20rb roti 15rb');
    expect(r.amount).toBe(35_000);
    expect(r.confidence).toBe('low');
  });

  it('yakin bila nominal & kategori (atau kedua dompet transfer) terbaca', () => {
    expect(parse('makan siang 25rb').confidence).toBe('high');
    expect(parse('makan siang').confidence).toBe('low');
    expect(parse('beli sesuatu 25rb').confidence).toBe('low');
    expect(parse('transfer 200k bca ke gopay').confidence).toBe('high');
    expect(parse('topup ovo 50rb').confidence).toBe('low');
  });

  it('mencatat isian yang terbaca dari teks', () => {
    expect(parse('gaji 5jt masuk bca kemarin').found.sort()).toEqual(
      ['amount', 'category', 'date', 'type', 'wallet'].sort(),
    );
    expect(parse('makan').found).toEqual(['category']);
  });

  it('riwayat pengguna menang atas nama kategori yang disebut', () => {
    const r = parse('makan kantor 30rb', {
      suggestCategory: (note) =>
        note.toLowerCase() === 'makan kantor'
          ? { categoryId: 'cat_kopi', source: 'history' }
          : null,
    });
    expect(r.categoryId).toBe('cat_kopi');
  });

  it('saran yang menunjuk kategori tak tersedia diabaikan', () => {
    const r = parse('bensin 20rb', {
      categories: CATEGORIES.filter((c) => c.id !== 'cat_transport'),
    });
    expect(r.categoryId).toBeNull();
  });

  it('dompet tidak dikenal tetap jadi catatan, alias tipe hanya bila dompet tipe itu tunggal', () => {
    expect(parse('makan 20rb pakai dana').walletId).toBeNull();
    expect(parse('isi bensin 20rb pakai rekening').walletId).toBeNull();
    const single = WALLETS.filter((w) => w.id !== 'w_mandiri' && w.id !== 'w_tab');
    expect(parse('isi bensin 20rb pakai rekening', { wallets: single }).walletId).toBe('w_bca');
  });

  it('kata pertama nama dompet cukup bila unik', () => {
    expect(parse('beli buah 40rb pakai tabungan').walletId).toBe('w_tab');
  });

  it('tanggal tidak valid diabaikan', () => {
    expect(parse('makan 20rb tgl 31/2').date).toBeNull();
  });

  it('teks kosong aman', () => {
    expect(parse('   ')).toMatchObject({
      amount: null,
      note: '',
      type: 'EXPENSE',
      confidence: 'low',
    });
  });

  it('nominal di atas batas ditolak', () => {
    expect(parse('beli pulau 2000000jt').amount).toBeNull();
  });
});
