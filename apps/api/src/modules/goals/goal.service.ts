import { randomUUID } from 'node:crypto';
import {
  type createContributionSchema,
  type createGoalSchema,
  currentMonth,
  type GoalContributionDTO,
  type GoalDTO,
  MAX_GOALS,
  monthRange,
  toDateString,
  type updateGoalSchema,
  type CategoryIcon,
} from '@catatku/shared';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { track } from '../../lib/analytics';
import { conflict, notFound, validationError } from '../../lib/errors';
import { fromDbDate, toDbDate, toNumber } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { findActiveWallet } from '../wallets/wallet.service';

const include = {
  wallet: { select: { id: true, name: true, color: true, archivedAt: true } },
} as const;

type GoalRow = Prisma.SavingsGoalGetPayload<{ include: typeof include }>;

interface Totals {
  saved: number;
  savedThisMonth: number;
  count: number;
}

const EMPTY: Totals = { saved: 0, savedThisMonth: 0, count: 0 };

function toDTO(row: GoalRow, totals: Totals = EMPTY): GoalDTO {
  return {
    id: row.id,
    name: row.name,
    targetAmount: toNumber(row.targetAmount),
    deadline: row.deadline ? fromDbDate(row.deadline) : null,
    icon: row.icon as CategoryIcon,
    color: row.color,
    walletId: row.walletId,
    wallet: row.wallet && {
      id: row.wallet.id,
      name: row.wallet.name,
      color: row.wallet.color,
      archivedAt: row.wallet.archivedAt?.toISOString() ?? null,
    },
    saved: totals.saved,
    savedThisMonth: totals.savedThisMonth,
    contributionCount: totals.count,
    createdAt: row.createdAt.toISOString(),
  };
}

async function findOwnedGoal(userId: string, id: string): Promise<GoalRow> {
  const row = await prisma.savingsGoal.findFirst({ where: { id, userId }, include });
  if (!row) throw notFound('Target');
  return row;
}

/**
 * Setoran tertaut transfer memakai nominal & tanggal transfernya (bisa diubah dari halaman
 * transaksi) dan diabaikan selama transfernya terhapus, jadi "urungkan" ikut memulihkannya.
 */
async function goalTotals(userId: string, goalId?: string): Promise<Map<string, Totals>> {
  const monthStart = monthRange(currentMonth()).start;
  const rows = await prisma.$queryRaw<
    { goalId: string; saved: bigint; thisMonth: bigint; count: bigint }[]
  >`
    WITH effective AS (
      SELECT c."goalId",
        CASE WHEN c."transferGroupId" IS NULL THEN c.amount
             WHEN c.amount < 0 THEN -t.amount ELSE t.amount END AS amount,
        COALESCE(t.date, c.date) AS date
      FROM "GoalContribution" c
      LEFT JOIN "Transaction" t
        ON c."transferGroupId" IS NOT NULL
       AND t."transferGroupId" = c."transferGroupId"
       AND t."userId" = c."userId"
       AND t.amount > 0
       AND t."deletedAt" IS NULL
      WHERE c."userId" = ${userId}
        ${goalId ? Prisma.sql`AND c."goalId" = ${goalId}` : Prisma.empty}
        AND (c."transferGroupId" IS NULL OR t.id IS NOT NULL)
    )
    SELECT "goalId",
      SUM(amount)::bigint AS saved,
      COALESCE(SUM(amount) FILTER (WHERE date >= ${monthStart}::date), 0)::bigint AS "thisMonth",
      COUNT(*) AS count
    FROM effective
    GROUP BY "goalId"`;
  return new Map(
    rows.map((r) => [
      r.goalId,
      { saved: toNumber(r.saved), savedThisMonth: toNumber(r.thisMonth), count: toNumber(r.count) },
    ]),
  );
}

function assertDeadline(deadline: string | null | undefined) {
  if (deadline && deadline < toDateString()) {
    throw validationError('Tenggat tidak boleh di masa lalu', {
      deadline: 'Pilih tanggal hari ini atau setelahnya',
    });
  }
}

