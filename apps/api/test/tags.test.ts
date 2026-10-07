import { FEATURE_FLAGS, type TagDTO, type TransactionDTO } from '@catatku/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { authed, createWallet, registerUser, type TestUser } from './helpers';

const KEY = FEATURE_FLAGS.TAGS;

async function enableFor(user: TestUser) {
  await prisma.featureFlag.upsert({
    where: { key: KEY },
    create: { key: KEY, enabled: true, plan: 'PREMIUM', userIds: [user.id] },
    update: { enabled: true, plan: 'PREMIUM', userIds: { push: user.id } },
  });
}

beforeAll(async () => {
  await prisma.featureFlag.upsert({ where: { key: KEY }, create: { key: KEY }, update: {} });
});

afterAll(async () => {
  await prisma.featureFlag.update({
    where: { key: KEY },
    data: { enabled: false, plan: null, userIds: [] },
  });
});

const expense = (walletId: string, extra: Record<string, unknown> = {}) => ({
  type: 'EXPENSE' as const,
  amount: 50_000,
  walletId,
  categoryId: 'cat_makan',
  date: '2026-10-07',
  ...extra,
});

async function newUser() {
  const user = await registerUser();
  await enableFor(user);
  const wallet = await createWallet(user, { initialBalance: 1_000_000 });
  return { user, wallet };
}

