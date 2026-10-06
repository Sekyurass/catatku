import type { BudgetDTO, BudgetMonthDTO, PutBudgetsInput } from '@catatku/shared';
import { budgetStatus, currentMonth, monthRange } from '@catatku/shared';
import { validationError } from '../../lib/errors';
import { toDbDate, toNumber } from '../../lib/money';
import { prisma } from '../../lib/prisma';

const visibleTo = (userId: string) => ({ OR: [{ userId: null }, { userId }] });

/**
 * Semua kategori pengeluaran aktif beserta anggaran & realisasinya di bulan itu.
 * Kategori tanpa anggaran tetap ikut (id null, limit 0) agar bisa langsung diatur.
 * Urutan: yang beranggaran (paling kritis dulu), lalu sisanya menurut pengeluaran terbesar.
 */
export async function getBudgets(userId: string, month = currentMonth()): Promise<BudgetMonthDTO> {
  const { start, end } = monthRange(month);
  const [categories, budgets, spending] = await Promise.all([
    prisma.category.findMany({
      where: { type: 'EXPENSE', ...visibleTo(userId) },
      select: { id: true, name: true, icon: true, color: true, archivedAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.budget.findMany({ where: { userId, month } }),
    prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        deletedAt: null,
        type: 'EXPENSE',
        date: { gte: toDbDate(start), lte: toDbDate(end) },
      },
      _sum: { amount: true },
    }),
  ]);

  const items: BudgetDTO[] = categories
    // Kategori yang diarsipkan hanya tampil bila masih punya anggaran bulan itu.
    .filter((c) => !c.archivedAt || budgets.some((b) => b.categoryId === c.id))
    .map((c) => {
      const budget = budgets.find((b) => b.categoryId === c.id);
      const limitAmount = toNumber(budget?.limitAmount);
      const spent = Math.abs(toNumber(spending.find((s) => s.categoryId === c.id)?._sum.amount));
      return {
        id: budget?.id ?? null,
        categoryId: c.id,
        category: { id: c.id, name: c.name, icon: c.icon, color: c.color },
        month,
        limitAmount,
        spent,
        remaining: limitAmount - spent,
        ratio: limitAmount > 0 ? spent / limitAmount : 0,
        status: budgetStatus(spent, limitAmount),
      };
    })
    .sort((a, b) => {
      if ((a.id === null) !== (b.id === null)) return a.id === null ? 1 : -1;
      return a.id !== null ? b.ratio - a.ratio : b.spent - a.spent;
    });

  const budgeted = items.filter((i) => i.id !== null);
  return {
    month,
    items,
    totalLimit: budgeted.reduce((s, i) => s + i.limitAmount, 0),
    totalSpent: budgeted.reduce((s, i) => s + i.spent, 0),
  };
}

/** Atur banyak anggaran sekaligus. limitAmount 0 = hapus anggaran kategori itu. */
export async function putBudgets(userId: string, input: PutBudgetsInput): Promise<BudgetMonthDTO> {
  const { month } = input;
  const limits = new Map(input.items.map((i) => [i.categoryId, i.limitAmount]));
  const toSet = [...limits].filter(([, limit]) => limit > 0);
  const toClear = [...limits].filter(([, limit]) => limit === 0).map(([id]) => id);

  if (toSet.length > 0) {
    const usable = await prisma.category.findMany({
      where: {
        id: { in: toSet.map(([id]) => id) },
        type: 'EXPENSE',
        archivedAt: null,
        ...visibleTo(userId),
      },
      select: { id: true },
    });
    if (usable.length !== toSet.length) {
      throw validationError('Anggaran hanya bisa diatur untuk kategori pengeluaran yang aktif', {
        categoryId: 'Kategori tidak valid',
      });
    }
  }

  await prisma.$transaction([
    prisma.budget.deleteMany({ where: { userId, month, categoryId: { in: toClear } } }),
    ...toSet.map(([categoryId, limit]) =>
      prisma.budget.upsert({
        where: { userId_categoryId_month: { userId, categoryId, month } },
        create: { userId, categoryId, month, limitAmount: BigInt(limit) },
        update: { limitAmount: BigInt(limit) },
      }),
    ),
  ]);
  return getBudgets(userId, month);
}
