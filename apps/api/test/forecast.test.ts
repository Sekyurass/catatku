import { FEATURE_FLAGS, type ForecastDTO } from '@catatku/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toDbDate } from '../src/lib/money';
import { prisma } from '../src/lib/prisma';
import { getForecast } from '../src/modules/reports/forecast.service';
import { authed, createWallet, registerUser, type TestUser } from './helpers';

const KEY = FEATURE_FLAGS.FORECAST;
const TODAY = '2025-04-10';

beforeAll(async () => {
  await prisma.featureFlag.upsert({ where: { key: KEY }, create: { key: KEY }, update: {} });
});

afterAll(async () => {
  await prisma.featureFlag.update({
    where: { key: KEY },
    data: { enabled: false, plan: null, userIds: [] },
  });
});

async function rule(
  user: TestUser,
  walletId: string,
  data: {
    type: 'INCOME' | 'EXPENSE';
    amount: number;
    startDate: string;
    nextIndex?: number;
    nextRunAt?: string | null;
    frequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    pausedAt?: Date;
    endDate?: string;
  },
) {
  return prisma.recurringRule.create({
    data: {
      userId: user.id,
      walletId,
      categoryId: data.type === 'INCOME' ? 'cat_gaji' : 'cat_tagihan',
      type: data.type,
      amount: BigInt(data.amount),
      frequency: data.frequency ?? 'MONTHLY',
      startDate: toDbDate(data.startDate),
      endDate: data.endDate ? toDbDate(data.endDate) : null,
      nextIndex: data.nextIndex ?? 0,
      nextRunAt: data.nextRunAt === null ? null : toDbDate(data.nextRunAt ?? data.startDate),
      pausedAt: data.pausedAt ?? null,
    },
  });
}

describe('perkiraan akhir bulan', () => {
  it('flag nonaktif: 404; aktif: 200', async () => {
    const user = await registerUser();
    expect((await authed(user).get('/api/v1/reports/forecast')).status).toBe(404);
    await prisma.featureFlag.update({
      where: { key: KEY },
      data: { enabled: true, plan: 'PREMIUM', userIds: { push: user.id } },
    });
    const res = await authed(user).get('/api/v1/reports/forecast').expect(200);
    expect((res.body as ForecastDTO).enoughData).toBe(false);
  });

  it('rata-rata harian tanpa transfer & transaksi berulang; tagihan dan pemasukan terjadwal', async () => {
    const user = await registerUser();
    const wallet = await createWallet(user, { initialBalance: 10_000_000 });
    const other = await createWallet(user, { name: 'BCA', type: 'BANK' });
    const add = (body: Record<string, unknown>) =>
      authed(user)
        .post('/api/v1/transactions')
        .send({ type: 'EXPENSE', walletId: wallet.id, categoryId: 'cat_makan', ...body })
        .expect(201);

    // 30 hari sebelum TODAY: 2025-03-11 … 2025-04-09.
    await add({ amount: 50_000, date: '2025-03-01' }); // aktivitas pertama, di luar jendela
    await add({ amount: 600_000, date: '2025-03-20' });
    await add({ amount: 300_000, date: '2025-04-09' });
    await add({ amount: 999_000, date: TODAY }); // hari ini: masuk saldo, bukan rata-rata
    await add({ amount: 1_000_000, date: '2025-03-10' }); // di luar jendela
    await authed(user)
      .post('/api/v1/transactions/transfer')
      .send({
        fromWalletId: wallet.id,
        toWalletId: other.id,
        amount: 2_000_000,
        date: '2025-04-01',
      })
      .expect(201);

    const internet = await rule(user, wallet.id, {
      type: 'EXPENSE',
      amount: 400_000,
      startDate: '2025-03-25',
      nextIndex: 1,
      nextRunAt: '2025-04-25',
    });
    // Tagihan bulan ini yang sudah tercatat tidak ikut rata-rata.
    await add({ amount: 400_000, date: '2025-03-25' });
    await prisma.transaction.updateMany({
      where: { userId: user.id, date: toDbDate('2025-03-25') },
      data: { recurringRuleId: internet.id },
    });
    await rule(user, wallet.id, { type: 'INCOME', amount: 3_000_000, startDate: '2025-04-28' });
    await rule(user, wallet.id, { type: 'EXPENSE', amount: 50_000, startDate: '2025-05-01' }); // bulan depan
    await rule(user, wallet.id, {
      type: 'EXPENSE',
      amount: 70_000,
      startDate: '2025-04-15',
      pausedAt: new Date(),
    });
    await rule(user, wallet.id, {
      type: 'EXPENSE',
      amount: 25_000,
      frequency: 'WEEKLY',
      startDate: '2025-04-12',
      endDate: '2025-04-20',
    }); // 12 & 19 April
    const tv = await rule(user, wallet.id, {
      type: 'EXPENSE',
      amount: 150_000,
      startDate: '2025-04-05',
      nextIndex: 1,
      nextRunAt: '2025-05-05',
      frequency: 'MONTHLY',
    });
    await prisma.recurringOccurrence.create({
      data: { ruleId: tv.id, userId: user.id, date: toDbDate('2025-04-05'), status: 'PENDING' },
    });

    const f = await getForecast(user.id, TODAY);
    expect(f.historyDays).toBe(30);
    expect(f.daily.average).toBe(30_000); // (600rb + 300rb) / 30
    expect(f.daysLeft).toBe(20);
    expect(f.upcoming.items.map((u) => [u.date, u.amount, u.status])).toEqual([
      ['2025-04-05', 150_000, 'pending'],
      ['2025-04-12', 25_000, 'scheduled'],
      ['2025-04-19', 25_000, 'scheduled'],
      ['2025-04-25', 400_000, 'scheduled'],
      ['2025-04-28', 3_000_000, 'scheduled'],
    ]);
    expect(f.upcoming.expense).toBe(600_000);
    expect(f.upcoming.income).toBe(3_000_000);
    expect(f.projected.mid).toBe(f.balance + 3_000_000 - 600_000 - 30_000 * 20);
    expect(f.projected.low).toBeLessThanOrEqual(f.projected.mid);
    expect(f.projected.high).toBeGreaterThanOrEqual(f.projected.mid);

    // Pengguna lain tidak terpengaruh.
    const stranger = await registerUser();
    const s = await getForecast(stranger.id, TODAY);
    expect(s.upcoming.items).toHaveLength(0);
    expect(s.historyDays).toBe(0);
  });

  it('dompet diarsipkan tidak ikut', async () => {
    const user = await registerUser();
    const wallet = await createWallet(user, { initialBalance: 1_000_000 });
    await authed(user)
      .post('/api/v1/transactions')
      .send({
        type: 'EXPENSE',
        walletId: wallet.id,
        categoryId: 'cat_makan',
        amount: 70_000,
        date: '2025-04-01',
      })
      .expect(201);
    await rule(user, wallet.id, { type: 'EXPENSE', amount: 99_000, startDate: '2025-04-20' });
    await prisma.wallet.update({ where: { id: wallet.id }, data: { archivedAt: new Date() } });
    const f = await getForecast(user.id, TODAY);
    expect(f.daily.average).toBe(0);
    expect(f.upcoming.items).toHaveLength(0);
  });
});
