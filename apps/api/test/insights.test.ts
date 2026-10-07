import { FEATURE_FLAGS, type InsightDTO, toDateString } from '@catatku/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { authed, createWallet, registerUser, type TestUser } from './helpers';

const KEY = FEATURE_FLAGS.INSIGHTS;
const today = toDateString();
const daysAgo = (n: number) =>
  new Date(Date.parse(today) - n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  await prisma.featureFlag.upsert({ where: { key: KEY }, create: { key: KEY }, update: {} });
});

afterAll(async () => {
  await prisma.featureFlag.update({
    where: { key: KEY },
    data: { enabled: false, plan: null, userIds: [] },
  });
});

async function newUser() {
  const user = await registerUser();
  await prisma.featureFlag.update({
    where: { key: KEY },
    data: { enabled: true, plan: 'PREMIUM', userIds: { push: user.id } },
  });
  return user;
}

async function spend(user: TestUser, walletId: string, body: Record<string, unknown>) {
  await authed(user)
    .post('/api/v1/transactions')
    .send({ type: 'EXPENSE', walletId, categoryId: 'cat_belanja', ...body })
    .expect(201);
}

async function seedHistory(user: TestUser) {
  const wallet = await createWallet(user, { initialBalance: 10_000_000 });
  for (const n of [33, 3]) {
    await spend(user, wallet.id, {
      amount: 54_000,
      date: daysAgo(n),
      note: 'Netflix',
      categoryId: 'cat_hiburan',
    });
  }
  for (const n of [80, 65, 50, 35, 20]) {
    await spend(user, wallet.id, { amount: 100_000, date: daysAgo(n) });
  }
  await spend(user, wallet.id, { amount: 700_000, date: daysAgo(1), note: 'Kulkas' });
  return wallet;
}

const list = async (user: TestUser) => {
  const res = await authed(user).get('/api/v1/insights');
  expect(res.status).toBe(200);
  return res.body.items as InsightDTO[];
};

describe('insight', () => {
  it('flag nonaktif: semua rute 404', async () => {
    const user = await registerUser();
    expect((await authed(user).get('/api/v1/insights')).status).toBe(404);
    const res = await authed(user).post('/api/v1/insights/new_subscription:netflix/dismiss');
    expect(res.status).toBe(404);
  });

  it('mendeteksi langganan & pengeluaran tak biasa dari data pengguna saja', async () => {
    const user = await newUser();
    const wallet = await seedHistory(user);
    const items = await list(user);

    const sub = items.find((i) => i.kind === 'new_subscription');
    expect(sub).toMatchObject({
      id: 'new_subscription:netflix',
      detail: { amount: 54_000, lastDate: daysAgo(3), walletId: wallet.id },
    });
    const unusual = items.find((i) => i.kind === 'unusual_expense');
    expect(unusual).toMatchObject({ detail: { median: 100_000, multiple: 7, sampleSize: 5 } });

    const other = await newUser();
    expect(await list(other)).toEqual([]);
  });

  it('transaksi yang sudah berulang tidak disarankan lagi', async () => {
    const user = await newUser();
    const wallet = await seedHistory(user);
    await prisma.recurringRule.create({
      data: {
        userId: user.id,
        walletId: wallet.id,
        categoryId: 'cat_hiburan',
        type: 'EXPENSE',
        amount: 54_000n,
        note: 'Netflix bulanan',
        frequency: 'MONTHLY',
        interval: 1,
        startDate: new Date(`${today}T00:00:00.000Z`),
        nextIndex: 1,
      },
    });
    expect((await list(user)).some((i) => i.kind === 'new_subscription')).toBe(false);
  });

  it('tutup lalu batalkan; id tidak dikenal ditolak', async () => {
    const user = await newUser();
    await seedHistory(user);
    const id = 'new_subscription:netflix';
    const url = `/api/v1/insights/${encodeURIComponent(id)}/dismiss`;

    expect((await authed(user).post(url)).status).toBe(204);
    expect((await authed(user).post(url)).status).toBe(204);
    expect((await list(user)).some((i) => i.id === id)).toBe(false);

    const other = await newUser();
    await seedHistory(other);
    expect((await list(other)).some((i) => i.id === id)).toBe(true);

    expect((await authed(user).delete(url)).status).toBe(204);
    expect((await list(user)).some((i) => i.id === id)).toBe(true);

    const bad = await authed(user).post('/api/v1/insights/apa-saja/dismiss');
    expect(bad.status).toBe(400);
  });
});
