import { describe, expect, it } from 'vitest';
import { bcaNote, bcaParser, detectStatement, statementBalanced } from './statements';

/** Tiruan format "Mutasi Rekening" KlikBCA (data karangan). */
const BCA_CSV = [
  'No. rekening : 1234567890',
  'Nama : BUDI SANTOSO',
  'Periode : 25/09/2026 - 05/10/2026',
  'Kode Mata Uang : Rp',
  '',
  'Tanggal Transaksi,Keterangan,Cabang,Jumlah,,Saldo',
  "'25/09,'TRSF E-BANKING DB 2509/FTSCY/WS95051     150000.00 ANDI WIJAYA,'0000,150000.00,DB,850000.00",
  "'30/09,'KR OTOMATIS LLG-ANTAR BANK PT MAJU JAYA GAJI,'0998,5000000.00,CR,5850000.00",
  "'01/10,'TARIKAN ATM 01/10,'0000,500000.00,DB,5350000.00",
  "'02/10,'TRSF E-BANKING CR 0210/FTSCY/WS95221     75000.00 SITI AMINAH,'0000,75000.00,CR,5425000.00",
  "'03/10,'BIAYA ADM,'0000,10000.00,DB,5415000.00",
  "'PEND,'TRSF E-BANKING DB 0510/FTSCY/WS95301     25000.00 WARUNG BU TINI,'0000,25000.00,DB,5390000.00",
  'Saldo Awal,1000000.00',
  'Mutasi Kredit,5075000.00,2',
  'Mutasi Debet,685000.00,4',
  'Saldo Akhir,5390000.00',
].join('\r\n');

const TODAY = '2026-10-08';

describe('mutasi BCA', () => {
  it('dikenali; CSV biasa tidak', () => {
    expect(detectStatement(BCA_CSV)?.bank).toBe('bca');
    expect(detectStatement('Tanggal;Keterangan;Jumlah\r\n01/10/2026;Makan;-35.000')).toBeNull();
  });

  it('membaca rekening, periode, saldo, dan semua baris', () => {
    const s = bcaParser.parse(BCA_CSV, { today: TODAY });
    expect(s.accountHint).toBe('1234****90');
    expect(s.period).toEqual({ from: '2026-09-25', to: '2026-10-05' });
    expect(s.balance).toEqual({ opening: 1_000_000, closing: 5_390_000 });
    expect(s.invalidLines).toEqual([]);
    expect(statementBalanced(s)).toBe(true);
    expect(s.entries.map((e) => [e.date, e.type, e.amount, e.note])).toEqual([
      ['2026-09-25', 'EXPENSE', 150_000, 'Transfer ke ANDI WIJAYA'],
      ['2026-09-30', 'INCOME', 5_000_000, 'PT MAJU JAYA GAJI'],
      ['2026-10-01', 'EXPENSE', 500_000, 'Tarik tunai ATM'],
      ['2026-10-02', 'INCOME', 75_000, 'Transfer dari SITI AMINAH'],
      ['2026-10-03', 'EXPENSE', 10_000, 'Biaya administrasi'],
      ['2026-10-05', 'EXPENSE', 25_000, 'Transfer ke WARUNG BU TINI'],
    ]);
    expect(s.entries[2]!.cash).toBe(true);
    expect(s.entries[5]!.pending).toBe(true);
  });

  it('periode melewati tahun baru: Desember tahun lalu, Januari tahun ini', () => {
    const csv = BCA_CSV.replace('25/09/2026 - 05/10/2026', '28/12/2025 - 03/01/2026')
      .replace("'25/09,", "'28/12,")
      .replace("'30/09,", "'02/01,");
    const s = bcaParser.parse(csv, { today: TODAY });
    expect(s.entries[0]!.date).toBe('2025-12-28');
    expect(s.entries[1]!.date).toBe('2026-01-02');
  });

  it('jumlah berisi "DB"/"CR" di sel yang sama dan pemisah titik koma', () => {
    const csv = [
      'No. rekening ; 1234567890',
      'Periode ; 01/10/2026 - 08/10/2026',
      'Tanggal Transaksi;Keterangan;Cabang;Jumlah;Saldo',
      "'04/10;KARTU DEBIT INDOMARET JKT;0000;35,500.00 DB;1,000,000.00",
    ].join('\n');
    const [e] = bcaParser.parse(csv, { today: TODAY }).entries;
    expect(e).toMatchObject({ date: '2026-10-04', type: 'EXPENSE', amount: 35_500 });
    expect(e!.note).toBe('Kartu debit: INDOMARET JKT');
  });

  it('baris rusak dilaporkan dan saldo dianggap tidak cocok', () => {
    const csv = BCA_CSV.replace(
      "'03/10,'BIAYA ADM,'0000,10000.00,DB",
      "'3x/10,'BIAYA ADM,'0000,10000.00,DB",
    );
    const s = bcaParser.parse(csv, { today: TODAY });
    expect(s.invalidLines).toHaveLength(1);
    expect(statementBalanced(s)).toBe(false);
  });

  it('catatan dari keterangan', () => {
    expect(bcaNote('BI-FAST DB BIF TRANSFER KE 014 BUDI', 'EXPENSE')).toBe('Transfer ke BUDI');
    expect(bcaNote('BUNGA', 'INCOME')).toBe('Bunga tabungan');
    expect(bcaNote('PAJAK BUNGA', 'EXPENSE')).toBe('Pajak bunga');
    expect(bcaNote('SETORAN TUNAI', 'INCOME')).toBe('Setor tunai');
  });
});
