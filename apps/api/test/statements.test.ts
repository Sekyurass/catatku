import { randomUUID } from 'node:crypto';
import { FEATURE_FLAGS } from '@catatku/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toDbDate } from '../src/lib/money';
import { prisma } from '../src/lib/prisma';
import { authed, createWallet, registerUser, type TestUser } from './helpers';

const KEY = FEATURE_FLAGS.CSV_IMPORT;

/** Tiruan "Mutasi Rekening" KlikBCA (data karangan). */
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
  "'04/10,'TRANSAKSI QRIS 0410 KOPI KENANGAN,'0000,abc,DB,5415000.00",
  'Saldo Awal,1000000.00',
  'Saldo Akhir,5415000.00',
].join('\r\n');

// Nomor baris file (header di baris 6).
const LINE = { transfer: 7, salary: 8, atm: 9, incoming: 10, fee: 11, broken: 12 };

async function setup() {
  const user = await registerUser();
  await prisma.featureFlag.update({
    where: { key: KEY },
    data: { enabled: true, plan: 'PREMIUM', userIds: { push: user.id } },
  });
  const wallet = await createWallet(user, { name: 'BCA', type: 'BANK' });
  return { user, wallet };
}

const body = (walletId: string, extra: Record<string, unknown> = {}) => ({
  filename: 'mutasi-bca.csv',
  walletId,
  content: BCA_CSV,
  ...extra,
});

async function category(type: 'INCOME' | 'EXPENSE', name: string) {
  const row = await prisma.category.findFirst({ where: { userId: null, type, name } });
  return row!.id;
}

/** Transfer ke Andi sudah dicatat manual sehari setelah tanggal bank. */
async function recordManualTransfer(user: TestUser, walletId: string) {
  return prisma.transaction.create({
    data: {
      userId: user.id,
      walletId,
      categoryId: await category('EXPENSE', 'Lainnya'),
      type: 'EXPENSE',
      amount: -150_000n,
      date: toDbDate('2026-09-26'),
      note: 'Bayar utang Andi',
    },
  });
}

/** Email notifikasi transfer masuk dari Siti yang belum dikonfirmasi. */
async function pendingBankEmail(user: TestUser) {
  return prisma.inboundTransaction.create({
    data: {
      userId: user.id,
      source: 'bca',
      kind: 'transfer',
      reference: randomUUID(),
      type: 'INCOME',
      amount: 75_000n,
      date: toDbDate('2026-10-02'),
      note: 'Transfer dari SITI AMINAH',
    },
  });
}

beforeAll(async () => {
  await prisma.featureFlag.upsert({
    where: { key: KEY },
    create: { key: KEY, enabled: false },
    update: {},
  });
});

afterAll(async () => {
  await prisma.featureFlag.update({
    where: { key: KEY },
    data: { enabled: false, plan: null, userIds: [] },
  });
});

