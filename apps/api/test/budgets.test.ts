import { currentMonth, shiftMonth } from '@catatku/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { authed, createWallet, registerUser, type TestUser } from './helpers';

const month = currentMonth();
const nextMonth = shiftMonth(month, 1);

interface BudgetItem {
  id: string | null;
  categoryId: string;
  limitAmount: number;
  spent: number;
  remaining: number;
  ratio: number;
  status: string;
}

const byCategory = (items: BudgetItem[], categoryId: string) =>
  items.find((i) => i.categoryId === categoryId)!;

let user: TestUser;

beforeAll(async () => {
  user = await registerUser();
  const wallet = await createWallet(user, { initialBalance: 5_000_000 });
  const spend = (categoryId: string, amount: number) =>
    authed(user)
      .post('/api/v1/transactions')
      .send({ type: 'EXPENSE', amount, walletId: wallet.id, categoryId, date: `${month}-02` })
      .expect(201);
  await spend('cat_makan', 850_000);
  await spend('cat_transport', 120_000);
  await spend('cat_hiburan', 260_000);
  // Transaksi terhapus tidak dihitung sebagai realisasi.
  const removed = await spend('cat_transport', 900_000);
  await authed(user).delete(`/api/v1/transactions/${removed.body.id}`).expect(204);
});

describe('PUT/GET /budgets', () => {
  it('mengatur anggaran dan menghitung realisasi + status 80%/100%', async () => {
    const res = await authed(user)
      .put('/api/v1/budgets')
      .send({
        month,
        items: [
          { categoryId: 'cat_makan', limitAmount: 1_000_000 },
          { categoryId: 'cat_transport', limitAmount: 400_000 },
          { categoryId: 'cat_hiburan', limitAmount: 200_000 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ month, totalLimit: 1_600_000, totalSpent: 1_230_000 });

    expect(byCategory(res.body.items, 'cat_makan')).toMatchObject({
      limitAmount: 1_000_000,
      spent: 850_000,
      remaining: 150_000,
      ratio: 0.85,
      status: 'warning',
    });
    expect(byCategory(res.body.items, 'cat_transport')).toMatchObject({
      spent: 120_000,
      remaining: 280_000,
      status: 'ok',
    });
    expect(byCategory(res.body.items, 'cat_hiburan')).toMatchObject({
      remaining: -60_000,
      status: 'over',
    });
  });

  it('kategori beranggaran tampil dulu (paling kritis), lalu kategori tanpa anggaran', async () => {
    const res = await authed(user).get('/api/v1/budgets').query({ month });
    const ids = res.body.items.map((i: BudgetItem) => i.categoryId);
    expect(ids.slice(0, 3)).toEqual(['cat_hiburan', 'cat_makan', 'cat_transport']);
    const unbudgeted = byCategory(res.body.items, 'cat_belanja');
    expect(unbudgeted).toMatchObject({ id: null, limitAmount: 0, status: 'ok' });
    expect(ids).not.toContain('cat_gaji');
  });

  it('PUT bersifat idempoten dan limit 0 menghapus anggaran', async () => {
    const body = { month, items: [{ categoryId: 'cat_transport', limitAmount: 0 }] };
    await authed(user).put('/api/v1/budgets').send(body).expect(200);
    const res = await authed(user).put('/api/v1/budgets').send(body);
    expect(res.status).toBe(200);
    expect(byCategory(res.body.items, 'cat_transport').id).toBeNull();
    expect(res.body.totalLimit).toBe(1_200_000);
  });

  it('anggaran berlaku per bulan', async () => {
    const res = await authed(user).get('/api/v1/budgets').query({ month: nextMonth });
    expect(res.body.totalLimit).toBe(0);
    expect(res.body.items.every((i: BudgetItem) => i.id === null && i.spent === 0)).toBe(true);
  });

  it('menolak kategori pemasukan, nominal negatif, dan bulan tidak valid', async () => {
    const income = await authed(user)
      .put('/api/v1/budgets')
      .send({ month, items: [{ categoryId: 'cat_gaji', limitAmount: 100_000 }] });
    expect(income.status).toBe(400);

    const negative = await authed(user)
      .put('/api/v1/budgets')
      .send({ month, items: [{ categoryId: 'cat_makan', limitAmount: -1 }] });
    expect(negative.status).toBe(400);

    const badMonth = await authed(user).get('/api/v1/budgets').query({ month: '2026-1' });
    expect(badMonth.status).toBe(400);
  });

  it('pengguna lain tidak melihat anggaran ini dan tidak bisa memakai kategori kustomnya', async () => {
    const custom = await authed(user)
      .post('/api/v1/categories')
      .send({ name: 'Kopi', type: 'EXPENSE' })
      .expect(201);
    const stranger = await registerUser();

    const res = await authed(stranger).get('/api/v1/budgets').query({ month });
    expect(res.body.totalLimit).toBe(0);
    expect(res.body.items.map((i: BudgetItem) => i.categoryId)).not.toContain(custom.body.id);

    const hijack = await authed(stranger)
      .put('/api/v1/budgets')
      .send({ month, items: [{ categoryId: custom.body.id, limitAmount: 50_000 }] });
    expect(hijack.status).toBe(400);
  });
});
