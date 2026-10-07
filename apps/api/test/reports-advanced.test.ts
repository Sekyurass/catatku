import {
  type CompareDTO,
  FEATURE_FLAGS,
  type MonthlyReportDTO,
  type YearlyReportDTO,
} from '@catatku/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { authed, createWallet, registerUser, type TestUser } from './helpers';

const KEY = FEATURE_FLAGS.ADVANCED_REPORTS;

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

async function seed(user: TestUser) {
  const wallet = await createWallet(user, { initialBalance: 20_000_000 });
  const other = await createWallet(user, { name: 'BCA', type: 'BANK' });
  const add = (body: Record<string, unknown>) =>
    authed(user)
      .post('/api/v1/transactions')
      .send({ type: 'EXPENSE', walletId: wallet.id, categoryId: 'cat_makan', ...body })
      .expect(201);
  await add({ type: 'INCOME', amount: 8_000_000, date: '2025-04-01', categoryId: 'cat_gaji' });
  await add({
    amount: 300_000,
    date: '2025-04-05',
    note: 'Belanja bulanan',
    categoryId: 'cat_belanja',
  });
  await add({ amount: 50_000, date: '2025-04-05', note: 'Bakso' });
  await add({ amount: 120_000, date: '2025-04-14', note: 'Makan keluarga' });
  await add({ amount: 25_000, date: '2025-04-20' });
  await add({ amount: 15_000, date: '2025-04-21' });
  await add({ amount: 10_000, date: '2025-04-22' });
  await add({ amount: 100_000, date: '2025-03-10' });
  await add({ amount: 200_000, date: '2025-03-11', categoryId: 'cat_transport' });
  await add({ type: 'INCOME', amount: 7_000_000, date: '2025-03-01', categoryId: 'cat_gaji' });
  // Transfer tidak dihitung.
  await authed(user)
    .post('/api/v1/transactions/transfer')
    .send({ fromWalletId: wallet.id, toWalletId: other.id, amount: 1_000_000, date: '2025-04-05' })
    .expect(201);
}

describe('laporan lanjutan', () => {
  it('flag nonaktif: 404', async () => {
    const user = await registerUser();
    for (const url of [
      '/api/v1/reports/monthly?month=2025-04',
      '/api/v1/reports/compare?from=2025-03&to=2025-04',
      '/api/v1/reports/yearly?year=2025',
      '/api/v1/export/report.pdf?month=2025-04',
    ]) {
      expect((await authed(user).get(url)).status).toBe(404);
    }
  });

  it('bulanan, perbandingan, dan tahunan; transfer & pengguna lain tidak ikut', async () => {
    const user = await newUser();
    await seed(user);
    const other = await newUser();
    await seed(other);

    const monthly = (await authed(user).get('/api/v1/reports/monthly?month=2025-04').expect(200))
      .body as MonthlyReportDTO;
    expect(monthly).toMatchObject({
      income: 8_000_000,
      expense: 520_000,
      net: 7_480_000,
      daysCounted: 30,
      averageDaily: 17_333,
      busiestDay: { date: '2025-04-05', total: 350_000, count: 2 },
    });
    expect(monthly.daily).toHaveLength(30);
    expect(monthly.topExpenses.map((t) => t.amount)).toEqual([
      300_000, 120_000, 50_000, 25_000, 15_000,
    ]);
    expect(monthly.topExpenses[0]).toMatchObject({
      note: 'Belanja bulanan',
      category: { id: 'cat_belanja' },
    });

    const compare = (
      await authed(user).get('/api/v1/reports/compare?from=2025-03&to=2025-04').expect(200)
    ).body as CompareDTO;
    expect(compare.from).toMatchObject({ expense: 300_000, income: 7_000_000 });
    expect(compare.to).toMatchObject({ expense: 520_000 });
    const byId = (id: string) => compare.items.find((i) => i.categoryId === id);
    expect(byId('cat_belanja')).toMatchObject({ from: 0, to: 300_000, change: null });
    expect(byId('cat_transport')).toMatchObject({ from: 200_000, to: 0, change: -1 });
    expect(byId('cat_makan')).toMatchObject({ from: 100_000, to: 220_000, change: 1.2 });
    expect(compare.items[0]!.categoryId).toBe('cat_belanja');

    const yearly = (await authed(user).get('/api/v1/reports/yearly?year=2025').expect(200))
      .body as YearlyReportDTO;
    expect(yearly).toMatchObject({
      income: 15_000_000,
      expense: 820_000,
      monthsCounted: 12,
      averageMonthlyExpense: 68_333,
    });
    expect(yearly.months).toHaveLength(12);
    expect(yearly.months[2]).toMatchObject({ month: '2025-03', expense: 300_000 });
    expect(yearly.topCategories[0]).toMatchObject({ categoryId: 'cat_makan', total: 320_000 });
  });

  it('PDF laporan bulanan & validasi parameter', async () => {
    const user = await newUser();
    await seed(user);
    const res = await authed(user)
      .get('/api/v1/export/report.pdf?month=2025-04')
      .buffer(true)
      .parse((r, cb) => {
        const data: Buffer[] = [];
        r.on('data', (c: Buffer) => data.push(c));
        r.on('end', () => cb(null, Buffer.concat(data)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('catatku-laporan-2025-04.pdf');
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2_000);

    expect((await authed(user).get('/api/v1/reports/yearly?year=99')).status).toBe(400);
    expect((await authed(user).get('/api/v1/reports/compare?from=2025-3&to=2025-04')).status).toBe(
      400,
    );
  });
});
