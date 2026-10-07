import { FEATURE_FLAGS, type CategoryMapDTO } from '@catatku/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { authed, createWallet, registerUser, type TestUser } from './helpers';

const KEY = FEATURE_FLAGS.AUTO_CATEGORY;

async function enableFor(user: TestUser) {
  await prisma.featureFlag.upsert({
    where: { key: KEY },
    create: { key: KEY, enabled: true, plan: 'PREMIUM', userIds: [user.id] },
    update: { enabled: true, plan: 'PREMIUM', userIds: { push: user.id } },
  });
}

/** Pemetaan dipelajari fire-and-forget setelah transaksi tersimpan, jadi tunggu sebentar. */
async function learned(user: TestUser, until: (items: CategoryMapDTO[]) => boolean) {
  let items: CategoryMapDTO[] = [];
  for (let i = 0; i < 40; i++) {
    const res = await authed(user).get('/api/v1/categories/learned');
    expect(res.status).toBe(200);
    items = (res.body as { items: CategoryMapDTO[] }).items;
    if (until(items)) return items;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Pemetaan kategori tidak sesuai: ${JSON.stringify(items)}`);
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

const expense = (walletId: string, note: string, categoryId: string) => ({
  type: 'EXPENSE' as const,
  amount: 25_000,
  walletId,
  categoryId,
  date: '2026-10-07',
  note,
});

describe('kategori yang dipelajari', () => {
  it('404 bila flag nonaktif, dan tidak belajar diam-diam', async () => {
    const user = await registerUser();
    const wallet = await createWallet(user, { initialBalance: 100_000 });
    expect((await authed(user).get('/api/v1/categories/learned')).status).toBe(404);
    await authed(user)
      .post('/api/v1/transactions')
      .send(expense(wallet.id, 'Kopi Kenangan', 'cat_makan'));
    await new Promise((r) => setTimeout(r, 1500));
    expect(await prisma.merchantCategoryMap.count({ where: { userId: user.id } })).toBe(0);
  });

  it('belajar dari transaksi baru dan koreksi saat diedit, per pengguna', async () => {
    const user = await registerUser();
    const other = await registerUser();
    await enableFor(user);
    await enableFor(other);
    const wallet = await createWallet(user, { initialBalance: 100_000 });
    const api = authed(user);

    const created = await api
      .post('/api/v1/transactions')
      .send(expense(wallet.id, 'Hotways Chicken Bali: Paha Atas Crispy', 'cat_belanja'));
    expect(created.status).toBe(201);
    await learned(user, (items) =>
      items.some((i) => i.key === 'hotways chicken bali' && i.categoryId === 'cat_belanja'),
    );

    // Pengguna mengoreksi kategori: koreksi langsung menjadi saran berikutnya.
    const id = (created.body as { id: string }).id;
    expect(
      (await api.patch(`/api/v1/transactions/${id}`).send({ categoryId: 'cat_makan' })).status,
    ).toBe(200);
    const items = await learned(user, (list) =>
      list.some((i) => i.key === 'hotways chicken bali' && i.categoryId === 'cat_makan'),
    );
    expect(items).toEqual([
      { key: 'hotways chicken bali', type: 'EXPENSE', categoryId: 'cat_makan' },
    ]);
    const row = await prisma.merchantCategoryMap.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.hits).toBe(2);

    // Catatan tanpa huruf tidak dipelajari; pengguna lain tidak melihat pemetaan ini.
    await api.post('/api/v1/transactions').send(expense(wallet.id, '12345', 'cat_lainnya_keluar'));
    const otherRes = await authed(other).get('/api/v1/categories/learned');
    expect(otherRes.body).toEqual({ items: [] });
  });

  it('kategori yang diarsipkan tidak lagi disarankan', async () => {
    const user = await registerUser();
    await enableFor(user);
    const wallet = await createWallet(user, { initialBalance: 100_000 });
    const api = authed(user);
    const cat = await api
      .post('/api/v1/categories')
      .send({ name: 'Ngopi', type: 'EXPENSE', icon: 'utensils', color: '#F97316' });
    const catId = (cat.body as { id: string }).id;
    await api.post('/api/v1/transactions').send(expense(wallet.id, 'Kopi Tuku', catId));
    await learned(user, (items) => items.some((i) => i.categoryId === catId));

    expect((await api.delete(`/api/v1/categories/${catId}`)).status).toBe(204);
    const res = await api.get('/api/v1/categories/learned');
    expect(res.body).toEqual({ items: [] });
  });
});
