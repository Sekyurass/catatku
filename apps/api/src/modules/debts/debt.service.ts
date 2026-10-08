import {
  type createDebtPaymentSchema,
  type createDebtSchema,
  type DebtDirection,
  type DebtDTO,
  type DebtPaymentDTO,
  debtProgress,
  type DebtReminder,
  debtReminder,
  FEATURE_FLAGS,
  formatRupiah,
  MAX_DEBTS,
  toDateString,
  type updateDebtSchema,
} from '@catatku/shared';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { track } from '../../lib/analytics';
import { conflict, notFound, validationError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { fromDbDate, toDbDate, toNumber } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { hourInZone } from '../../lib/time';
import { isFeatureEnabled } from '../features/featureFlag.service';
import { notify } from '../notifications/notification.service';
import { findActiveWallet } from '../wallets/wallet.service';

const walletSelect = { select: { id: true, name: true, color: true } } as const;
const include = { wallet: walletSelect } as const;

type DebtRow = Prisma.DebtGetPayload<{ include: typeof include }>;

interface Totals {
  paid: number;
  count: number;
}

const EMPTY: Totals = { paid: 0, count: 0 };

function toDTO(row: DebtRow, totals: Totals = EMPTY): DebtDTO {
  const principal = toNumber(row.principal);
  const interest = toNumber(row.interest);
  const total = principal + interest;
  return {
    id: row.id,
    direction: row.direction,
    counterparty: row.counterparty,
    principal,
    interest,
    total,
    paid: totals.paid,
    remaining: Math.max(0, total - totals.paid),
    startDate: fromDbDate(row.startDate),
    dueDate: row.dueDate ? fromDbDate(row.dueDate) : null,
    installments: row.installments,
    firstDueDate: row.firstDueDate ? fromDbDate(row.firstDueDate) : null,
    note: row.note,
    walletId: row.walletId,
    wallet: row.wallet,
    settledAt: row.settledAt?.toISOString() ?? null,
    paymentCount: totals.count,
    createdAt: row.createdAt.toISOString(),
  };
}

async function findOwnedDebt(userId: string, id: string): Promise<DebtRow> {
  const row = await prisma.debt.findFirst({ where: { id, userId }, include });
  if (!row) throw notFound('Utang/piutang');
  return row;
}

async function debtTotals(userId: string, debtId?: string): Promise<Map<string, Totals>> {
  const rows = await prisma.debtPayment.groupBy({
    by: ['debtId'],
    where: { userId, ...(debtId && { debtId }) },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return new Map(
    rows.map((r) => [r.debtId, { paid: toNumber(r._sum.amount ?? 0n), count: r._count._all }]),
  );
}

const totalOf = (row: { principal: bigint; interest: bigint }) =>
  toNumber(row.principal) + toNumber(row.interest);

/** Utang: uang pinjaman masuk ke dompet. Piutang: uang dipinjamkan keluar dari dompet. */
const openingSign = (direction: DebtDirection) => (direction === 'PAYABLE' ? 1n : -1n);

const openingNote = (direction: DebtDirection, who: string) =>
  direction === 'PAYABLE' ? `Pinjaman dari ${who}` : `Pinjamkan ke ${who}`;

/** Transaksi pinjaman awal = transaksi DEBT milik utang ini yang bukan pembayaran. */
async function findOpeningTransaction(userId: string, debtId: string) {
  const paymentTxIds = (
    await prisma.debtPayment.findMany({
      where: { debtId, transactionId: { not: null } },
      select: { transactionId: true },
    })
  ).map((p) => p.transactionId!);
  return prisma.transaction.findFirst({
    where: { userId, debtId, id: { notIn: paymentTxIds } },
  });
}

export async function listDebts(userId: string): Promise<DebtDTO[]> {
  const [rows, totals] = await Promise.all([
    prisma.debt.findMany({
      where: { userId },
      include,
      orderBy: [{ settledAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
    }),
    debtTotals(userId),
  ]);
  return rows.map((row) => toDTO(row, totals.get(row.id)));
}

export async function getDebt(userId: string, id: string): Promise<DebtDTO> {
  const [row, totals] = await Promise.all([findOwnedDebt(userId, id), debtTotals(userId, id)]);
  return toDTO(row, totals.get(id));
}

export async function createDebt(
  userId: string,
  data: z.output<typeof createDebtSchema>,
): Promise<DebtDTO> {
  const [count] = await Promise.all([
    prisma.debt.count({ where: { userId, settledAt: null } }),
    data.walletId ? findActiveWallet(userId, data.walletId) : null,
  ]);
  if (count >= MAX_DEBTS) {
    throw conflict(`Maksimal ${MAX_DEBTS} utang/piutang aktif.`);
  }
  const installments = data.installments;
  const row = await prisma.$transaction(async (tx) => {
    const debt = await tx.debt.create({
      data: {
        userId,
        direction: data.direction,
        counterparty: data.counterparty,
        principal: BigInt(data.principal),
        interest: BigInt(data.interest),
        startDate: toDbDate(data.startDate),
        dueDate: installments || !data.dueDate ? null : toDbDate(data.dueDate),
        installments,
        firstDueDate: installments && data.firstDueDate ? toDbDate(data.firstDueDate) : null,
        note: data.note ?? null,
        walletId: data.walletId,
      },
      include,
    });
    if (data.walletId) {
      await tx.transaction.create({
        data: {
          userId,
          walletId: data.walletId,
          type: 'DEBT',
          amount: openingSign(data.direction) * BigInt(data.principal),
          date: toDbDate(data.startDate),
          note: openingNote(data.direction, data.counterparty),
          debtId: debt.id,
        },
      });
    }
    return debt;
  });
  track(userId, 'debt_created', {
    direction: data.direction,
    installments: installments ?? 0,
    hasInterest: data.interest > 0,
    withWallet: data.walletId !== null,
  });
  return toDTO(row);
}

export async function updateDebt(
  userId: string,
  id: string,
  input: z.output<typeof updateDebtSchema>,
): Promise<DebtDTO> {
  const row = await findOwnedDebt(userId, id);
  const current = toDTO(row);
  const next = {
    counterparty: input.counterparty ?? current.counterparty,
    principal: input.principal ?? current.principal,
    interest: input.interest ?? current.interest,
    startDate: input.startDate ?? current.startDate,
    dueDate: input.dueDate !== undefined ? input.dueDate : current.dueDate,
    installments: input.installments !== undefined ? input.installments : current.installments,
    firstDueDate: input.firstDueDate !== undefined ? input.firstDueDate : current.firstDueDate,
  };
  if (next.installments && !next.firstDueDate) {
    throw validationError('Isi tanggal angsuran pertama', {
      firstDueDate: 'Isi tanggal angsuran pertama',
    });
  }
  const due = next.installments ? next.firstDueDate : next.dueDate;
  if (due && due < next.startDate) {
    const field = next.installments ? 'firstDueDate' : 'dueDate';
    throw validationError('Jatuh tempo tidak boleh sebelum tanggal pinjam', {
      [field]: 'Jatuh tempo tidak boleh sebelum tanggal pinjam',
    });
  }
  const paid = (await debtTotals(userId, id)).get(id)?.paid ?? 0;
  if (next.principal + next.interest < paid) {
    throw validationError('Total pinjaman tidak boleh kurang dari yang sudah dibayar', {
      principal: 'Kurang dari yang sudah dibayar',
    });
  }
  const settled = next.principal + next.interest === paid;

  const opening = row.walletId ? await findOpeningTransaction(userId, id) : null;
  await prisma.$transaction(async (tx) => {
    await tx.debt.update({
      where: { id },
      data: {
        counterparty: next.counterparty,
        principal: BigInt(next.principal),
        interest: BigInt(next.interest),
        startDate: toDbDate(next.startDate),
        dueDate: next.installments || !next.dueDate ? null : toDbDate(next.dueDate),
        installments: next.installments,
        firstDueDate: next.installments && next.firstDueDate ? toDbDate(next.firstDueDate) : null,
        ...(input.note !== undefined && { note: input.note ?? null }),
        settledAt: settled ? (row.settledAt ?? new Date()) : null,
        lastReminder: null,
      },
    });
    if (opening) {
      await tx.transaction.update({
        where: { id: opening.id },
        data: {
          amount: openingSign(row.direction) * BigInt(next.principal),
          date: toDbDate(next.startDate),
          note: openingNote(row.direction, next.counterparty),
        },
      });
    }
  });
  return getDebt(userId, id);
}

/**
 * Transaksi pinjaman awal dan pembayarannya ikut dihapus permanen, jadi saldo dompet kembali
 * seperti sebelum utang ini dicatat.
 */
export async function deleteDebt(userId: string, id: string): Promise<void> {
  await findOwnedDebt(userId, id);
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId, debtId: id } }),
    prisma.debt.delete({ where: { id } }),
  ]);
}

