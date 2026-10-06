import { FEATURE_FLAGS, toDateString } from '@catatku/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import * as recurring from '../src/modules/recurring/recurring.service';
import { authed, createWallet, registerUser, type TestUser } from './helpers';

const KEY = FEATURE_FLAGS.RECURRING_TRANSACTIONS;

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
  const wallet = await createWallet(user, { initialBalance: 1_000_000 });
  return { user, wallet };
}

const base = (walletId: string) => ({
  type: 'EXPENSE' as const,
  amount: 50_000,
  walletId,
  categoryId: 'cat_tagihan',
  note: 'Internet',
  frequency: 'MONTHLY' as const,
  interval: 1,
  endDate: null,
  autoPost: true,
});

const txOf = (ruleId: string) =>
  prisma.transaction.findMany({ where: { recurringRuleId: ruleId }, orderBy: { date: 'asc' } });
const dates = (rows: { date: Date }[]) => rows.map((r) => r.date.toISOString().slice(0, 10));
const ruleRow = (id: string) => prisma.recurringRule.findUniqueOrThrow({ where: { id } });

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

describe('akses /recurring', () => {
  it('404 bila flag nonaktif untuk pengguna', async () => {
    const user = await registerUser();
    const res = await authed(user).get('/api/v1/recurring');
    expect(res.status).toBe(404);
  });

  it('memvalidasi tanggal berakhir', async () => {
    const { user, wallet } = await setup();
    const res = await authed(user)
      .post('/api/v1/recurring')
      .send({ ...base(wallet.id), startDate: '2026-10-10', endDate: '2026-10-01' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.endDate).toBeDefined();
  });
});

describe('membuat aturan', () => {
  it('mulai hari ini: langsung tercatat sekali dengan tanda berulang', async () => {
    const { user, wallet } = await setup();
    const today = toDateString();
    const res = await authed(user)
      .post('/api/v1/recurring')
      .send({ ...base(wallet.id), startDate: today });
    expect(res.status).toBe(201);
    expect(res.body.nextRunAt > today).toBe(true);

    const list = await authed(user).get('/api/v1/transactions');
    const generated = list.body.items.filter(
      (t: { recurringRuleId: string | null }) => t.recurringRuleId === res.body.id,
    );
    expect(generated).toHaveLength(1);
    expect(generated[0]).toMatchObject({ amount: -50_000, date: today, note: 'Internet' });
  });

  it('tanggal mulai lampau tidak membuat transaksi mundur', async () => {
    const { user, wallet } = await setup();
    const rule = await recurring.createRule(
      user.id,
      { ...base(wallet.id), startDate: '2026-01-25' },
      '2026-03-10',
    );
    expect(rule.nextRunAt).toBe('2026-03-25');
    expect(await txOf(rule.id)).toHaveLength(0);
  });
});

describe('scheduler', () => {
  it('idempoten: diproses dua kali (juga bersamaan) tetap satu transaksi per tanggal', async () => {
    const { user, wallet } = await setup();
    const rule = await recurring.createRule(
      user.id,
      { ...base(wallet.id), frequency: 'DAILY', startDate: '2026-02-01' },
      '2026-01-31',
    );
    const row = await ruleRow(rule.id);
    await Promise.all([
      recurring.processRule(row, '2026-02-03'),
      recurring.processRule(row, '2026-02-03'),
    ]);
    await recurring.processRule(await ruleRow(rule.id), '2026-02-03');
    expect(dates(await txOf(rule.id))).toEqual(['2026-02-01', '2026-02-02', '2026-02-03']);
  });

  it('menyusul hari yang terlewat lewat runDueRules', async () => {
    const { user, wallet } = await setup();
    const rule = await recurring.createRule(
      user.id,
      { ...base(wallet.id), frequency: 'DAILY', startDate: '2026-03-01' },
      '2026-03-01',
    );
    expect(await txOf(rule.id)).toHaveLength(1);
    await recurring.runDueRules('2026-03-04');
    expect(dates(await txOf(rule.id))).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
    ]);
    expect((await ruleRow(rule.id)).nextRunAt?.toISOString().slice(0, 10)).toBe('2026-03-05');
  });

  it('tanggal 31 memakai hari terakhir bulan pendek', async () => {
    const { user, wallet } = await setup();
    const rule = await recurring.createRule(
      user.id,
      { ...base(wallet.id), startDate: '2026-01-31' },
      '2026-01-30',
    );
    await recurring.processRule(await ruleRow(rule.id), '2026-04-30');
    expect(dates(await txOf(rule.id))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('berhenti di tanggal berakhir', async () => {
    const { user, wallet } = await setup();
    const rule = await recurring.createRule(
      user.id,
      { ...base(wallet.id), frequency: 'DAILY', startDate: '2026-02-01', endDate: '2026-02-03' },
      '2026-01-31',
    );
    await recurring.processRule(await ruleRow(rule.id), '2026-02-10');
    expect(await txOf(rule.id)).toHaveLength(3);
    expect((await ruleRow(rule.id)).nextRunAt).toBeNull();
  });

  it('dijeda tidak mencatat; dilanjutkan tidak membuat kejadian yang terlewat', async () => {
    const { user, wallet } = await setup();
    const rule = await recurring.createRule(
      user.id,
      { ...base(wallet.id), frequency: 'DAILY', startDate: '2026-05-01' },
      '2026-04-30',
    );
    await recurring.updateRule(user.id, rule.id, { paused: true }, '2026-04-30');
    await recurring.processRule(await ruleRow(rule.id), '2026-05-05');
    expect(await txOf(rule.id)).toHaveLength(0);

    const resumed = await recurring.updateRule(user.id, rule.id, { paused: false }, '2026-05-05');
    expect(resumed.paused).toBe(false);
    expect(dates(await txOf(rule.id))).toEqual(['2026-05-05']);
    expect(resumed.nextRunAt).toBe('2026-05-06');
  });

  it('dompet diarsipkan: aturan dijeda, bukan error', async () => {
    const { user, wallet } = await setup();
    const rule = await recurring.createRule(
      user.id,
      { ...base(wallet.id), frequency: 'DAILY', startDate: '2026-06-02' },
      '2026-06-01',
    );
    await prisma.wallet.update({ where: { id: wallet.id }, data: { archivedAt: new Date() } });
    await recurring.processRule(await ruleRow(rule.id), '2026-06-03');
    expect(await txOf(rule.id)).toHaveLength(0);
    expect((await ruleRow(rule.id)).pausedAt).not.toBeNull();
  });
});

describe('mengubah dan menghapus aturan', () => {
  it('perubahan hanya berlaku ke depan; menghapus aturan menyisakan transaksinya', async () => {
    const { user, wallet } = await setup();
    const rule = await recurring.createRule(
      user.id,
      { ...base(wallet.id), startDate: '2026-07-01' },
      '2026-07-01',
    );
    await recurring.updateRule(user.id, rule.id, { amount: 75_000 }, '2026-07-02');
    await recurring.processRule(await ruleRow(rule.id), '2026-08-01');
    const rows = await txOf(rule.id);
    expect(rows.map((r) => Number(r.amount))).toEqual([-50_000, -75_000]);

    const del = await authed(user).delete(`/api/v1/recurring/${rule.id}`);
    expect(del.status).toBe(204);
    const kept = await prisma.transaction.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    expect(kept).toHaveLength(2);
    expect(kept.every((t) => t.recurringRuleId === null)).toBe(true);
  });

  it('aturan milik pengguna lain diperlakukan 404', async () => {
    const { user, wallet } = await setup();
    const other = await registerUser();
    await enableFor(other);
    const rule = await recurring.createRule(
      user.id,
      { ...base(wallet.id), startDate: '2026-12-01' },
      '2026-11-01',
    );
    expect(
      (await authed(other).patch(`/api/v1/recurring/${rule.id}`).send({ amount: 1 })).status,
    ).toBe(404);
    expect((await authed(other).delete(`/api/v1/recurring/${rule.id}`)).status).toBe(404);
    const mine = await authed(other).get('/api/v1/recurring');
    expect(mine.body.items).toEqual([]);
  });
});

describe('mode minta konfirmasi', () => {
  it('kejadian menunggu, bisa dicatat dengan nominal baru atau dilewati', async () => {
    const { user, wallet } = await setup();
    const rule = await recurring.createRule(
      user.id,
      { ...base(wallet.id), frequency: 'DAILY', startDate: '2026-09-01', autoPost: false },
      '2026-09-02',
    );
    expect(await txOf(rule.id)).toHaveLength(0);
    await recurring.processRule(await ruleRow(rule.id), '2026-09-03');

    const pending = await authed(user).get('/api/v1/recurring/pending');
    expect(pending.status).toBe(200);
    expect(pending.body.items.map((o: { date: string }) => o.date)).toEqual([
      '2026-09-02',
      '2026-09-03',
    ]);
    const [first, second] = pending.body.items;

    const ok = await authed(user)
      .post(`/api/v1/recurring/pending/${first.id}/confirm`)
      .send({ amount: 61_500 });
    expect(ok.status).toBe(200);
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: ok.body.transactionId } });
    expect(Number(tx.amount)).toBe(-61_500);
    expect(tx.recurringRuleId).toBe(rule.id);

    const again = await authed(user).post(`/api/v1/recurring/pending/${first.id}/confirm`).send({});
    expect(again.status).toBe(409);

    const other = await registerUser();
    await enableFor(other);
    expect((await authed(other).post(`/api/v1/recurring/pending/${second.id}/skip`)).status).toBe(
      404,
    );

    expect((await authed(user).post(`/api/v1/recurring/pending/${second.id}/skip`)).status).toBe(
      204,
    );
    const after = await authed(user).get('/api/v1/recurring/pending');
    expect(after.body.items).toEqual([]);
    expect(await txOf(rule.id)).toHaveLength(1);
  });
});
