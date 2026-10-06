import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { authed, createWallet, registerUser, walletBalance, type TestUser } from './helpers';

let user: TestUser;
let cash: { id: string };
let bank: { id: string };

beforeAll(async () => {
  user = await registerUser();
  cash = await createWallet(user, { name: 'Tunai', initialBalance: 100_000 });
  bank = await createWallet(user, { name: 'BCA', type: 'BANK', initialBalance: 1_000_000 });
});

const expense = (over: Record<string, unknown> = {}) => ({
  type: 'EXPENSE',
  amount: 25_000,
  walletId: cash.id,
  categoryId: 'cat_makan',
  date: '2026-10-05',
  note: 'Nasi padang',
  ...over,
});

describe('pemasukan & pengeluaran', () => {
  it('menyimpan nominal bertanda dan saldo dompet ikut berubah', async () => {
    const res = await authed(user).post('/api/v1/transactions').send(expense());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'EXPENSE',
      amount: -25_000,
      date: '2026-10-05',
      note: 'Nasi padang',
      wallet: { id: cash.id, name: 'Tunai' },
      category: { id: 'cat_makan', name: 'Makan' },
    });

    const income = await authed(user).post('/api/v1/transactions').send({
      type: 'INCOME',
      amount: 50_000,
      walletId: cash.id,
      categoryId: 'cat_gaji',
      date: '2026-10-05',
    });
    expect(income.body.amount).toBe(50_000);
    expect(await walletBalance(user, cash.id)).toBe(125_000);
  });

  it('menolak nominal 0, negatif, desimal, dan kategori yang tipenya tidak cocok', async () => {
    for (const amount of [0, -5, 10.5]) {
      const res = await authed(user).post('/api/v1/transactions').send(expense({ amount }));
      expect(res.status).toBe(400);
      expect(res.body.error.fields.amount).toBeDefined();
    }
    const wrongType = await authed(user)
      .post('/api/v1/transactions')
      .send(expense({ categoryId: 'cat_gaji' }));
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.error.fields.categoryId).toBeDefined();
  });

  it('mengubah transaksi: ganti tipe wajib dengan kategori yang sesuai', async () => {
    const created = await authed(user)
      .post('/api/v1/transactions')
      .send(expense({ amount: 5_000 }));
    const id = created.body.id;

    const bad = await authed(user).patch(`/api/v1/transactions/${id}`).send({ type: 'INCOME' });
    expect(bad.status).toBe(400);

    const ok = await authed(user)
      .patch(`/api/v1/transactions/${id}`)
      .send({ type: 'INCOME', categoryId: 'cat_lainnya_masuk', amount: 7_000, note: '' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ type: 'INCOME', amount: 7_000, note: null });
  });

  it('soft delete lalu urungkan mengembalikan saldo', async () => {
    const before = await walletBalance(user, cash.id);
    const created = await authed(user)
      .post('/api/v1/transactions')
      .send(expense({ amount: 9_000 }));
    expect(await walletBalance(user, cash.id)).toBe(before - 9_000);

    expect((await authed(user).delete(`/api/v1/transactions/${created.body.id}`)).status).toBe(204);
    expect(await walletBalance(user, cash.id)).toBe(before);
    expect((await authed(user).get(`/api/v1/transactions/${created.body.id}`)).status).toBe(404);

    const restored = await authed(user).post(`/api/v1/transactions/${created.body.id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.deletedAt).toBeNull();
    expect(await walletBalance(user, cash.id)).toBe(before - 9_000);
  });

  it('tidak bisa mencatat ke dompet yang diarsipkan', async () => {
    const old = await createWallet(user, { name: 'Arsip' });
    await authed(user).patch(`/api/v1/wallets/${old.id}`).send({ archived: true });
    const res = await authed(user)
      .post('/api/v1/transactions')
      .send(expense({ walletId: old.id }));
    expect(res.status).toBe(400);
    expect(res.body.error.fields.walletId).toBeDefined();
  });
});

describe('transfer', () => {
  it('membuat dua baris berpasangan dan total saldo tetap', async () => {
    const totalBefore = (await walletBalance(user, cash.id)) + (await walletBalance(user, bank.id));
    const res = await authed(user).post('/api/v1/transactions/transfer').send({
      fromWalletId: bank.id,
      toWalletId: cash.id,
      amount: 200_000,
      date: '2026-10-04',
      note: 'Tarik tunai',
    });
    expect(res.status).toBe(201);
    expect(res.body.out).toMatchObject({
      type: 'TRANSFER',
      amount: -200_000,
      walletId: bank.id,
      counterpartWallet: { id: cash.id },
    });
    expect(res.body.in).toMatchObject({ amount: 200_000, walletId: cash.id });
    expect(res.body.out.transferGroupId).toBe(res.body.in.transferGroupId);

    const totalAfter = (await walletBalance(user, cash.id)) + (await walletBalance(user, bank.id));
    expect(totalAfter).toBe(totalBefore);
  });

  it('menolak dompet asal = tujuan', async () => {
    const res = await authed(user).post('/api/v1/transactions/transfer').send({
      fromWalletId: cash.id,
      toWalletId: cash.id,
      amount: 1_000,
      date: '2026-10-04',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.toWalletId).toBeDefined();
  });

  it('mengedit nominal lewat salah satu sisi memperbarui kedua sisi; hapus ikut keduanya', async () => {
    const created = await authed(user).post('/api/v1/transactions/transfer').send({
      fromWalletId: bank.id,
      toWalletId: cash.id,
      amount: 10_000,
      date: '2026-10-04',
    });
    const cashBefore = await walletBalance(user, cash.id);

    const edited = await authed(user)
      .patch(`/api/v1/transactions/${created.body.in.id}`)
      .send({ amount: 15_000 });
    expect(edited.status).toBe(200);
    expect(edited.body.amount).toBe(15_000);
    const out = await authed(user).get(`/api/v1/transactions/${created.body.out.id}`);
    expect(out.body.amount).toBe(-15_000);
    expect(await walletBalance(user, cash.id)).toBe(cashBefore + 5_000);

    await authed(user).delete(`/api/v1/transactions/${created.body.out.id}`);
    expect((await authed(user).get(`/api/v1/transactions/${created.body.in.id}`)).status).toBe(404);

    await authed(user).post(`/api/v1/transactions/${created.body.out.id}/restore`);
    expect((await authed(user).get(`/api/v1/transactions/${created.body.in.id}`)).status).toBe(200);
  });
});

describe('daftar transaksi', () => {
  let lister: TestUser;
  let wallet: { id: string };

  beforeAll(async () => {
    lister = await registerUser();
    wallet = await createWallet(lister, { initialBalance: 0 });
    for (let day = 1; day <= 7; day++) {
      await authed(lister)
        .post('/api/v1/transactions')
        .send({
          type: 'EXPENSE',
          amount: day * 1_000,
          walletId: wallet.id,
          categoryId: day % 2 ? 'cat_makan' : 'cat_transport',
          date: `2026-09-0${day}`,
          note: day === 3 ? 'Bakso Pak Kumis' : null,
        });
    }
  });

  it('paginasi cursor tanpa duplikat, urut tanggal terbaru dulu', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await authed(lister)
        .get('/api/v1/transactions')
        .query({ limit: 3, ...(cursor && { cursor }) });
      expect(res.status).toBe(200);
      seen.push(...res.body.items.map((t: { date: string }) => t.date));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual([...seen].sort().reverse());
    expect(new Set(seen).size).toBe(7);
  });

  it('filter rentang tanggal, kategori, dan pencarian catatan/kategori', async () => {
    const range = await authed(lister)
      .get('/api/v1/transactions')
      .query({ from: '2026-09-02', to: '2026-09-04' });
    expect(range.body.items).toHaveLength(3);

    const cat = await authed(lister)
      .get('/api/v1/transactions')
      .query({ categoryId: 'cat_transport' });
    expect(cat.body.items).toHaveLength(3);

    const q = await authed(lister).get('/api/v1/transactions').query({ q: 'bakso' });
    expect(q.body.items).toHaveLength(1);
    const qCat = await authed(lister).get('/api/v1/transactions').query({ q: 'transport' });
    expect(qCat.body.items).toHaveLength(3);
  });

  it('menolak cursor rusak dan rentang terbalik', async () => {
    const bad = await authed(lister).get('/api/v1/transactions').query({ cursor: 'bukan-cursor' });
    expect(bad.status).toBe(400);
    const flipped = await authed(lister)
      .get('/api/v1/transactions')
      .query({ from: '2026-09-05', to: '2026-09-01' });
    expect(flipped.status).toBe(400);
  });
});

describe('idempotency', () => {
  it('permintaan ulang dengan kunci sama tidak membuat data ganda', async () => {
    const key = randomUUID();
    const body = expense({ amount: 3_333 });
    const first = await authed(user)
      .post('/api/v1/transactions')
      .set('Idempotency-Key', key)
      .send(body);
    const second = await authed(user)
      .post('/api/v1/transactions')
      .set('Idempotency-Key', key)
      .send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.id).toBe(first.body.id);

    const other = await authed(user)
      .post('/api/v1/transactions')
      .set('Idempotency-Key', key)
      .send(expense({ amount: 4_444 }));
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('respons gagal tidak disimpan sehingga kunci bisa dipakai ulang', async () => {
    const key = randomUUID();
    const bad = await authed(user)
      .post('/api/v1/transactions')
      .set('Idempotency-Key', key)
      .send(expense({ amount: 0 }));
    expect(bad.status).toBe(400);
    const fixed = await authed(user)
      .post('/api/v1/transactions')
      .set('Idempotency-Key', key)
      .send(expense({ amount: 0 }));
    expect(fixed.status).toBe(400);
    expect(fixed.headers['idempotent-replayed']).toBeUndefined();
  });
});
