import { describe, expect, it } from 'vitest';
import { RECEIPT_SAMPLES, SAMPLE_TODAY } from './fixtures';
import { normalizeLine, parseAmount, parseReceiptText, receiptNote } from './parse';

describe('dataset struk', () => {
  const results = RECEIPT_SAMPLES.map((s) => ({
    sample: s,
    got: parseReceiptText(s.text, SAMPLE_TODAY),
  }));
  const accuracy = (field: 'total' | 'date' | 'merchant') =>
    results.filter(({ sample, got }) => (got[field]?.value ?? null) === sample.expected[field])
      .length / results.length;
  const allItems = results.flatMap(({ sample }) => sample.expected.items);
  const itemRecall =
    results.reduce(
      (n, { sample, got }) => n + sample.expected.items.filter((i) => got.items.includes(i)).length,
      0,
    ) / allItems.length;
  const extraItems = results.reduce(
    (n, { sample, got }) => n + got.items.filter((i) => !sample.expected.items.includes(i)).length,
    0,
  );

  it.each(results.map((r) => [r.sample.name, r] as const))('%s', (_name, { sample, got }) => {
    expect({
      total: got.total?.value ?? null,
      date: got.date?.value ?? null,
      merchant: got.merchant?.value ?? null,
      items: got.items,
    }).toEqual(sample.expected);
  });

  it('akurasi per isian memenuhi target', () => {
    const metrics = {
      total: accuracy('total'),
      date: accuracy('date'),
      merchant: accuracy('merchant'),
      itemRecall,
      extraItems,
    };
    console.info('Akurasi parser struk', metrics);
    expect(metrics.total).toBeGreaterThanOrEqual(0.9);
    expect(metrics.date).toBeGreaterThanOrEqual(0.9);
    expect(metrics.merchant).toBeGreaterThanOrEqual(0.8);
    expect(metrics.itemRecall).toBeGreaterThanOrEqual(0.8);
    // Barang palsu (biaya, nomor, alamat) lebih mengganggu daripada barang yang terlewat.
    expect(metrics.extraItems).toBeLessThanOrEqual(1);
  });
});

describe('parseAmount', () => {
  it.each([
    ['54.300', 54_300],
    ['54,300', 54_300],
    ['1.250.000', 1_250_000],
    ['54.300,00', 54_300],
    ['54,300.00', 54_300],
    ['54300', 54_300],
    ['54300.00', 54_300],
    ['abc', null],
  ])('%s → %s', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });
});

describe('normalizeLine', () => {
  it('memperbaiki huruf yang terbaca sebagai angka hanya di token angka', () => {
    expect(normalizeLine('T0TAL 1O.OOO')).toBe('T0TAL 10.000');
    expect(normalizeLine('SOTO BOGOR 25.OOO')).toBe('SOTO BOGOR 25.000');
  });

  it('menyatukan angka yang terpisah spasi setelah pemisah ribuan', () => {
    expect(normalizeLine('Total 1. 250. 000')).toBe('TOTAL 1.250.000');
  });
});

