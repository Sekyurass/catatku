import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { createMemoryStorage, setStorageForTests } from '../src/lib/storage';
import { app, authed, createWallet, registerUser, type TestUser } from './helpers';

afterEach(() => setStorageForTests(null));

async function withData(user: TestUser) {
  const wallet = await createWallet(user, { initialBalance: 500_000 });
  const tx = await authed(user)
    .post('/api/v1/transactions')
    .send({
      type: 'EXPENSE',
      walletId: wallet.id,
      categoryId: 'cat_makan',
      amount: 25_000,
      date: '2026-10-08',
    })
    .expect(201);
  const storageKey = `lampiran/${user.id}/${tx.body.id}.webp`;
  await prisma.attachment.create({
    data: {
      userId: user.id,
      transactionId: tx.body.id,
      storageKey,
      mimeType: 'image/webp',
      size: 3,
    },
  });
  return { wallet, storageKey };
}

const remove = (user: TestUser, body: Record<string, unknown>) =>
  authed(user).delete('/api/v1/me').send(body);

describe('DELETE /me', () => {
  it('kata sandi salah / konfirmasi salah → 400, akun tetap ada', async () => {
    const user = await registerUser();
    const wrong = await remove(user, { password: 'bukan-ini', confirm: 'HAPUS' }).expect(400);
    expect(wrong.body.error.fields.password).toBe('Kata sandi salah');

    const unconfirmed = await remove(user, { password: user.password, confirm: 'hapus dong' });
    expect(unconfirmed.status).toBe(400);
    expect(unconfirmed.body.error.fields.confirm).toMatch(/Ketik HAPUS/);

    await remove(user, { password: user.password }).expect(400);
    await authed(user).get('/api/v1/me').expect(200);
  });

  it('menghapus akun, semua data, dan berkas lampiran; sesi tidak bisa dipakai lagi', async () => {
    const storage = createMemoryStorage();
    setStorageForTests(storage);
    const user = await registerUser();
    const other = await registerUser();
    const { storageKey } = await withData(user);
    const kept = await withData(other);
    storage.objects.set(storageKey, new Uint8Array([1, 2, 3]));
    storage.objects.set(kept.storageKey, new Uint8Array([4, 5, 6]));

    const res = await remove(user, { password: user.password, confirm: 'HAPUS' }).expect(204);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => /^catatku_rt=;/.test(c))).toBe(true);

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.wallet.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.attachment.count({ where: { userId: user.id } })).toBe(0);
    expect(storage.objects.has(storageKey)).toBe(false);

    expect(storage.objects.has(kept.storageKey)).toBe(true);
    expect(await prisma.wallet.count({ where: { userId: other.id } })).toBe(1);

    await request(app).post('/api/v1/auth/refresh').set('Cookie', user.cookie).expect(401);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(401);
    // Email bisa dipakai mendaftar lagi sebagai akun baru.
    await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Baru', email: user.email, password: 'rahasia123', acceptPrivacy: true })
      .expect(201);
  });

  it('berkas gagal dihapus → 503 dan akun tidak dihapus', async () => {
    const storage = createMemoryStorage();
    setStorageForTests({
      ...storage,
      remove: async () => {
        throw new Error('storage down');
      },
    });
    const user = await registerUser();
    await withData(user);
    const res = await remove(user, { password: user.password, confirm: 'HAPUS' });
    expect(res.status).toBe(503);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });
});
