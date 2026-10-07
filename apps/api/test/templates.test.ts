import { randomUUID } from 'node:crypto';
import { FEATURE_FLAGS, MAX_TEMPLATES } from '@catatku/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { authed, createWallet, registerUser, type TestUser, walletBalance } from './helpers';

const KEY = FEATURE_FLAGS.TEMPLATES;

/** Allowlist per pengguna (plan PREMIUM) agar pengguna tes lain tetap melihat flag mati. */
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

const kopi = (walletId: string) => ({
  name: 'Kopi',
  type: 'EXPENSE' as const,
  amount: 18_000,
  walletId,
  categoryId: 'cat_makan',
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

describe('akses /templates', () => {
  it('404 bila flag nonaktif untuk pengguna', async () => {
    const user = await registerUser();
    expect((await authed(user).get('/api/v1/templates')).status).toBe(404);
  });
});

describe('CRUD template', () => {
  it('membuat, mengurutkan sesuai waktu dibuat, mengubah, dan menghapus', async () => {
    const { user, wallet } = await setup();
    const api = authed(user);
    const a = await api.post('/api/v1/templates').send(kopi(wallet.id));
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({
      name: 'Kopi',
      amount: 18_000,
      usable: true,
      category: { id: 'cat_makan', name: 'Makan' },
      wallet: { id: wallet.id, name: 'Tunai' },
    });
    const b = await api
      .post('/api/v1/templates')
      .send({ ...kopi(wallet.id), name: 'Bensin', amount: undefined, categoryId: 'cat_transport' });
    expect(b.status).toBe(201);
    expect(b.body.amount).toBeNull();

    const list = await api.get('/api/v1/templates');
    expect(list.body.items.map((t: { name: string }) => t.name)).toEqual(['Kopi', 'Bensin']);

    const patched = await api
      .patch(`/api/v1/templates/${a.body.id}`)
      .send({ name: 'Kopi susu', amount: null });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ name: 'Kopi susu', amount: null });

    expect((await api.delete(`/api/v1/templates/${a.body.id}`)).status).toBe(204);
    expect((await api.get('/api/v1/templates')).body.items).toHaveLength(1);
  });

  it('memvalidasi nama, kategori sesuai tipe, dan dompet aktif', async () => {
    const { user, wallet } = await setup();
    const api = authed(user);
    const noName = await api.post('/api/v1/templates').send({ ...kopi(wallet.id), name: '  ' });
    expect(noName.status).toBe(400);
    expect(noName.body.error.fields.name).toBeDefined();

    const wrongType = await api
      .post('/api/v1/templates')
      .send({ ...kopi(wallet.id), categoryId: 'cat_gaji' });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.error.fields.categoryId).toBeDefined();
  });

  it(`maksimal ${MAX_TEMPLATES} template per pengguna`, async () => {
    const { user, wallet } = await setup();
    await prisma.transactionTemplate.createMany({
      data: Array.from({ length: MAX_TEMPLATES }, (_, i) => ({
        userId: user.id,
        walletId: wallet.id,
        categoryId: 'cat_makan',
        type: 'EXPENSE' as const,
        name: `T${i}`,
        sortOrder: i,
      })),
    });
    const res = await authed(user).post('/api/v1/templates').send(kopi(wallet.id));
    expect(res.status).toBe(409);
  });

  it('mengatur ulang urutan; harus memuat semua template tepat sekali', async () => {
    const { user, wallet } = await setup();
    const api = authed(user);
    const ids: string[] = [];
    for (const name of ['A', 'B', 'C']) {
      ids.push((await api.post('/api/v1/templates').send({ ...kopi(wallet.id), name })).body.id);
    }
    const res = await api.put('/api/v1/templates/order').send({ ids: [ids[2], ids[0], ids[1]] });
    expect(res.status).toBe(200);
    expect(res.body.items.map((t: { name: string }) => t.name)).toEqual(['C', 'A', 'B']);

    const partial = await api.put('/api/v1/templates/order').send({ ids: [ids[0], ids[1]] });
    expect(partial.status).toBe(400);
    const dup = await api.put('/api/v1/templates/order').send({ ids: [ids[0], ids[0], ids[1]] });
    expect(dup.status).toBe(400);
  });
});