describe('tag transaksi', () => {
  it('flag nonaktif: rute 404 dan tag di body diabaikan', async () => {
    const user = await registerUser();
    const wallet = await createWallet(user);
    expect((await authed(user).get('/api/v1/tags')).status).toBe(404);
    expect((await authed(user).get('/api/v1/reports/by-tag')).status).toBe(404);
    const res = await authed(user)
      .post('/api/v1/transactions')
      .send(expense(wallet.id, { tags: ['liburan'] }));
    expect(res.status).toBe(201);
    expect(res.body.tags).toEqual([]);
    expect(await prisma.tag.count({ where: { userId: user.id } })).toBe(0);
  });

  it('membuat tag dari nama, menggabungkan duplikat, dan mengganti saat diedit', async () => {
    const { user, wallet } = await newUser();
    const created = await authed(user)
      .post('/api/v1/transactions')
      .send(expense(wallet.id, { tags: ['#Liburan  Bali', 'liburan bali', 'Kantor'] }));
    expect(created.status).toBe(201);
    const tx = created.body as TransactionDTO;
    expect(tx.tags.map((t) => t.name)).toEqual(['Kantor', 'Liburan Bali']);
    expect(tx.attachmentCount).toBe(0);
    const reread = await authed(user).get(`/api/v1/transactions/${tx.id}`);
    expect(reread.body.tags).toEqual(tx.tags);

    // Nama yang sama (beda huruf) memakai tag yang sudah ada.
    const second = await authed(user)
      .post('/api/v1/transactions')
      .send(expense(wallet.id, { tags: ['LIBURAN BALI'] }));
    expect(second.body.tags).toEqual([tx.tags[1]]);

    const edited = await authed(user)
      .patch(`/api/v1/transactions/${tx.id}`)
      .send({ tags: ['Kantor', 'Klien'] });
    expect(edited.status).toBe(200);
    expect(edited.body.tags.map((t: TagDTO) => t.name)).toEqual(['Kantor', 'Klien']);

    // Edit tanpa `tags` tidak menyentuh tag.
    const noteOnly = await authed(user)
      .patch(`/api/v1/transactions/${tx.id}`)
      .send({ note: 'Makan siang klien' });
    expect(noteOnly.body.tags.map((t: TagDTO) => t.name)).toEqual(['Kantor', 'Klien']);

    const list = await authed(user).get('/api/v1/tags');
    expect(list.status).toBe(200);
    const counts = Object.fromEntries((list.body.items as TagDTO[]).map((t) => [t.name, t.count]));
    expect(counts).toEqual({ Kantor: 1, Klien: 1, 'Liburan Bali': 1 });
  });

  it('menolak tag terlalu banyak atau terlalu panjang', async () => {
    const { user, wallet } = await newUser();
    const many = await authed(user)
      .post('/api/v1/transactions')
      .send(expense(wallet.id, { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }));
    expect(many.status).toBe(400);
    const long = await authed(user)
      .post('/api/v1/transactions')
      .send(expense(wallet.id, { tags: ['x'.repeat(31)] }));
    expect(long.status).toBe(400);
  });

  it('filter tagId, pencarian nama tag, dan laporan per tag', async () => {
    const { user, wallet } = await newUser();
    const a = await authed(user)
      .post('/api/v1/transactions')
      .send(expense(wallet.id, { amount: 100_000, tags: ['Liburan'] }));
    await authed(user)
      .post('/api/v1/transactions')
      .send(expense(wallet.id, { amount: 40_000, tags: ['Liburan', 'Oleh-oleh'] }));
    await authed(user)
      .post('/api/v1/transactions')
      .send(expense(wallet.id, { amount: 5_000 }));
    // Terhapus: tidak ikut dihitung.
    const gone = await authed(user)
      .post('/api/v1/transactions')
      .send(expense(wallet.id, { amount: 999_000, tags: ['Liburan'] }));
    await authed(user).delete(`/api/v1/transactions/${gone.body.id}`);

    const tagId = a.body.tags[0].id as string;
    const filtered = await authed(user).get(`/api/v1/transactions?tagId=${tagId}`);
    expect(filtered.body.items).toHaveLength(2);

    const searched = await authed(user).get('/api/v1/transactions?q=oleh');
    expect(searched.body.items).toHaveLength(1);

    const report = await authed(user).get('/api/v1/reports/by-tag?month=2026-10&type=EXPENSE');
    expect(report.status).toBe(200);
    expect(report.body.items).toEqual([
      { tagId, name: 'Liburan', total: 140_000, count: 2 },
      expect.objectContaining({ name: 'Oleh-oleh', total: 40_000, count: 1 }),
    ]);
  });

  it('ganti nama (bentrok = 409) dan hapus tag tanpa menghapus transaksinya', async () => {
    const { user, wallet } = await newUser();
    const tx = await authed(user)
      .post('/api/v1/transactions')
      .send(expense(wallet.id, { tags: ['Kerja', 'Pribadi'] }));
    const [kerja, pribadi] = tx.body.tags as TagDTO[];

    const clash = await authed(user).patch(`/api/v1/tags/${kerja!.id}`).send({ name: ' pribadi ' });
    expect(clash.status).toBe(409);

    const renamed = await authed(user).patch(`/api/v1/tags/${kerja!.id}`).send({ name: 'Kantor' });
    expect(renamed.body).toEqual({ id: kerja!.id, name: 'Kantor' });

    expect((await authed(user).delete(`/api/v1/tags/${pribadi!.id}`)).status).toBe(204);
    const after = await authed(user).get(`/api/v1/transactions/${tx.body.id}`);
    expect(after.status).toBe(200);
    expect(after.body.tags).toEqual([{ id: kerja!.id, name: 'Kantor' }]);
  });

  it('tag milik pengguna lain tidak bisa diubah, dihapus, atau dipakai untuk mengintip', async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const tx = await authed(owner.user)
      .post('/api/v1/transactions')
      .send(expense(owner.wallet.id, { tags: ['Rahasia'] }));
    const tagId = tx.body.tags[0].id as string;

    expect(
      (await authed(intruder.user).patch(`/api/v1/tags/${tagId}`).send({ name: 'x' })).status,
    ).toBe(404);
    expect((await authed(intruder.user).delete(`/api/v1/tags/${tagId}`)).status).toBe(404);
    const peek = await authed(intruder.user).get(`/api/v1/transactions?tagId=${tagId}`);
    expect(peek.body.items).toEqual([]);
    expect((await authed(intruder.user).get('/api/v1/tags')).body.items).toEqual([]);
  });

  it('ekspor CSV menyertakan kolom Tag', async () => {
    const { user, wallet } = await newUser();
    await authed(user)
      .post('/api/v1/transactions')
      .send(expense(wallet.id, { tags: ['Liburan', 'Bali'] }));
    const res = await authed(user).get('/api/v1/export/transactions.csv');
    expect(res.status).toBe(200);
    const [header, row] = res.text
      .replace(/^\uFEFF/, '')
      .trim()
      .split(/\r?\n/);
    expect(header!.endsWith(',Tag')).toBe(true);
    expect(row!.endsWith('"Bali, Liburan"')).toBe(true);
  });
});
