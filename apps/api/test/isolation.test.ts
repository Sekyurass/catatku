import { beforeAll, describe, expect, it } from 'vitest';
import { authed, createWallet, registerUser, walletBalance, type TestUser } from './helpers';

/**
 * Setiap pengguna hanya boleh melihat dan mengubah datanya sendiri. Data milik orang lain
 * diperlakukan seolah tidak ada (404), supaya keberadaan id tidak bocor.
 */
let alice: TestUser;
let bob: TestUser;
let aliceWallet: { id: string };
let aliceTx: { id: string };
let aliceTransfer: { out: { id: string } };
let aliceCategory: { id: string };

beforeAll(async () => {
  [alice, bob] = await Promise.all([registerUser('Alice'), registerUser('Bob')]);
  aliceWallet = await createWallet(alice, { name: 'Rahasia Alice', initialBalance: 500_000 });
  const second = await createWallet(alice, { name: 'Kedua' });
  aliceCategory = (
    await authed(alice).post('/api/v1/categories').send({ name: 'Hobi Alice', type: 'EXPENSE' })
  ).body;
  aliceTx = (
    await authed(alice).post('/api/v1/transactions').send({
      type: 'EXPENSE',
      amount: 10_000,
      walletId: aliceWallet.id,
      categoryId: aliceCategory.id,
      date: '2026-10-01',
    })
  ).body;
  aliceTransfer = (
    await authed(alice).post('/api/v1/transactions/transfer').send({
      fromWalletId: aliceWallet.id,
      toWalletId: second.id,
      amount: 1_000,
      date: '2026-10-01',
    })
  ).body;
});

describe('isolasi data antar pengguna', () => {
  it('daftar milik Bob tidak memuat data Alice', async () => {
    const [wallets, txs, cats] = await Promise.all([
      authed(bob).get('/api/v1/wallets?includeArchived=true'),
      authed(bob).get('/api/v1/transactions'),
      authed(bob).get('/api/v1/categories'),
    ]);
    expect(wallets.body.items).toEqual([]);
    expect(txs.body.items).toEqual([]);
    expect(cats.body.items.map((c: { id: string }) => c.id)).not.toContain(aliceCategory.id);
  });

  it('Bob tidak bisa membaca, mengubah, atau menghapus dompet Alice', async () => {
    const url = `/api/v1/wallets/${aliceWallet.id}`;
    expect((await authed(bob).get(url)).status).toBe(404);
    expect((await authed(bob).patch(url).send({ name: 'Diretas' })).status).toBe(404);
    expect((await authed(bob).delete(url)).status).toBe(404);
  });

  it('Bob tidak bisa membaca, mengubah, menghapus, atau memulihkan transaksi Alice', async () => {
    for (const id of [aliceTx.id, aliceTransfer.out.id]) {
      const url = `/api/v1/transactions/${id}`;
      expect((await authed(bob).get(url)).status).toBe(404);
      expect((await authed(bob).patch(url).send({ amount: 1 })).status).toBe(404);
      expect((await authed(bob).delete(url)).status).toBe(404);
      expect((await authed(bob).post(`${url}/restore`)).status).toBe(404);
    }
  });

  it('Bob tidak bisa memakai dompet atau kategori Alice di transaksinya', async () => {
    const bobWallet = await createWallet(bob);
    const useWallet = await authed(bob).post('/api/v1/transactions').send({
      type: 'EXPENSE',
      amount: 1_000,
      walletId: aliceWallet.id,
      categoryId: 'cat_makan',
      date: '2026-10-01',
    });
    expect(useWallet.status).toBe(400);

    const useCategory = await authed(bob).post('/api/v1/transactions').send({
      type: 'EXPENSE',
      amount: 1_000,
      walletId: bobWallet.id,
      categoryId: aliceCategory.id,
      date: '2026-10-01',
    });
    expect(useCategory.status).toBe(400);

    const transferOut = await authed(bob).post('/api/v1/transactions/transfer').send({
      fromWalletId: aliceWallet.id,
      toWalletId: bobWallet.id,
      amount: 1_000,
      date: '2026-10-01',
    });
    expect(transferOut.status).toBe(400);
  });

  it('Bob tidak bisa mengubah kategori kustom Alice', async () => {
    const url = `/api/v1/categories/${aliceCategory.id}`;
    expect((await authed(bob).patch(url).send({ name: 'X' })).status).toBe(404);
    expect((await authed(bob).delete(url)).status).toBe(404);
  });

  it('kategori kustom dengan nama sama boleh dimiliki pengguna berbeda', async () => {
    const res = await authed(bob)
      .post('/api/v1/categories')
      .send({ name: 'Hobi Alice', type: 'EXPENSE' });
    expect(res.status).toBe(201);
  });

  it('saldo Alice tidak tersentuh oleh semua percobaan di atas', async () => {
    expect(await walletBalance(alice, aliceWallet.id)).toBe(500_000 - 10_000 - 1_000);
  });
});
