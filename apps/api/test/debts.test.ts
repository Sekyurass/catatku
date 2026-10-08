import {
  type DebtDTO,
  type DebtPaymentDTO,
  FEATURE_FLAGS,
  type TransactionDTO,
} from '@catatku/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { runDebtReminders } from '../src/modules/debts/debt.service';
import { authed, createWallet, registerUser, type TestUser, walletBalance } from './helpers';

const KEYS = [FEATURE_FLAGS.DEBTS, FEATURE_FLAGS.REMINDERS];

async function enableFor(user: TestUser, keys = KEYS) {
  for (const key of keys) {
    await prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled: true, plan: 'PREMIUM', userIds: [user.id] },
      update: { enabled: true, plan: 'PREMIUM', userIds: { push: user.id } },
    });
  }
}

beforeAll(async () => {
  for (const key of KEYS) {
    await prisma.featureFlag.upsert({ where: { key }, create: { key }, update: {} });
  }
});

afterAll(async () => {
  for (const key of KEYS) {
    await prisma.featureFlag.update({
      where: { key },
      data: { enabled: false, plan: null, userIds: [] },
    });
  }
});

async function setup() {
  const user = await registerUser();
  await enableFor(user);
  const wallet = await createWallet(user, { initialBalance: 1_000_000 });
  return { user, wallet };
}

async function createDebt(user: TestUser, body: Record<string, unknown>) {
  const res = await authed(user)
    .post('/api/v1/debts')
    .send({
      direction: 'PAYABLE',
      counterparty: 'Budi',
      principal: 600_000,
      startDate: '2026-01-05',
      ...body,
    });
  expect(res.status).toBe(201);
  return res.body as DebtDTO;
}

const pay = (user: TestUser, debtId: string, body: Record<string, unknown>) =>
  authed(user)
    .post(`/api/v1/debts/${debtId}/payments`)
    .send({ date: '2026-02-01', ...body });

async function debtTransactions(user: TestUser) {
  const res = await authed(user).get('/api/v1/transactions?type=DEBT');
  return res.body.items as TransactionDTO[];
}

