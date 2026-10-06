import { beforeAll, describe, expect, it } from 'vitest';
import { authed, createWallet, registerUser, type TestUser } from './helpers';

let user: TestUser;

beforeAll(async () => {
  user = await registerUser();
});

describe('dompet', () => {
  it('membuat dompet dan menghitung saldo dari saldo awal', async () => {
    const res = await authed(user)
      .post('/api/v1/wallets')
      .send({ name: 'BCA', type: 'BANK', initialBalance: 1_500_000 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'BCA',
      type: 'BANK',
      initialBalance: 1_500_000,
      balance: 1_500_000,
      color: '#0F766E',
      archivedAt: null,
      lastUsedAt: null,
    });
  });

  it('menolak input tidak valid dengan detail per field', async () => {
    const res = await authed(user)
      .post('/api/v1/wallets')
      .send({ name: '', type: 'KRIPTO', initialBalance: 1.5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.fields)).toEqual(
      expect.arrayContaining(['name', 'type', 'initialBalance']),
    );
  });

  it('mengarsipkan lewat PATCH dan menyembunyikannya dari daftar default', async () => {
    const w = await createWallet(user, { name: 'Lama' });
    const patched = await authed(user).patch(`/api/v1/wallets/${w.id}`).send({ archived: true });
    expect(patched.status).toBe(200);
    expect(patched.body.archivedAt).not.toBeNull();

    const list = await authed(user).get('/api/v1/wallets');
    expect(list.body.items.map((x: { id: string }) => x.id)).not.toContain(w.id);
    const all = await authed(user).get('/api/v1/wallets?includeArchived=true');
    expect(all.body.items.map((x: { id: string }) => x.id)).toContain(w.id);
  });

  it('menghapus permanen dompet kosong, mengarsipkan dompet yang punya riwayat', async () => {
    const empty = await createWallet(user, { name: 'Kosong' });
    const del1 = await authed(user).delete(`/api/v1/wallets/${empty.id}`);
    expect(del1.body.result).toBe('deleted');
    expect((await authed(user).get(`/api/v1/wallets/${empty.id}`)).status).toBe(404);

    const used = await createWallet(user, { name: 'Dipakai' });
    await authed(user).post('/api/v1/transactions').send({
      type: 'EXPENSE',
      amount: 10_000,
      walletId: used.id,
      categoryId: 'cat_makan',
      date: '2026-10-01',
    });
    const del2 = await authed(user).delete(`/api/v1/wallets/${used.id}`);
    expect(del2.body.result).toBe('archived');
    expect((await authed(user).get(`/api/v1/wallets/${used.id}`)).body.archivedAt).not.toBeNull();
  });
});

describe('kategori', () => {
  it('menampilkan kategori bawaan dan bisa difilter per tipe', async () => {
    const res = await authed(user).get('/api/v1/categories?type=INCOME');
    expect(res.status).toBe(200);
    const names = res.body.items.map((c: { name: string }) => c.name);
    expect(names).toContain('Gaji');
    expect(names).not.toContain('Makan');
    expect(names[names.length - 1]).toBe('Lainnya');
    expect(res.body.items.every((c: { isDefault: boolean }) => c.isDefault)).toBe(true);
  });

  it('membuat, mengubah, dan mengarsipkan kategori kustom', async () => {
    const created = await authed(user)
      .post('/api/v1/categories')
      .send({ name: 'Kopi', type: 'EXPENSE', icon: 'coffee', color: '#92400E' });
    expect(created.status).toBe(201);
    expect(created.body.isDefault).toBe(false);

    const renamed = await authed(user)
      .patch(`/api/v1/categories/${created.body.id}`)
      .send({ name: 'Ngopi' });
    expect(renamed.body.name).toBe('Ngopi');

    expect((await authed(user).delete(`/api/v1/categories/${created.body.id}`)).status).toBe(204);
    const list = await authed(user).get('/api/v1/categories');
    expect(list.body.items.map((c: { id: string }) => c.id)).not.toContain(created.body.id);
  });

  it('menolak nama duplikat (tanpa membedakan huruf besar) dalam tipe yang sama', async () => {
    const res = await authed(user)
      .post('/api/v1/categories')
      .send({ name: 'makan', type: 'EXPENSE' });
    expect(res.status).toBe(409);
    expect(res.body.error.fields.name).toBeDefined();
  });

  it('kategori bawaan tidak bisa diubah atau dihapus', async () => {
    const patch = await authed(user).patch('/api/v1/categories/cat_makan').send({ name: 'X' });
    expect(patch.status).toBe(403);
    expect(patch.body.error.code).toBe('FORBIDDEN');
    expect((await authed(user).delete('/api/v1/categories/cat_makan')).status).toBe(403);
  });
});