export async function listPayments(userId: string, debtId: string): Promise<DebtPaymentDTO[]> {
  await findOwnedDebt(userId, debtId);
  const rows = await prisma.debtPayment.findMany({
    where: { userId, debtId },
    include,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    debtId: r.debtId,
    amount: toNumber(r.amount),
    date: fromDbDate(r.date),
    note: r.note,
    walletId: r.walletId,
    wallet: r.wallet,
    transactionId: r.transactionId,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function createPayment(
  userId: string,
  debtId: string,
  input: z.output<typeof createDebtPaymentSchema>,
): Promise<DebtDTO> {
  const debt = await findOwnedDebt(userId, debtId);
  if (input.walletId) await findActiveWallet(userId, input.walletId);
  const total = totalOf(debt);
  const paid = (await debtTotals(userId, debtId)).get(debtId)?.paid ?? 0;
  const remaining = total - paid;
  if (input.amount > remaining) {
    throw validationError('Pembayaran melebihi sisa tagihan', {
      amount: `Sisa tagihan ${remaining.toLocaleString('id-ID')}`,
    });
  }

  const progress = debtProgress({
    total,
    installments: debt.installments,
    firstDueDate: debt.firstDueDate ? fromDbDate(debt.firstDueDate) : null,
    dueDate: debt.dueDate ? fromDbDate(debt.dueDate) : null,
    paid,
    today: toDateString(),
  });
  const n = debt.installments ?? 1;
  const suffix = n > 1 && progress.next ? ` (cicilan ${progress.next.index + 1}/${n})` : '';
  const payable = debt.direction === 'PAYABLE';
  const note =
    input.note ??
    `${payable ? 'Bayar utang ke' : 'Terima pembayaran dari'} ${debt.counterparty}${suffix}`;

  await prisma.$transaction(async (tx) => {
    const txRow = input.walletId
      ? await tx.transaction.create({
          data: {
            userId,
            walletId: input.walletId,
            type: 'DEBT',
            amount: BigInt(payable ? -input.amount : input.amount),
            date: toDbDate(input.date),
            note,
            debtId,
          },
        })
      : null;
    await tx.debtPayment.create({
      data: {
        debtId,
        userId,
        amount: BigInt(input.amount),
        date: toDbDate(input.date),
        note: input.note ?? null,
        walletId: input.walletId,
        transactionId: txRow?.id ?? null,
      },
    });
    if (input.amount === remaining) {
      await tx.debt.update({ where: { id: debtId }, data: { settledAt: new Date() } });
    }
  });
  track(userId, 'debt_payment', {
    direction: debt.direction,
    settled: input.amount === remaining,
    withWallet: input.walletId !== null,
  });
  return getDebt(userId, debtId);
}

// ---------- Pengingat jatuh tempo ----------

/** Pengingat dikirim mulai jam ini (zona aplikasi), tidak di tengah malam. */
const DEBT_REMINDER_HOUR = 8;

const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

function reminderText(
  debt: { direction: DebtDirection; counterparty: string; installments: number | null },
  r: DebtReminder,
) {
  const amount = formatRupiah(r.amount);
  const when = shortDate(r.dueDate);
  const n = debt.installments ?? 1;
  const which = n > 1 ? ` (cicilan ${r.index + 1}/${n})` : '';
  const who = debt.counterparty;
  if (debt.direction === 'PAYABLE') {
    return r.kind === 'soon'
      ? {
          title: 'Utang segera jatuh tempo',
          body: `${amount} ke ${who} jatuh tempo ${when}${which}.`,
        }
      : {
          title: 'Utang lewat jatuh tempo',
          body: `${amount} ke ${who} belum dibayar sejak ${when}${which}.`,
        };
  }
  return r.kind === 'soon'
    ? {
        title: 'Piutang segera jatuh tempo',
        body: `${who} dijadwalkan membayar ${amount} pada ${when}${which}.`,
      }
    : {
        title: 'Piutang belum dibayar',
        body: `${who} belum membayar ${amount} yang jatuh tempo ${when}${which}.`,
      };
}

/**
 * Satu pengingat "segera" dan satu "terlewat" per angsuran. `lastReminder` diklaim sebelum
 * mengirim, jadi aman diulang atau dijalankan di beberapa instance.
 */
export async function runDebtReminders(now: Date = new Date()): Promise<number> {
  if (hourInZone(now) < DEBT_REMINDER_HOUR) return 0;
  const today = toDateString(now);
  const enabled = new Map<string, boolean>();
  let sent = 0;
  let cursor: string | undefined;

  for (let round = 0; round < 1000; round++) {
    const rows = await prisma.debt.findMany({
      where: {
        settledAt: null,
        OR: [{ dueDate: { not: null } }, { firstDueDate: { not: null } }],
      },
      orderBy: { id: 'asc' },
      take: 200,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    if (rows.length === 0) break;
    cursor = rows.at(-1)!.id;
    const totals = await prisma.debtPayment.groupBy({
      by: ['debtId'],
      where: { debtId: { in: rows.map((r) => r.id) } },
      _sum: { amount: true },
    });

    for (const debt of rows) {
      try {
        if (!enabled.has(debt.userId)) {
          enabled.set(debt.userId, await isFeatureEnabled(FEATURE_FLAGS.DEBTS, debt.userId));
        }
        if (!enabled.get(debt.userId)) continue;
        const paid = toNumber(totals.find((t) => t.debtId === debt.id)?._sum.amount ?? 0n);
        const progress = debtProgress({
          total: totalOf(debt),
          installments: debt.installments,
          firstDueDate: debt.firstDueDate ? fromDbDate(debt.firstDueDate) : null,
          dueDate: debt.dueDate ? fromDbDate(debt.dueDate) : null,
          paid,
          today,
        });
        const reminder = debtReminder(progress, today);
        if (!reminder) continue;
        const key = `${reminder.index}:${reminder.kind}`;
        if (debt.lastReminder === key) continue;
        const { count } = await prisma.debt.updateMany({
          where: { id: debt.id, lastReminder: debt.lastReminder },
          data: { lastReminder: key },
        });
        if (count === 0) continue;
        const created = await notify(debt.userId, {
          type: 'DEBT_DUE',
          ...reminderText(debt, reminder),
          link: `/utang?debt=${debt.id}`,
          dedupeKey: `debt:${debt.id}:${key}`,
        });
        if (created) sent++;
      } catch (err) {
        logger.error({ err, debtId: debt.id }, 'Gagal memproses pengingat utang');
      }
    }
  }
  return sent;
}

/** Transaksi dompetnya ikut dihapus permanen; status lunas dibuka lagi. */
export async function deletePayment(userId: string, id: string): Promise<DebtDTO> {
  const row = await prisma.debtPayment.findFirst({ where: { id, userId } });
  if (!row) throw notFound('Pembayaran');
  await prisma.$transaction([
    ...(row.transactionId
      ? [prisma.transaction.deleteMany({ where: { userId, id: row.transactionId } })]
      : []),
    prisma.debtPayment.delete({ where: { id } }),
    prisma.debt.update({
      where: { id: row.debtId },
      data: { settledAt: null, lastReminder: null },
    }),
  ]);
  return getDebt(userId, row.debtId);
}
