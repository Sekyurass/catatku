import {
  FEATURE_FLAGS,
  type GoalContributionDTO,
  type GoalDTO,
  shiftMonth,
  toDateString,
} from '@catatku/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { authed, createWallet, registerUser, type TestUser, walletBalance } from './helpers';

const KEY = FEATURE_FLAGS.SAVINGS_GOALS;
const today = toDateString();
const lastMonth = `${shiftMonth(today.slice(0, 7), -1)}-15`;
const nextYear = `${Number(today.slice(0, 4)) + 1}-12-31`;

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

async function newUser() {
  const user = await registerUser();
  await enableFor(user);
  return user;
}

async function createGoal(user: TestUser, body: Record<string, unknown> = {}) {
  const res = await authed(user)
    .post('/api/v1/goals')
    .send({ name: 'Liburan', targetAmount: 3_000_000, deadline: nextYear, ...body });
  expect(res.status).toBe(201);
  return res.body as GoalDTO;
}

const contribute = (user: TestUser, goalId: string, body: Record<string, unknown>) =>
  authed(user)
    .post(`/api/v1/goals/${goalId}/contributions`)
    .send({ type: 'DEPOSIT', date: today, ...body });

const balance = walletBalance;

describe('target tabungan', () => {
  it('flag nonaktif: semua rute 404', async () => {
    const user = await registerUser();
    expect((await authed(user).get('/api/v1/goals')).status).toBe(404);
    const res = await authed(user).post('/api/v1/goals').send({ name: 'X', targetAmount: 1000 });
    expect(res.status).toBe(404);
  });

  it('CRUD: default ikon/warna, dompet tabungan dibuatkan, ubah, lalu hapus', async () => {
    const user = await newUser();
    const goal = await createGoal(user, { deadline: undefined });
    expect(goal).toMatchObject({
      name: 'Liburan',
      targetAmount: 3_000_000,
      deadline: null,
      icon: 'piggy-bank',
      wallet: { name: 'Tabungan Liburan', archivedAt: null },
      saved: 0,
      savedThisMonth: 0,
      contributionCount: 0,
    });
    expect(goal.walletId).toBe(goal.wallet!.id);
    expect(await balance(user, goal.walletId!)).toBe(0);

    const updated = await authed(user)
      .patch(`/api/v1/goals/${goal.id}`)
      .send({ name: 'Liburan Bali', icon: 'plane', deadline: nextYear, walletId: goal.walletId });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      name: 'Liburan Bali',
      icon: 'plane',
      deadline: nextYear,
      walletId: goal.walletId,
    });

    const list = await authed(user).get('/api/v1/goals');
    expect(list.body.items.map((g: GoalDTO) => g.id)).toEqual([goal.id]);

    expect((await authed(user).delete(`/api/v1/goals/${goal.id}`)).status).toBe(204);
    expect((await authed(user).get('/api/v1/goals')).body.items).toEqual([]);
  });

  it('target lama tanpa dompet: setoran ditolak sampai dompet dipilih atau dibuat', async () => {
    const user = await newUser();
    const main = await createWallet(user, { initialBalance: 1_000_000 });
    const goal = await createGoal(user);
    await prisma.savingsGoal.update({ where: { id: goal.id }, data: { walletId: null } });

    const res = await contribute(user, goal.id, { amount: 1000, walletId: main.id });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('belum punya dompet tabungan');

    const fixed = await authed(user).patch(`/api/v1/goals/${goal.id}`).send({ walletId: null });
    expect(fixed.body.wallet).toMatchObject({ name: 'Tabungan Liburan' });
    expect(fixed.body.walletId).not.toBe(goal.walletId);
    const ok = await contribute(user, goal.id, { amount: 1000, walletId: main.id });
    expect(ok.status).toBe(201);
  });

  it('menolak tenggat di masa lalu dan dompet milik orang lain', async () => {
    const user = await newUser();
    const other = await registerUser();
    const foreign = await createWallet(other);
    const past = await authed(user)
      .post('/api/v1/goals')
      .send({ name: 'X', targetAmount: 1000, deadline: '2020-01-01' });
    expect(past.status).toBe(400);
    expect(past.body.error.fields.deadline).toBeTruthy();

    const res = await authed(user)
      .post('/api/v1/goals')
      .send({ name: 'X', targetAmount: 1000, walletId: foreign.id });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.walletId).toBe('Dompet tidak ditemukan');
  });

  it('dompet tabungan otomatis: setor memotong dompet asal; tarik tidak boleh melebihi terkumpul', async () => {
    const user = await newUser();
    const main = await createWallet(user, { name: 'Utama', initialBalance: 1_000_000 });
    const goal = await createGoal(user);
    const savingsId = goal.walletId!;

    const dep = await contribute(user, goal.id, { amount: 400_000, walletId: main.id });
    expect(dep.status).toBe(201);
    expect(dep.body).toMatchObject({
      saved: 400_000,
      savedThisMonth: 400_000,
      contributionCount: 1,
    });
    expect(await balance(user, main.id)).toBe(600_000);
    expect(await balance(user, savingsId)).toBe(400_000);

    const old = await contribute(user, goal.id, {
      amount: 100_000,
      date: lastMonth,
      walletId: main.id,
    });
    expect(old.body).toMatchObject({ saved: 500_000, savedThisMonth: 400_000 });

    const tooMuch = await contribute(user, goal.id, {
      type: 'WITHDRAW',
      amount: 600_000,
      walletId: main.id,
    });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error.fields.amount).toBeTruthy();

    const wd = await contribute(user, goal.id, {
      type: 'WITHDRAW',
      amount: 150_000,
      note: 'Darurat',
      walletId: main.id,
    });
    expect(wd.body.saved).toBe(350_000);
    expect(await balance(user, main.id)).toBe(650_000);
    expect(await balance(user, savingsId)).toBe(350_000);

    const history = await authed(user).get(`/api/v1/goals/${goal.id}/contributions`);
    const items = history.body.items as GoalContributionDTO[];
    expect(items.map((c) => [c.type, c.amount, c.note, c.wallet?.name])).toEqual([
      ['WITHDRAW', 150_000, 'Darurat', 'Utama'],
      ['DEPOSIT', 400_000, null, 'Utama'],
      ['DEPOSIT', 100_000, null, 'Utama'],
    ]);

    expect((await authed(user).delete(`/api/v1/goals/contributions/${items[0]!.id}`)).status).toBe(
      204,
    );
    expect((await authed(user).get('/api/v1/goals')).body.items[0].saved).toBe(500_000);
    expect(await balance(user, main.id)).toBe(500_000);
  });

  it('dengan dompet tabungan: setor/tarik jadi transfer sungguhan dan mengikuti transfernya', async () => {
    const user = await newUser();
    const main = await createWallet(user, { name: 'Utama', initialBalance: 2_000_000 });
    const savings = await createWallet(user, { name: 'Tabungan', initialBalance: 0 });
    const goal = await createGoal(user, { walletId: savings.id });
    expect(goal.wallet).toMatchObject({ id: savings.id, name: 'Tabungan', archivedAt: null });

    const noSource = await contribute(user, goal.id, { amount: 500_000 });
    expect(noSource.status).toBe(400);
    expect(noSource.body.error.fields.walletId).toBe('Pilih dompet asal');
    const same = await contribute(user, goal.id, { amount: 500_000, walletId: savings.id });
    expect(same.status).toBe(400);

    const dep = await contribute(user, goal.id, { amount: 500_000, walletId: main.id });
    expect(dep.status).toBe(201);
    expect(dep.body.saved).toBe(500_000);
    expect(await balance(user, main.id)).toBe(1_500_000);
    expect(await balance(user, savings.id)).toBe(500_000);

    const [contribution] = (await authed(user).get(`/api/v1/goals/${goal.id}/contributions`)).body
      .items as GoalContributionDTO[];
    expect(contribution).toMatchObject({ type: 'DEPOSIT', amount: 500_000 });
    expect(contribution!.wallet).toMatchObject({ id: main.id });
    const legs = await prisma.transaction.findMany({
      where: { transferGroupId: contribution!.transferGroupId! },
    });
    expect(legs.map((l) => Number(l.amount)).sort((a, b) => a - b)).toEqual([-500_000, 500_000]);
    expect(legs[0]!.note).toBe('Setor ke target Liburan');

    // Nominal transfer diubah dari halaman transaksi -> progres ikut.
    const inLeg = legs.find((l) => l.amount > 0n)!;
    await authed(user).patch(`/api/v1/transactions/${inLeg.id}`).send({ amount: 600_000 });
    expect((await authed(user).get('/api/v1/goals')).body.items[0].saved).toBe(600_000);

    // Transfer dihapus -> tidak dihitung; diurungkan -> kembali.
    await authed(user).delete(`/api/v1/transactions/${inLeg.id}`);
    let [listed] = (await authed(user).get('/api/v1/goals')).body.items as GoalDTO[];
    expect(listed).toMatchObject({ saved: 0, contributionCount: 0 });
    expect((await authed(user).get(`/api/v1/goals/${goal.id}/contributions`)).body.items).toEqual(
      [],
    );
    await authed(user).post(`/api/v1/transactions/${inLeg.id}/restore`);
    [listed] = (await authed(user).get('/api/v1/goals')).body.items as GoalDTO[];
    expect(listed!.saved).toBe(600_000);

    const wd = await contribute(user, goal.id, {
      type: 'WITHDRAW',
      amount: 100_000,
      walletId: main.id,
    });
    expect(wd.status).toBe(201);
    expect(wd.body.saved).toBe(500_000);
    expect(await balance(user, main.id)).toBe(1_500_000);
    expect(await balance(user, savings.id)).toBe(500_000);

    // Hapus setoran -> transfernya ikut terhapus, saldo kembali.
    expect(
      (await authed(user).delete(`/api/v1/goals/contributions/${contribution!.id}`)).status,
    ).toBe(204);
    expect(await balance(user, main.id)).toBe(2_100_000);
    expect(await balance(user, savings.id)).toBe(-100_000);

    // Hapus target -> transfer yang tersisa tetap ada.
    await authed(user).delete(`/api/v1/goals/${goal.id}`);
    expect(await balance(user, savings.id)).toBe(-100_000);
  });

  it('dompet tabungan diarsipkan: setoran ditolak sampai dompet diganti', async () => {
    const user = await newUser();
    const main = await createWallet(user, { initialBalance: 1_000_000 });
    const savings = await createWallet(user);
    const goal = await createGoal(user, { walletId: savings.id });
    await prisma.wallet.update({ where: { id: savings.id }, data: { archivedAt: new Date() } });
    const res = await contribute(user, goal.id, { amount: 1000, walletId: main.id });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('diarsipkan');
  });

  it('IDOR: target dan setoran pengguna lain tidak bisa dibaca atau diubah', async () => {
    const owner = await newUser();
    const attacker = await newUser();
    const main = await createWallet(owner, { initialBalance: 500_000 });
    const goal = await createGoal(owner);
    await contribute(owner, goal.id, { amount: 100_000, walletId: main.id });
    const [c] = (await authed(owner).get(`/api/v1/goals/${goal.id}/contributions`)).body
      .items as GoalContributionDTO[];

    const as = authed(attacker);
    expect((await as.get(`/api/v1/goals/${goal.id}/contributions`)).status).toBe(404);
    expect((await as.patch(`/api/v1/goals/${goal.id}`).send({ name: 'Hack' })).status).toBe(404);
    expect((await as.delete(`/api/v1/goals/${goal.id}`)).status).toBe(404);
    expect((await contribute(attacker, goal.id, { amount: 1, walletId: main.id })).status).toBe(
      404,
    );
    expect((await as.delete(`/api/v1/goals/contributions/${c!.id}`)).status).toBe(404);
    expect((await as.get('/api/v1/goals')).body.items).toEqual([]);

    const [still] = (await authed(owner).get('/api/v1/goals')).body.items as GoalDTO[];
    expect(still).toMatchObject({ name: 'Liburan', saved: 100_000 });
  });
});
