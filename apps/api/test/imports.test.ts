import { randomUUID } from 'node:crypto';
import { FEATURE_FLAGS, IMPORT_SYNC_ROWS, type ImportRequestInput } from '@catatku/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { authed, createWallet, registerUser, type TestUser, walletBalance } from './helpers';

const KEY = FEATURE_FLAGS.CSV_IMPORT;

async function enableFor(user: TestUser) {
  await prisma.featureFlag.upsert({
    where: { key: KEY },
    create: { key: KEY, enabled: true, plan: 'PREMIUM', userIds: [user.id] },
    update: { enabled: true, plan: 'PREMIUM', userIds: { push: user.id } },
  });
}

async function setup() {
  const user = await registerUser();
  await enableFor(user);
  const wallet = await createWallet(user, { initialBalance: 100_000 });
  return { user, wallet };
}

const CSV = [
  'Tanggal;Keterangan;Jumlah;Jenis;Kategori',
  '01/10/2026;Kopi;18.000;Pengeluaran;makan',
  '02/10/2026;Gaji;5.000.000;Pemasukan;Gaji',
  '03/10/2026;Parkir;2.000;Pengeluaran;Tidak ada',
  '31/02/2026;Rusak;1.000;Pengeluaran;',
  '04/10/2026;Pindah;50.000;Transfer keluar;',
].join('\n');

const request = (walletId: string, overrides: Partial<ImportRequestInput> = {}) => ({
  filename: 'mutasi.csv',
  walletId,
  csv: CSV,
  hasHeader: true,
  columns: { date: 0, note: 1, amount: 2, type: 3, category: 4 },
  dateOrder: 'DMY',
  decimal: 'comma',
  ...overrides,
});

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

describe('akses /imports', () => {
  it('404 bila flag nonaktif untuk pengguna', async () => {
    const user = await registerUser();
    expect((await authed(user).get('/api/v1/imports')).status).toBe(404);
  });
});

describe('pratinjau & impor', () => {
  it('pratinjau tidak menyimpan apa pun dan melaporkan baris gagal beserta alasannya', async () => {
    const { user, wallet } = await setup();
    const res = await authed(user).post('/api/v1/imports/preview').send(request(wallet.id));
    expect(res.status).toBe(200);
    expect(res.body.stats).toEqual({ total: 5, ready: 3, duplicates: 0, failed: 2 });
    expect(res.body.issues).toEqual([
      { line: 5, kind: 'INVALID', message: 'Tanggal "31/02/2026" tidak sesuai format' },
      { line: 6, kind: 'INVALID', message: 'Transfer antardompet belum bisa diimpor' },
    ]);
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
  });

  it('mengimpor ke dompet terpilih; kategori dicocokkan per nama, sisanya ke Lainnya', async () => {
    const { user, wallet } = await setup();
    const res = await authed(user).post('/api/v1/imports').send(request(wallet.id));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'COMPLETED',
      filename: 'mutasi.csv',
      wallet: { id: wallet.id },
      stats: { total: 5, imported: 3, skipped: 0, failed: 2 },
    });
    const rows = await prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { date: 'asc' },
      select: { note: true, amount: true, categoryId: true, importBatchId: true },
    });
    expect(rows).toEqual([
      { note: 'Kopi', amount: -18_000n, categoryId: 'cat_makan', importBatchId: res.body.id },
      { note: 'Gaji', amount: 5_000_000n, categoryId: 'cat_gaji', importBatchId: res.body.id },
      {
        note: 'Parkir',
        amount: -2_000n,
        categoryId: 'cat_lainnya_keluar',
        importBatchId: res.body.id,
      },
    ]);
    expect(await walletBalance(user, wallet.id)).toBe(100_000 - 18_000 + 5_000_000 - 2_000);
  });

  it('impor ulang file yang sama: semua duplikat dilewati, atau tetap diimpor bila diminta', async () => {
    const { user, wallet } = await setup();
    const api = authed(user);
    await api.post('/api/v1/imports').send(request(wallet.id));

    const preview = await api.post('/api/v1/imports/preview').send(request(wallet.id));
    expect(preview.body.stats).toEqual({ total: 5, ready: 0, duplicates: 3, failed: 2 });
    expect(
      preview.body.issues.filter((i: { kind: string }) => i.kind === 'DUPLICATE'),
    ).toHaveLength(3);

    const skipped = await api.post('/api/v1/imports').send(request(wallet.id));
    expect(skipped.status).toBe(400);
    expect(skipped.body.error.message).toBe('Semua baris sudah pernah dicatat');

    const forced = await api
      .post('/api/v1/imports')
      .send(request(wallet.id, { skipDuplicates: false }));
    expect(forced.status).toBe(201);
    expect(forced.body.stats).toMatchObject({ imported: 3, skipped: 0 });
  });

  it('duplikat dihitung per kemunculan: 2 baris identik vs 1 yang sudah ada = 1 baru', async () => {
    const { user, wallet } = await setup();
    const api = authed(user);
    await api.post('/api/v1/transactions').send({
      type: 'EXPENSE',
      amount: 18_000,
      walletId: wallet.id,
      categoryId: 'cat_makan',
      date: '2026-10-01',
      note: 'kopi',
    });
    const csv = 'Tanggal;Keterangan;Jumlah\n01/10/2026;Kopi;-18.000\n01/10/2026;Kopi;-18.000';
    const res = await api
      .post('/api/v1/imports')
      .send(request(wallet.id, { csv, columns: { date: 0, note: 1, amount: 2 } }));
    expect(res.status).toBe(201);
    expect(res.body.stats).toEqual({ total: 2, imported: 1, skipped: 1, failed: 0 });
    expect(res.body.issues).toEqual([
      { line: 2, kind: 'DUPLICATE', message: expect.stringContaining('Sudah ada') },
    ]);
  });

  it('validasi: dompet asing/arsip, file tanpa data, dan opsi kolom', async () => {
    const owner = await setup();
    const { user, wallet } = await setup();
    const api = authed(user);
    const foreign = await api.post('/api/v1/imports/preview').send(request(owner.wallet.id));
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.fields.walletId).toBeDefined();

    const empty = await api
      .post('/api/v1/imports/preview')
      .send(request(wallet.id, { csv: 'Tanggal;Jumlah\n' }));
    expect(empty.status).toBe(400);

    const badColumns = await api
      .post('/api/v1/imports/preview')
      .send({ ...request(wallet.id), columns: { date: -1, amount: 2 } });
    expect(badColumns.status).toBe(400);
  });

  it('idempoten: kirim ulang dengan kunci yang sama tidak mengimpor dua kali', async () => {
    const { user, wallet } = await setup();
    const key = randomUUID();
    const send = () =>
      authed(user).post('/api/v1/imports').set('Idempotency-Key', key).send(request(wallet.id));
    const first = await send();
    const second = await send();
    expect(second.body.id).toBe(first.body.id);
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(3);
  });
});

