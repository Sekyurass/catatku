import { currentMonth, shiftMonth } from '@catatku/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { authed, createWallet, registerUser, type TestUser } from './helpers';

const month = currentMonth();
const lastMonth = shiftMonth(month, -1);

let user: TestUser;
let cash: { id: string };
let bank: { id: string };

beforeAll(async () => {
  user = await registerUser();
  cash = await createWallet(user, { name: 'Tunai', initialBalance: 100_000 });
  bank = await createWallet(user, { name: 'BCA', type: 'BANK', initialBalance: 1_000_000 });
  const tx = (body: Record<string, unknown>) =>
    authed(user).post('/api/v1/transactions').send(body).expect(201);

  await tx({
    type: 'INCOME',
    amount: 500_000,
    walletId: bank.id,
    categoryId: 'cat_gaji',
    date: `${month}-01`,
  });
  await tx({
    type: 'EXPENSE',
    amount: 90_000,
    walletId: cash.id,
    categoryId: 'cat_makan',
    date: `${month}-01`,
  });
  await tx({
    type: 'EXPENSE',
    amount: 30_000,
    walletId: bank.id,
    categoryId: 'cat_transport',
    date: `${month}-01`,
  });
  await tx({
    type: 'EXPENSE',
    amount: 70_000,
    walletId: cash.id,
    categoryId: 'cat_makan',
    date: `${lastMonth}-15`,
  });
  const removed = await tx({
    type: 'EXPENSE',
    amount: 999_000,
    walletId: cash.id,
    categoryId: 'cat_makan',
    date: `${month}-01`,
  });
  await authed(user).delete(`/api/v1/transactions/${removed.body.id}`).expect(204);
  await authed(user)
    .post('/api/v1/transactions/transfer')
    .send({ fromWalletId: bank.id, toWalletId: cash.id, amount: 40_000, date: `${month}-01` })
    .expect(201);
});

describe('GET /reports/summary', () => {
  it('menjumlah pemasukan/pengeluaran bulan ini tanpa transfer & transaksi terhapus', async () => {
    const res = await authed(user).get('/api/v1/reports/summary').query({ month });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      month,
      income: 500_000,
      expense: 120_000,
      net: 380_000,
      // 1.100.000 + 500.000 − 90.000 − 30.000 − 70.000 (transfer netral)
      totalBalance: 1_410_000,
    });
  });

  it('5 transaksi terakhir, transfer tampil sekali', async () => {
    const res = await authed(user).get('/api/v1/reports/summary');
    expect(res.body.recent).toHaveLength(5);
    const transfers = res.body.recent.filter((t: { type: string }) => t.type === 'TRANSFER');
    expect(transfers).toHaveLength(1);
    expect(transfers[0].amount).toBeLessThan(0);
  });

  it('dompet yang diarsipkan tidak ikut total saldo', async () => {
    const other = await registerUser();
    await createWallet(other, { initialBalance: 10_000 });
    const old = await createWallet(other, { name: 'Lama', initialBalance: 5_000 });
    await authed(other).patch(`/api/v1/wallets/${old.id}`).send({ archived: true });
    const res = await authed(other).get('/api/v1/reports/summary');
    expect(res.body.totalBalance).toBe(10_000);
  });

  it('menolak format bulan yang salah', async () => {
    const res = await authed(user).get('/api/v1/reports/summary').query({ month: '2026-13' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.month).toBeDefined();
  });
});

