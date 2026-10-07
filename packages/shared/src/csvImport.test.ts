import { describe, expect, it } from 'vitest';
import {
  buildImportRows,
  detectDateOrder,
  detectDecimal,
  guessColumns,
  looksLikeHeader,
  parseAmountValue,
  parseCsv,
  parseDateValue,
  parseTypeValue,
} from './csvImport';
import { importParseOptionsSchema } from './schemas/import';

describe('parseCsv', () => {
  it('kutip ganda, koma di dalam sel, sel multi-baris, CRLF, BOM, dan baris kosong', () => {
    const text =
      '\uFEFFTanggal,Catatan,Jumlah\r\n2026-10-07,"Kopi, susu",-18000\r\n\r\n2026-10-08,"Baris ""dua""\nlanjut",5000\n';
    const { rows, delimiter } = parseCsv(text);
    expect(delimiter).toBe(',');
    expect(rows).toEqual([
      { line: 1, cells: ['Tanggal', 'Catatan', 'Jumlah'] },
      { line: 2, cells: ['2026-10-07', 'Kopi, susu', '-18000'] },
      { line: 4, cells: ['2026-10-08', 'Baris "dua"\nlanjut', '5000'] },
    ]);
  });

  it('mendeteksi pemisah titik koma (Excel Indonesia) dan tab', () => {
    expect(parseCsv('Tanggal;Jumlah\n07/10/2026;18.000').rows[1]!.cells).toEqual([
      '07/10/2026',
      '18.000',
    ]);
    expect(parseCsv('a\tb\n1\t2').delimiter).toBe('\t');
  });

  it("membuang awalan ' pengaman formula dari ekspor Catatku", () => {
    expect(parseCsv("x\n'=SUM(A1)\n'-catatan").rows.map((r) => r.cells[0])).toEqual([
      'x',
      '=SUM(A1)',
      '-catatan',
    ]);
  });
});

describe('parseDateValue', () => {
  it('format angka sesuai urutan yang dipilih', () => {
    expect(parseDateValue('07/10/2026', 'DMY')).toBe('2026-10-07');
    expect(parseDateValue('10/07/2026', 'MDY')).toBe('2026-10-07');
    expect(parseDateValue('2026-10-07', 'YMD')).toBe('2026-10-07');
    expect(parseDateValue('7-10-26', 'DMY')).toBe('2026-10-07');
    expect(parseDateValue('07.10.2026 14:22', 'DMY')).toBe('2026-10-07');
  });

  it('nama bulan Indonesia/Inggris', () => {
    expect(parseDateValue('7 Okt 2026', 'DMY')).toBe('2026-10-07');
    expect(parseDateValue('07-Oct-26', 'MDY')).toBe('2026-10-07');
    expect(parseDateValue('1 Agustus 2026', 'DMY')).toBe('2026-08-01');
  });

  it('menolak tanggal yang tidak ada atau tidak cocok', () => {
    expect(parseDateValue('31/02/2026', 'DMY')).toBeNull();
    expect(parseDateValue('13/13/2026', 'DMY')).toBeNull();
    expect(parseDateValue('kemarin', 'DMY')).toBeNull();
    expect(parseDateValue('2026-10-07', 'DMY')).toBeNull();
  });

  it('detectDateOrder', () => {
    expect(detectDateOrder(['2026-10-07'])).toBe('YMD');
    expect(detectDateOrder(['01/02/2026', '25/02/2026'])).toBe('DMY');
    expect(detectDateOrder(['02/25/2026'])).toBe('MDY');
    expect(detectDateOrder(['01/02/2026'])).toBe('DMY');
  });
});

describe('parseAmountValue', () => {
  it('format Indonesia (koma desimal)', () => {
    expect(parseAmountValue('Rp 1.500.000', 'comma')).toBe(1_500_000);
    expect(parseAmountValue('-18.000', 'comma')).toBe(-18_000);
    expect(parseAmountValue('18.000,50', 'comma')).toBe(18_001);
    expect(parseAmountValue('(25.000)', 'comma')).toBe(-25_000);
    expect(parseAmountValue('25.000-', 'comma')).toBe(-25_000);
    expect(parseAmountValue('-18000', 'comma')).toBe(-18_000);
  });

  it('format titik desimal', () => {
    expect(parseAmountValue('1,500,000.00', 'dot')).toBe(1_500_000);
    expect(parseAmountValue('IDR 18000.4', 'dot')).toBe(18_000);
  });

  it('menolak pengelompokan ribuan yang salah agar salah pilih pemisah ketahuan', () => {
    expect(parseAmountValue('18.50', 'comma')).toBeNull();
    expect(parseAmountValue('1,500,000.00', 'comma')).toBeNull();
    expect(parseAmountValue('abc', 'comma')).toBeNull();
    expect(parseAmountValue('', 'comma')).toBeNull();
  });

  it('detectDecimal', () => {
    expect(detectDecimal(['1.500.000', '18.000'])).toBe('comma');
    expect(detectDecimal(['1,500,000.00', '18.50'])).toBe('dot');
    expect(detectDecimal(['-18000'])).toBe('comma');
  });
});

