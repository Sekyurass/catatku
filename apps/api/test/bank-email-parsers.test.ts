import { describe, expect, it } from 'vitest';
import {
  extractFields,
  maskAccount,
  parseBankEmail,
  parseDateTime,
  parseRupiah,
} from '../src/modules/bankEmail/parsers';

describe('parseRupiah', () => {
  it.each([
    ['IDR 150,000.00', 150_000],
    ['Rp 150.000,00', 150_000],
    ['Rp25.000,-', 25_000],
    ['Rp 1.250.000', 1_250_000],
    ['IDR 2,500', 2_500],
    ['IDR 0.00', null],
    ['tidak ada', null],
  ])('%s → %s', (raw, expected) => {
    expect(parseRupiah(raw)).toBe(expected);
  });
});

describe('parseDateTime', () => {
  it.each([
    ['08 Oct 2026 10:15:22', '2026-10-08', '10:15'],
    ['8 Oktober 2026, 09.05 WIB', '2026-10-08', '09:05'],
    ['08/10/2026 23:59', '2026-10-08', '23:59'],
    ['2026-10-08', '2026-10-08', null],
    ['31 Feb 2026', null, null],
    ['', null, null],
  ])('%s', (raw, date, time) => {
    expect(parseDateTime(raw)).toEqual({ date, time });
  });
});

describe('extractFields', () => {
  it('label ":" nilai, kolom tabel, dan label di baris terpisah', () => {
    const fields = extractFields(
      [
        'Reference No : ABC123',
        'Merchant Name\tWARUNG BU SRI',
        'Total Pembayaran',
        'Rp 50.000',
      ].join('\n'),
    );
    expect(fields.get('reference no')).toBe('ABC123');
    expect(fields.get('merchant name')).toBe('WARUNG BU SRI');
    expect(fields.get('total pembayaran')).toBe('Rp 50.000');
  });
});

describe('maskAccount', () => {
  it('menyamarkan nomor panjang, membiarkan yang sudah disamarkan', () => {
    expect(maskAccount('1234567890')).toBe('1234****90');
    expect(maskAccount('xxxxxx7890')).toBe('xxxxxx7890');
    expect(maskAccount(null)).toBeNull();
  });
});

describe('parseBankEmail', () => {
  const bcaTransfer = [
    'Transfer Notification',
    'Transaction Date : 08 Oct 2026 10:15:22',
    'Transfer Type : Transfer to BCA Account',
    'Source of Fund : 1234567890',
    'Beneficiary Name : BUDI SANTOSO',
    'Transfer Amount : IDR 150,000.00',
    'Transfer Fee : IDR 2,500.00',
    'Total : IDR 152,500.00',
    'Reference No : 2610081015ABC',
  ].join('\n');

  it('transfer BCA: total termasuk biaya, rekening disamarkan, yakin', () => {
    expect(
      parseBankEmail({
        fromDomain: 'bca.co.id',
        subject: 'Internet Transaction Journal',
        text: bcaTransfer,
      }),
    ).toEqual({
      source: 'bca',
      kind: 'transfer',
      type: 'EXPENSE',
      amount: 152_500,
      fee: 2_500,
      date: '2026-10-08',
      time: '10:15',
      counterparty: 'BUDI SANTOSO',
      reference: '2610081015ABC',
      accountHint: '1234****90',
      note: 'Transfer ke BUDI SANTOSO',
      confident: true,
    });
  });

  it('QRIS BCA tanpa label biaya: biaya = total − nominal', () => {
    const parsed = parseBankEmail({
      fromDomain: 'klikbca.bca.co.id',
      subject: 'Pembayaran QRIS',
      text: [
        'Tanggal Transaksi : 08/10/2026 12:30',
        'Nama Merchant : KOPI KENANGAN',
        'Nominal : Rp 25.000,00',
        'Total Pembayaran : Rp 25.500,00',
        'No Referensi : QR998877',
      ].join('\n'),
    });
    expect(parsed).toMatchObject({
      kind: 'qris',
      amount: 25_500,
      fee: 500,
      note: 'KOPI KENANGAN',
      confident: true,
    });
  });

  it('BCA tanpa nominal berlabel → tidak terbaca', () => {
    expect(
      parseBankEmail({
        fromDomain: 'bca.co.id',
        subject: 'Promo',
        text: 'Dapatkan cashback Rp 50.000!',
      }),
    ).toBeNull();
  });

  it('bank lain: pembaca umum, dana masuk, tidak yakin', () => {
    const parsed = parseBankEmail({
      fromDomain: 'banklain.co.id',
      subject: 'Dana masuk ke rekening Anda',
      text: 'Anda menerima transfer sebesar Rp 1.000.000 dari ANI pada 08/10/2026.',
    });
    expect(parsed).toMatchObject({
      source: 'banklain.co.id',
      type: 'INCOME',
      amount: 1_000_000,
      fee: 0,
      reference: null,
      confident: false,
    });
  });

  it('email non-transaksi dari bank lain → null', () => {
    expect(
      parseBankEmail({
        fromDomain: 'banklain.co.id',
        subject: 'Newsletter',
        text: 'Hemat Rp 10.000',
      }),
    ).toBeNull();
  });
});