describe('impor besar di latar belakang', () => {
  it(`lebih dari ${IMPORT_SYNC_ROWS} baris: 202 PROCESSING lalu COMPLETED`, async () => {
    const { user, wallet } = await setup();
    const api = authed(user);
    const n = IMPORT_SYNC_ROWS + 50;
    const lines = Array.from(
      { length: n },
      (_, i) => `2026-09-${String((i % 28) + 1).padStart(2, '0')},Baris ${i},-1000`,
    );
    const res = await api.post('/api/v1/imports').send(
      request(wallet.id, {
        csv: ['Tanggal,Catatan,Jumlah', ...lines].join('\n'),
        columns: { date: 0, note: 1, amount: 2 },
        dateOrder: 'YMD',
      }),
    );
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('PROCESSING');

    let status = 'PROCESSING';
    for (let i = 0; i < 60 && status === 'PROCESSING'; i++) {
      await new Promise((r) => setTimeout(r, 500));
      status = (await api.get(`/api/v1/imports/${res.body.id}`)).body.status;
    }
    expect(status).toBe('COMPLETED');
    expect(await prisma.transaction.count({ where: { importBatchId: res.body.id } })).toBe(n);
  }, 60_000);
});

describe('batalkan impor', () => {
  it('menghapus semua transaksi dari impor itu saja; saldo kembali; riwayat tetap ada', async () => {
    const { user, wallet } = await setup();
    const api = authed(user);
    await api.post('/api/v1/transactions').send({
      type: 'EXPENSE',
      amount: 5_000,
      walletId: wallet.id,
      categoryId: 'cat_makan',
      date: '2026-10-05',
    });
    const batch = (await api.post('/api/v1/imports').send(request(wallet.id))).body;
    const res = await api.post(`/api/v1/imports/${batch.id}/rollback`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ROLLED_BACK');
    expect(res.body.rolledBackAt).toEqual(expect.any(String));
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(1);
    expect(await walletBalance(user, wallet.id)).toBe(95_000);

    const again = await api.post(`/api/v1/imports/${batch.id}/rollback`);
    expect(again.status).toBe(200);
    const list = await api.get('/api/v1/imports');
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].status).toBe('ROLLED_BACK');
  });

  it('impor milik pengguna lain tidak bisa dilihat atau dibatalkan', async () => {
    const owner = await setup();
    const other = await setup();
    const batch = (await authed(owner.user).post('/api/v1/imports').send(request(owner.wallet.id)))
      .body;
    const api = authed(other.user);
    expect((await api.get(`/api/v1/imports/${batch.id}`)).status).toBe(404);
    expect((await api.post(`/api/v1/imports/${batch.id}/rollback`)).status).toBe(404);
    expect((await api.get('/api/v1/imports')).body.items).toEqual([]);
    expect(await prisma.transaction.count({ where: { importBatchId: batch.id } })).toBe(3);
  });
});