describe('parseTypeValue & guessColumns', () => {
  it('mengenali label tipe umum', () => {
    expect(parseTypeValue('Pemasukan')).toBe('INCOME');
    expect(parseTypeValue('CR')).toBe('INCOME');
    expect(parseTypeValue('pengeluaran')).toBe('EXPENSE');
    expect(parseTypeValue('DB')).toBe('EXPENSE');
    expect(parseTypeValue('Transfer keluar')).toBe('TRANSFER');
    expect(parseTypeValue('lain')).toBeNull();
  });

  it('memetakan judul kolom ekspor Catatku', () => {
    const header = ['Tanggal', 'Jenis', 'Kategori', 'Dompet', 'Dompet lawan', 'Jumlah', 'Catatan'];
    expect(guessColumns(header)).toEqual({ date: 0, type: 1, category: 2, amount: 5, note: 6 });
    expect(looksLikeHeader(header)).toBe(true);
    expect(looksLikeHeader(['07/10/2026', 'Kopi', '18000'])).toBe(false);
  });
});

describe('buildImportRows', () => {
  const rows = parseCsv(
    [
      'Tanggal,Keterangan,Jumlah,Jenis',
      '07/10/2026,Kopi,18.000,Pengeluaran',
      '08/10/2026,Gaji,"5.000.000",Pemasukan',
      '31/02/2026,Salah,1.000,Pengeluaran',
      '09/10/2026,Nol,0,Pengeluaran',
      '09/10/2026,Pindah,10.000,Transfer keluar',
      '09/10/2026,,abc,Pengeluaran',
    ].join('\n'),
  ).rows;
  const options = importParseOptionsSchema.parse({
    hasHeader: true,
    columns: { date: 0, note: 1, amount: 2, type: 3 },
    dateOrder: 'DMY',
    decimal: 'comma',
  });

  it('baris valid jadi calon transaksi; yang gagal membawa alasan dan nomor baris', () => {
    expect(buildImportRows(rows, options)).toEqual([
      {
        line: 2,
        ok: true,
        date: '2026-10-07',
        type: 'EXPENSE',
        amount: 18_000,
        note: 'Kopi',
        category: null,
      },
      {
        line: 3,
        ok: true,
        date: '2026-10-08',
        type: 'INCOME',
        amount: 5_000_000,
        note: 'Gaji',
        category: null,
      },
      { line: 4, ok: false, reason: 'Tanggal "31/02/2026" tidak sesuai format' },
      { line: 5, ok: false, reason: 'Jumlah 0' },
      { line: 6, ok: false, reason: 'Transfer antardompet belum bisa diimpor' },
      { line: 7, ok: false, reason: 'Jumlah "abc" tidak terbaca' },
    ]);
  });

  it('tanpa kolom tipe: tanda jumlah atau tipe default', () => {
    const plain = parseCsv('07/10/2026,-18000\n08/10/2026,5000').rows;
    const base = { hasHeader: false, dateOrder: 'DMY', decimal: 'comma' } as const;
    const bySign = buildImportRows(
      plain,
      importParseOptionsSchema.parse({ ...base, columns: { date: 0, amount: 1 } }),
    );
    expect(bySign.map((r) => r.ok && r.type)).toEqual(['EXPENSE', 'INCOME']);
    const allExpense = buildImportRows(
      plain,
      importParseOptionsSchema.parse({
        ...base,
        columns: { date: 0, amount: 1 },
        defaultType: 'EXPENSE',
      }),
    );
    expect(allExpense.map((r) => r.ok && [r.type, r.amount])).toEqual([
      ['EXPENSE', 18_000],
      ['EXPENSE', 5_000],
    ]);
  });
});