export async function listGoals(userId: string): Promise<GoalDTO[]> {
  const [rows, totals] = await Promise.all([
    prisma.savingsGoal.findMany({ where: { userId }, include, orderBy: { createdAt: 'asc' } }),
    goalTotals(userId),
  ]);
  return rows.map((row) => toDTO(row, totals.get(row.id)));
}

export async function getGoal(userId: string, id: string): Promise<GoalDTO> {
  const [row, totals] = await Promise.all([findOwnedGoal(userId, id), goalTotals(userId, id)]);
  return toDTO(row, totals.get(id));
}

export async function createGoal(
  userId: string,
  data: z.output<typeof createGoalSchema>,
): Promise<GoalDTO> {
  assertDeadline(data.deadline);
  const [count] = await Promise.all([
    prisma.savingsGoal.count({ where: { userId } }),
    data.walletId ? findActiveWallet(userId, data.walletId) : null,
  ]);
  if (count >= MAX_GOALS) {
    throw conflict(`Maksimal ${MAX_GOALS} target. Hapus yang sudah selesai dulu.`);
  }
  const row = await prisma.savingsGoal.create({
    data: {
      userId,
      name: data.name,
      targetAmount: BigInt(data.targetAmount),
      deadline: data.deadline ? toDbDate(data.deadline) : null,
      icon: data.icon,
      color: data.color,
      walletId: data.walletId,
    },
    include,
  });
  track(userId, 'goal_created', {
    hasDeadline: data.deadline !== null,
    hasWallet: data.walletId !== null,
  });
  return toDTO(row);
}

export async function updateGoal(
  userId: string,
  id: string,
  input: z.output<typeof updateGoalSchema>,
): Promise<GoalDTO> {
  const row = await findOwnedGoal(userId, id);
  const currentDeadline = row.deadline ? fromDbDate(row.deadline) : null;
  if (input.deadline !== currentDeadline) assertDeadline(input.deadline);
  if (input.walletId && input.walletId !== row.walletId) {
    await findActiveWallet(userId, input.walletId);
  }
  await prisma.savingsGoal.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.targetAmount !== undefined && { targetAmount: BigInt(input.targetAmount) }),
      ...(input.deadline !== undefined && {
        deadline: input.deadline ? toDbDate(input.deadline) : null,
      }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.walletId !== undefined && { walletId: input.walletId }),
    },
  });
  return getGoal(userId, id);
}

/** Transfer yang pernah dibuat dari setoran tetap ada; uangnya memang sudah berpindah. */
export async function deleteGoal(userId: string, id: string): Promise<void> {
  await findOwnedGoal(userId, id);
  await prisma.savingsGoal.delete({ where: { id } });
}

export async function listContributions(
  userId: string,
  goalId: string,
): Promise<GoalContributionDTO[]> {
  await findOwnedGoal(userId, goalId);
  const rows = await prisma.goalContribution.findMany({
    where: { userId, goalId },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });
  const groupIds = rows.flatMap((r) => (r.transferGroupId ? [r.transferGroupId] : []));
  const legs = groupIds.length
    ? await prisma.transaction.findMany({
        where: { userId, transferGroupId: { in: groupIds }, deletedAt: null },
        select: {
          transferGroupId: true,
          amount: true,
          date: true,
          wallet: { select: { id: true, name: true, color: true } },
        },
      })
    : [];

  const items = rows.flatMap((row): GoalContributionDTO[] => {
    const type = row.amount < 0n ? 'WITHDRAW' : 'DEPOSIT';
    const base = {
      id: row.id,
      goalId: row.goalId,
      type,
      note: row.note,
      transferGroupId: row.transferGroupId,
      createdAt: row.createdAt.toISOString(),
    } as const;
    if (!row.transferGroupId) {
      const amount = Math.abs(toNumber(row.amount));
      return [{ ...base, amount, date: fromDbDate(row.date), wallet: null }];
    }
    const group = legs.filter((l) => l.transferGroupId === row.transferGroupId);
    const inLeg = group.find((l) => l.amount > 0n);
    const outLeg = group.find((l) => l.amount < 0n);
    if (!inLeg || !outLeg) return [];
    // Setor: dompet asal = sisi keluar. Tarik: dompet tujuan = sisi masuk.
    const other = type === 'DEPOSIT' ? outLeg : inLeg;
    return [
      {
        ...base,
        amount: toNumber(inLeg.amount),
        date: fromDbDate(inLeg.date),
        wallet: other.wallet,
      },
    ];
  });
  return items.sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
}