describe('impor mutasi bank', () => {
  it('404 bila flag impor nonaktif', async () => {
    const user = await registerUser();
    const wallet = await createWallet(user);
    const res = await authed(user).post('/api/v1/imports/statements/preview').send(body(wallet.id));
    expect(res.status).toBe(404);
  });

  it('file yang bukan mutasi bank ditolak dengan pesan jelas', async () => {
    const { user, wallet } = await setup();
    const res = await authed(user)
      .post('/api/v1/imports/statements/preview')
      .send(body(wallet.id, { content: 'Tanggal;Keterangan;Jumlah\n01/10/2026;Kopi;-18.000' }));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/tidak dikenali/);
  });

  it('pratinjau: mencocokkan transaksi manual & email bank, tanpa menulis apa pun', async () => {
    const { user, wallet } = await setup();
    const manual = await recordManualTransfer(user, wallet.id);
    const email = await pendingBankEmail(user);

    const res = await authed(user).post('/api/v1/imports/statements/preview').send(body(wallet.id));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      bank: 'bca',
      bankName: 'BCA',
      accountHint: '1234****90',
      period: { from: '2026-09-25', to: '2026-10-05' },
      invalidLines: [LINE.broken],
      stats: { total: 6, new: 4, matched: 1, failed: 1 },
    });
    // Ada baris rusak, jadi saldo tidak bisa dipastikan cocok.
    expect(res.body.balance).toEqual({ opening: 1_000_000, closing: 5_415_000, balanced: false });

    const rows = new Map(res.body.rows.map((r: { line: number }) => [r.line, r]));
    expect(rows.get(LINE.transfer)).toMatchObject({
      match: { id: manual.id, date: '2026-09-26', amount: 150_000, note: 'Bayar utang Andi' },
      bankEmailId: null,
    });
    expect(rows.get(LINE.incoming)).toMatchObject({ match: null, bankEmailId: email.id });
    expect(rows.get(LINE.atm)).toMatchObject({ cash: true, note: 'Tarik tunai ATM' });
    expect(rows.get(LINE.salary)).toMatchObject({
      type: 'INCOME',
      categoryId: await category('INCOME', 'Gaji'),
      categorySource: 'keyword',
    });

    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.importBatch.count({ where: { userId: user.id } })).toBe(0);
  });

  it('impor bawaan: yang sudah tercatat & tarik tunai dilewati, email bank ikut terkonfirmasi', async () => {
    const { user, wallet } = await setup();
    await recordManualTransfer(user, wallet.id);
    const email = await pendingBankEmail(user);

    const res = await authed(user)
      .post('/api/v1/imports/statements')
      .set('Idempotency-Key', randomUUID())
      .send(body(wallet.id));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      source: 'bca',
      status: 'COMPLETED',
      stats: { total: 6, imported: 3, skipped: 2, failed: 1 },
    });
    expect(res.body.issues).toEqual([
      { line: LINE.transfer, kind: 'DUPLICATE', message: 'Sudah tercatat, dilewati' },
      { line: LINE.atm, kind: 'DUPLICATE', message: 'Tidak dipilih untuk diimpor' },
      { line: LINE.broken, kind: 'INVALID', message: 'Baris tidak terbaca' },
    ]);

    const imported = await prisma.transaction.findMany({
      where: { userId: user.id, importBatchId: res.body.id },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, amount: true, note: true },
    });
    expect(imported.map((t) => [t.amount, t.note])).toEqual([
      [5_000_000n, 'PT MAJU JAYA GAJI'],
      [75_000n, 'Transfer dari SITI AMINAH'],
      [-10_000n, 'Biaya administrasi'],
    ]);
    const linked = await prisma.inboundTransaction.findUniqueOrThrow({ where: { id: email.id } });
    expect(linked.status).toBe('CONFIRMED');
    expect(linked.transactionId).toBe(imported[1]!.id);
  });

  it('privasi: isi file mentah tidak tersimpan di riwayat impor', async () => {
    const { user, wallet } = await setup();
    const res = await authed(user)
      .post('/api/v1/imports/statements')
      .set('Idempotency-Key', randomUUID())
      .send(body(wallet.id));
    expect(res.status).toBe(201);
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: res.body.id } });
    const stored = JSON.stringify(batch);
    for (const secret of ['1234567890', 'BUDI SANTOSO', 'FTSCY', 'WS95051', 'TRSF E-BANKING']) {
      expect(stored).not.toContain(secret);
    }
    const notes = await prisma.transaction.findMany({
      where: { importBatchId: batch.id },
      select: { note: true },
    });
    expect(notes.some((n) => n.note?.includes('FTSCY'))).toBe(false);
  });

  it('keputusan pengguna: impor tarik tunai dengan kategori pilihan, lewati baris lain', async () => {
    const { user, wallet } = await setup();
    const belanja = await category('EXPENSE', 'Belanja');
    const res = await authed(user)
      .post('/api/v1/imports/statements')
      .set('Idempotency-Key', randomUUID())
      .send(
        body(wallet.id, {
          rows: [
            { line: LINE.atm, import: true, categoryId: belanja },
            { line: LINE.fee, import: false },
          ],
        }),
      );
    expect(res.status).toBe(201);
    expect(res.body.stats).toMatchObject({ imported: 4, skipped: 1 });
    const atm = await prisma.transaction.findFirstOrThrow({
      where: { importBatchId: res.body.id, note: 'Tarik tunai ATM' },
    });
    expect(atm.categoryId).toBe(belanja);
    expect(
      await prisma.transaction.count({
        where: { importBatchId: res.body.id, note: 'Biaya administrasi' },
      }),
    ).toBe(0);
  });

  it('kategori yang tidak sesuai jenis transaksi ditolak', async () => {
    const { user, wallet } = await setup();
    const res = await authed(user)
      .post('/api/v1/imports/statements')
      .set('Idempotency-Key', randomUUID())
      .send(
        body(wallet.id, {
          rows: [
            { line: LINE.salary, import: true, categoryId: await category('EXPENSE', 'Belanja') },
          ],
        }),
      );
    expect(res.status).toBe(400);
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
  });

  it('impor ulang file yang sama tidak membuat transaksi ganda; batalkan memulihkan email bank', async () => {
    const { user, wallet } = await setup();
    const email = await pendingBankEmail(user);
    const first = await authed(user)
      .post('/api/v1/imports/statements')
      .set('Idempotency-Key', randomUUID())
      .send(body(wallet.id));
    expect(first.status).toBe(201);
    const count = await prisma.transaction.count({ where: { userId: user.id } });

    const preview = await authed(user)
      .post('/api/v1/imports/statements/preview')
      .send(body(wallet.id));
    expect(preview.body.stats).toMatchObject({ new: 1, matched: 4 });

    const again = await authed(user)
      .post('/api/v1/imports/statements')
      .set('Idempotency-Key', randomUUID())
      .send(body(wallet.id));
    expect(again.status).toBe(400);
    expect(again.body.error.message).toBe('Semua transaksi di mutasi ini sudah tercatat');
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(count);

    const rollback = await authed(user).post(`/api/v1/imports/${first.body.id}/rollback`);
    expect(rollback.status).toBe(200);
    const restored = await prisma.inboundTransaction.findUniqueOrThrow({ where: { id: email.id } });
    expect(restored).toMatchObject({ status: 'PENDING', transactionId: null });
  });
});