describe('GET /reports/by-category', () => {
  it('pengeluaran per kategori, urut terbesar, rasio berjumlah 1', async () => {
    const res = await authed(user).get('/api/v1/reports/by-category').query({ month });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('EXPENSE');
    expect(res.body.total).toBe(120_000);
    expect(res.body.items.map((i: { name: string }) => i.name)).toEqual(['Makan', 'Transport']);
    expect(res.body.items[0]).toMatchObject({
      total: 90_000,
      ratio: 0.75,
      count: 1,
      icon: 'utensils',
    });
    const sum = res.body.items.reduce((s: number, i: { ratio: number }) => s + i.ratio, 0);
    expect(sum).toBeCloseTo(1);
  });

  it('pemasukan per kategori dengan type=INCOME', async () => {
    const res = await authed(user)
      .get('/api/v1/reports/by-category')
      .query({ month, type: 'INCOME' });
    expect(res.body.items).toEqual([
      expect.objectContaining({ name: 'Gaji', total: 500_000, ratio: 1 }),
    ]);
  });

  it('bulan tanpa data mengembalikan daftar kosong', async () => {
    const res = await authed(user)
      .get('/api/v1/reports/by-category')
      .query({ month: shiftMonth(month, -20) });
    expect(res.body).toMatchObject({ total: 0, items: [] });
  });
});

describe('GET /reports/trend', () => {
  it('6 bulan terakhir urut naik, bulan kosong bernilai 0', async () => {
    const res = await authed(user).get('/api/v1/reports/trend');
    expect(res.status).toBe(200);
    expect(res.body.months).toHaveLength(6);
    expect(res.body.months.at(-1)).toEqual({ month, income: 500_000, expense: 120_000 });
    expect(res.body.months.at(-2)).toEqual({ month: lastMonth, income: 0, expense: 70_000 });
    expect(res.body.months[0]).toEqual({ month: shiftMonth(month, -5), income: 0, expense: 0 });
  });

  it('membatasi jumlah bulan 1–24', async () => {
    expect((await authed(user).get('/api/v1/reports/trend?months=25')).status).toBe(400);
    const res = await authed(user).get('/api/v1/reports/trend?months=12');
    expect(res.body.months).toHaveLength(12);
  });
});

describe('isolasi & performa laporan', () => {
  it('pengguna lain tidak melihat angka pengguna ini', async () => {
    const stranger = await registerUser();
    const res = await authed(stranger).get('/api/v1/reports/summary').query({ month });
    expect(res.body).toMatchObject({ income: 0, expense: 0, totalBalance: 0, recent: [] });
  });

  it('dashboard < 1 detik untuk 10.000 transaksi', async () => {
    const heavy = await registerUser();
    const wallet = await createWallet(heavy, { initialBalance: 0 });
    const categories = ['cat_makan', 'cat_transport', 'cat_belanja', 'cat_tagihan'];
    const rows = Array.from({ length: 10_000 }, (_, i) => {
      const m = shiftMonth(month, -(i % 12));
      const day = String((i % 28) + 1).padStart(2, '0');
      const income = i % 10 === 0;
      return {
        userId: heavy.id,
        walletId: wallet.id,
        categoryId: income ? 'cat_gaji' : categories[i % categories.length]!,
        type: income ? ('INCOME' as const) : ('EXPENSE' as const),
        amount: BigInt(income ? 100_000 : -(1_000 + (i % 50) * 500)),
        date: new Date(`${m}-${day}T00:00:00.000Z`),
      };
    });
    await prisma.transaction.createMany({ data: rows });

    const loadDashboard = () =>
      Promise.all([
        authed(heavy).get('/api/v1/reports/summary'),
        authed(heavy).get('/api/v1/reports/by-category'),
        authed(heavy).get('/api/v1/reports/trend'),
      ]);
    // Pemanasan: pool koneksi ke database terbuka, seperti server yang sudah berjalan.
    await loadDashboard();
    const started = performance.now();
    const [summary, byCategory, trend] = await loadDashboard();
    const elapsed = performance.now() - started;
    console.info(`dashboard 10k transaksi: ${elapsed.toFixed(0)} ms`);

    expect([summary.status, byCategory.status, trend.status]).toEqual([200, 200, 200]);
    expect(trend.body.months).toHaveLength(6);
    expect(elapsed).toBeLessThan(1000);
  }, 60_000);
});