export async function createContribution(
  userId: string,
  goalId: string,
  input: z.output<typeof createContributionSchema>,
): Promise<GoalDTO> {
  const goal = await findOwnedGoal(userId, goalId);
  const deposit = input.type === 'DEPOSIT';

  if (!deposit) {
    const saved = (await goalTotals(userId, goalId)).get(goalId)?.saved ?? 0;
    if (input.amount > saved) {
      throw validationError('Penarikan melebihi jumlah yang terkumpul', {
        amount: 'Melebihi jumlah yang terkumpul',
      });
    }
  }

  const contribution = {
    goalId,
    userId,
    amount: BigInt(deposit ? input.amount : -input.amount),
    date: toDbDate(input.date),
    note: input.note ?? null,
  };

  if (!goal.walletId || !goal.wallet) {
    if (input.walletId) {
      throw validationError('Target ini tidak memakai dompet tabungan', {
        walletId: 'Target ini tidak memakai dompet tabungan',
      });
    }
    await prisma.goalContribution.create({ data: contribution });
  } else {
    if (goal.wallet.archivedAt) {
      throw validationError('Dompet tabungan target ini sudah diarsipkan. Ganti dompetnya dulu.');
    }
    const field = deposit ? 'Pilih dompet asal' : 'Pilih dompet tujuan';
    if (!input.walletId) throw validationError(field, { walletId: field });
    if (input.walletId === goal.walletId) {
      throw validationError('Pilih dompet selain dompet tabungan', {
        walletId: 'Pilih dompet selain dompet tabungan',
      });
    }
    await findActiveWallet(userId, input.walletId);

    const transferGroupId = randomUUID();
    const [fromWalletId, toWalletId] = deposit
      ? [input.walletId, goal.walletId]
      : [goal.walletId, input.walletId];
    const leg = {
      userId,
      type: 'TRANSFER' as const,
      date: contribution.date,
      note: input.note ?? `${deposit ? 'Setor ke' : 'Tarik dari'} target ${goal.name}`,
      transferGroupId,
    };
    await prisma.$transaction([
      prisma.transaction.create({
        data: { ...leg, walletId: fromWalletId, amount: BigInt(-input.amount) },
      }),
      prisma.transaction.create({
        data: { ...leg, walletId: toWalletId, amount: BigInt(input.amount) },
      }),
      prisma.goalContribution.create({ data: { ...contribution, transferGroupId } }),
    ]);
  }

  track(userId, 'goal_contribution', { type: input.type, transfer: Boolean(goal.walletId) });
  return getGoal(userId, goalId);
}

/** Transfer yang tertaut ikut dihapus (soft delete) agar saldo dompet kembali seperti semula. */
export async function deleteContribution(userId: string, id: string): Promise<void> {
  const row = await prisma.goalContribution.findFirst({ where: { id, userId } });
  if (!row) throw notFound('Setoran');
  if (!row.transferGroupId) {
    await prisma.goalContribution.delete({ where: { id } });
    return;
  }
  await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { userId, transferGroupId: row.transferGroupId, deletedAt: null },
      data: { deletedAt: new Date() },
    }),
    prisma.goalContribution.delete({ where: { id } }),
  ]);
}