describe('parseReceiptText', () => {
  it('keyakinan rendah bila total tidak cocok dengan tunai − kembalian', () => {
    const got = parseReceiptText('TOTAL 54.300\nTUNAI 100.000\nKEMBALI 40.700', SAMPLE_TODAY);
    expect(got.total).toEqual({ value: 54_300, confidence: 'low' });
  });

  it('keyakinan tinggi bila konsisten', () => {
    const got = parseReceiptText('TOTAL 54.300\nTUNAI 100.000\nKEMBALI 45.700', SAMPLE_TODAY);
    expect(got.total).toEqual({ value: 54_300, confidence: 'high' });
  });

  it('keyakinan rendah bila mesin OCR ragu pada baris total', () => {
    const got = parseReceiptText(
      [
        { text: 'INDOMARET', confidence: 90 },
        { text: 'TOTAL 54.300', confidence: 41 },
      ],
      SAMPLE_TODAY,
    );
    expect(got.total?.confidence).toBe('low');
    expect(got.merchant).toEqual({ value: 'Indomaret', confidence: 'high' });
  });

  it('subtotal hanya dipakai bila tidak ada total', () => {
    expect(parseReceiptText('SUBTOTAL 50.000', SAMPLE_TODAY).total).toEqual({
      value: 50_000,
      confidence: 'low',
    });
    expect(parseReceiptText('SUBTOTAL 50.000\nTOTAL 55.000', SAMPLE_TODAY).total?.value).toBe(
      55_000,
    );
  });

  it('mengabaikan tanggal di masa depan dan jam yang mirip tanggal', () => {
    expect(parseReceiptText('Tgl 09/10/2026', SAMPLE_TODAY).date).toBeNull();
    expect(parseReceiptText('Jam 10.10.10\nTgl 06/10/2026', SAMPLE_TODAY).date?.value).toBe(
      '2026-10-06',
    );
  });

  it('tanggal lebih dari setahun lalu diberi keyakinan rendah', () => {
    expect(parseReceiptText('15/03/2025', SAMPLE_TODAY).date).toEqual({
      value: '2025-03-15',
      confidence: 'low',
    });
  });

  it('nomor telepon dan NPWP tidak dianggap nominal', () => {
    expect(
      parseReceiptText('TOKO MAJU\nTELP 0215551234\nNPWP 013379946092000', SAMPLE_TODAY).total,
    ).toBeNull();
  });

  it('tanggal dicek silang dengan tanggal di nomor struk', () => {
    const parse = (text: string) => parseReceiptText(text, SAMPLE_TODAY).date;
    // 7 terbaca 1: nomor struk yang menang, tapi tetap minta ditinjau.
    expect(parse('No: INV202610070012\nTgl 01-10-2026')).toEqual({
      value: '2026-10-07',
      confidence: 'low',
    });
    // Beda jauh: tanggal tercetak tetap dipakai, ditandai kurang yakin.
    expect(parse('No: INV202609150012\nTgl 01-10-2026')).toEqual({
      value: '2026-10-01',
      confidence: 'low',
    });
    expect(parse('No: INV202610010012\nTgl 01-10-2026')?.confidence).toBe('high');
    expect(parse('Nota TRX2026100500\nterima kasih')).toEqual({
      value: '2026-10-05',
      confidence: 'low',
    });
    // Nomor telepon bukan nomor struk.
    expect(parse('Telp/No 0812202610050')).toBeNull();
  });

  it('teks logo yang terbaca acak tidak dijadikan nama toko', () => {
    expect(
      parseReceiptText('NN NYA : NA\nSN. AA RAR AI\nKEDAI KOPI NUSANTARA\nNo : 123', SAMPLE_TODAY)
        .merchant,
    ).toEqual({ value: 'Kedai Kopi Nusantara', confidence: 'low' });
    expect(
      parseReceiptText(
        [
          { text: 'BAKSO MAS', confidence: 30 },
          { text: 'BAKMI JAYA', confidence: 88 },
        ],
        SAMPLE_TODAY,
      ).merchant?.value,
    ).toBe('Bakmi Jaya');
  });

  it('catatan = toko + barang, dipotong rapi di 200 karakter', () => {
    expect(
      receiptNote('Hotways Chicken Bali', ['Strawberry Orange Milk', 'Paha Atas Crispy']),
    ).toBe('Hotways Chicken Bali: Strawberry Orange Milk, Paha Atas Crispy');
    expect(receiptNote(null, ['Kopi Hitam'])).toBe('Kopi Hitam');
    expect(receiptNote('Warung', [])).toBe('Warung');
    expect(receiptNote(null, [])).toBeNull();
    const many = Array.from({ length: 12 }, (_, i) => `Barang Belanjaan Nomor ${i + 1}`);
    const note = receiptNote('Superindo', many)!;
    expect(note.length).toBeLessThanOrEqual(200);
    expect(note).toMatch(/^Superindo: Barang Belanjaan Nomor 1, .* \+\d+ lainnya$/);
  });

  it('nama toko dari baris pertama yang wajar diberi keyakinan rendah', () => {
    expect(
      parseReceiptText('*** RM PADANG SEDERHANA ***\nJl. Sudirman 1', SAMPLE_TODAY).merchant,
    ).toEqual({ value: 'RM Padang Sederhana', confidence: 'low' });
  });
});