describe('utang-piutang', () => {
  it('flag nonaktif: 404', async () => {
    const user = await registerUser();
    expect((await authed(user).get('/api/v1/debts')).status).toBe(404);
  });

  it('utang dengan dompet: pinjaman menambah saldo, bayar mengurangi, lunas otomatis', async () => {
    const { user, wallet } = await setup();
    const debt = await createDebt(user, {
      walletId: wallet.id,
      interest: 60_000,
      installments: 3,
      firstDueDate: '2026-02-05',
    });
    expect(debt).toMatchObject({ total: 660_000, remaining: 660_000, paid: 0, settledAt: null });
    expect(await walletBalance(user, wallet.id)).toBe(1_600_000);

    const [opening] = await debtTransactions(user);
    expect(opening).toMatchObject({ type: 'DEBT', amount: 600_000, debtId: debt.id });
    expect(opening!.note).toBe('Pinjaman dari Budi');

    const r1 = await pay(user, debt.id, { amount: 220_000, walletId: wallet.id });
    expect(r1.status).toBe(201);
    expect(r1.body).toMatchObject({ paid: 220_000, remaining: 440_000, paymentCount: 1 });
    expect(await walletBalance(user, wallet.id)).toBe(1_380_000);
    const txs = await debtTransactions(user);
    expect(txs.find((t) => t.amount === -220_000)?.note).toBe('Bayar utang ke Budi (cicilan 1/3)');

    const over = await pay(user, debt.id, { amount: 500_000, walletId: wallet.id });
    expect(over.status).toBe(400);

    const r2 = await pay(user, debt.id, { amount: 440_000, walletId: wallet.id });
    expect(r2.body.remaining).toBe(0);
    expect(r2.body.settledAt).not.toBeNull();

    const payments = (await authed(user).get(`/api/v1/debts/${debt.id}/payments`)).body
      .items as DebtPaymentDTO[];
    expect(payments).toHaveLength(2);

    // Hapus pembayaran: saldo kembali, status lunas dibuka lagi.
    const del = await authed(user).delete(`/api/v1/debts/payments/${payments[0]!.id}`);
    expect(del.status).toBe(200);
    expect(del.body).toMatchObject({ remaining: 440_000, settledAt: null });
    expect(await walletBalance(user, wallet.id)).toBe(1_380_000);
  });

  it('piutang: pinjamkan mengurangi saldo, terima pembayaran menambah', async () => {
    const { user, wallet } = await setup();
    const debt = await createDebt(user, {
      direction: 'RECEIVABLE',
      counterparty: 'Sari',
      principal: 300_000,
      walletId: wallet.id,
      dueDate: '2026-03-01',
    });
    expect(await walletBalance(user, wallet.id)).toBe(700_000);
    await pay(user, debt.id, { amount: 100_000, walletId: wallet.id });
    expect(await walletBalance(user, wallet.id)).toBe(800_000);
    const txs = await debtTransactions(user);
    expect(txs.map((t) => t.note).sort()).toEqual([
      'Pinjamkan ke Sari',
      'Terima pembayaran dari Sari',
    ]);
  });

  it('tanpa dompet: saldo tidak berubah', async () => {
    const { user, wallet } = await setup();
    const debt = await createDebt(user, {});
    await pay(user, debt.id, { amount: 100_000 });
    expect(await walletBalance(user, wallet.id)).toBe(1_000_000);
    expect(await debtTransactions(user)).toHaveLength(0);
  });

  it('transaksi DEBT terkunci dari halaman transaksi; tidak masuk laporan', async () => {
    const { user, wallet } = await setup();
    await createDebt(user, { walletId: wallet.id, startDate: '2026-01-05' });
    const [tx] = await debtTransactions(user);
    expect(
      (await authed(user).patch(`/api/v1/transactions/${tx!.id}`).send({ note: 'x' })).status,
    ).toBe(409);
    expect((await authed(user).delete(`/api/v1/transactions/${tx!.id}`)).status).toBe(409);
    const summary = await authed(user).get('/api/v1/reports/summary?month=2026-01');
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({ income: 0, expense: 0 });
  });

  it('ubah pokok menyesuaikan transaksi pinjaman; tidak boleh di bawah yang sudah dibayar', async () => {
    const { user, wallet } = await setup();
    const debt = await createDebt(user, { walletId: wallet.id });
    await pay(user, debt.id, { amount: 200_000, walletId: wallet.id });
    const res = await authed(user).patch(`/api/v1/debts/${debt.id}`).send({ principal: 500_000 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 500_000, remaining: 300_000 });
    expect(await walletBalance(user, wallet.id)).toBe(1_000_000 + 500_000 - 200_000);
    const low = await authed(user).patch(`/api/v1/debts/${debt.id}`).send({ principal: 100_000 });
    expect(low.status).toBe(400);
  });

  it('hapus utang: semua transaksinya ikut terhapus, saldo kembali', async () => {
    const { user, wallet } = await setup();
    const debt = await createDebt(user, { walletId: wallet.id });
    await pay(user, debt.id, { amount: 100_000, walletId: wallet.id });
    expect((await authed(user).delete(`/api/v1/debts/${debt.id}`)).status).toBe(204);
    expect(await walletBalance(user, wallet.id)).toBe(1_000_000);
    expect(await debtTransactions(user)).toHaveLength(0);
  });

  it('pengingat: sekali "segera" dan sekali "terlewat" per angsuran', async () => {
    const { user } = await setup();
    const debt = await createDebt(user, {
      startDate: '2026-01-01',
      installments: 2,
      firstDueDate: '2026-02-10',
      principal: 200_000,
    });
    const at = (date: string) => new Date(`${date}T03:00:00Z`); // 10.00 WIB

    await runDebtReminders(at('2026-02-01'));
    await runDebtReminders(at('2026-02-08'));
    await runDebtReminders(at('2026-02-09'));
    await runDebtReminders(at('2026-02-11'));
    await runDebtReminders(at('2026-02-12'));
    const notes = await prisma.notification.findMany({
      where: { userId: user.id, type: 'DEBT_DUE' },
      orderBy: { createdAt: 'asc' },
    });
    expect(notes.map((n) => n.title)).toEqual([
      'Utang segera jatuh tempo',
      'Utang lewat jatuh tempo',
    ]);
    expect(notes[0]!.link).toBe(`/utang?debt=${debt.id}`);
    expect(notes[0]!.body).toContain('cicilan 1/2');

    // Sebelum jam 08.00 WIB tidak mengirim apa pun.
    await pay(user, debt.id, { amount: 100_000 });
    await runDebtReminders(new Date('2026-03-08T00:00:00Z'));
    expect(await prisma.notification.count({ where: { userId: user.id, type: 'DEBT_DUE' } })).toBe(
      2,
    );
    await runDebtReminders(at('2026-03-08'));
    expect(await prisma.notification.count({ where: { userId: user.id, type: 'DEBT_DUE' } })).toBe(
      3,
    );
  });
});