describe('Cepat catat (POST /templates/:id/use)', () => {
  it('mencatat transaksi dengan nama template sebagai catatan; saldo berkurang', async () => {
    const { user, wallet } = await setup();
    const api = authed(user);
    const tpl = (await api.post('/api/v1/templates').send(kopi(wallet.id))).body;
    const res = await api.post(`/api/v1/templates/${tpl.id}/use`).send({ date: '2026-10-07' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'EXPENSE',
      amount: -18_000,
      note: 'Kopi',
      date: '2026-10-07',
      categoryId: 'cat_makan',
      walletId: wallet.id,
    });
    expect(await walletBalance(user, wallet.id)).toBe(82_000);
  });

  it('nominal bisa diubah saat dipakai; template tanpa nominal wajib diisi', async () => {
    const { user, wallet } = await setup();
    const api = authed(user);
    const tpl = (
      await api.post('/api/v1/templates').send({ ...kopi(wallet.id), name: 'Bensin', amount: null })
    ).body;
    const missing = await api.post(`/api/v1/templates/${tpl.id}/use`).send({ date: '2026-10-07' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.fields.amount).toBeDefined();

    const ok = await api
      .post(`/api/v1/templates/${tpl.id}/use`)
      .send({ date: '2026-10-07', amount: 30_000 });
    expect(ok.status).toBe(201);
    expect(ok.body.amount).toBe(-30_000);
  });

  it('idempoten: tap ganda dengan kunci yang sama hanya mencatat sekali', async () => {
    const { user, wallet } = await setup();
    const api = authed(user);
    const tpl = (await api.post('/api/v1/templates').send(kopi(wallet.id))).body;
    const key = randomUUID();
    const send = () =>
      api
        .post(`/api/v1/templates/${tpl.id}/use`)
        .set('Idempotency-Key', key)
        .send({ date: '2026-10-07' });
    const first = await send();
    const second = await send();
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(1);
  });

  it('dompet diarsipkan: template ditandai tidak bisa dipakai dan pemakaian ditolak', async () => {
    const { user, wallet } = await setup();
    const api = authed(user);
    const tpl = (await api.post('/api/v1/templates').send(kopi(wallet.id))).body;
    await prisma.wallet.update({ where: { id: wallet.id }, data: { archivedAt: new Date() } });
    const list = await api.get('/api/v1/templates');
    expect(list.body.items[0].usable).toBe(false);
    const res = await api.post(`/api/v1/templates/${tpl.id}/use`).send({ date: '2026-10-07' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.walletId).toBeDefined();
  });
});

describe('isolasi template', () => {
  it('template, dompet, dan kategori milik pengguna lain tidak bisa disentuh', async () => {
    const owner = await setup();
    const other = await setup();
    const tpl = (await authed(owner.user).post('/api/v1/templates').send(kopi(owner.wallet.id)))
      .body;
    const api = authed(other.user);
    expect((await api.patch(`/api/v1/templates/${tpl.id}`).send({ name: 'X' })).status).toBe(404);
    expect((await api.delete(`/api/v1/templates/${tpl.id}`)).status).toBe(404);
    expect(
      (await api.post(`/api/v1/templates/${tpl.id}/use`).send({ date: '2026-10-07' })).status,
    ).toBe(404);
    expect((await api.put('/api/v1/templates/order').send({ ids: [tpl.id] })).status).toBe(404);
    expect((await api.get('/api/v1/templates')).body.items).toEqual([]);

    const foreignWallet = await api.post('/api/v1/templates').send(kopi(owner.wallet.id));
    expect(foreignWallet.status).toBe(400);
    expect(foreignWallet.body.error.fields.walletId).toBeDefined();
  });
});
