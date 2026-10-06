import type { BudgetDTO, BudgetMonthDTO, PutBudgetsInput } from '@catatku/shared';
import { budgetStatus, currentMonth, monthRange, shiftMonth } from '@catatku/shared';
import type { Budget } from '@prisma/client';
import { track } from '../../lib/analytics';
import { validationError } from '../../lib/errors';
import { toDbDate, toNumber } from '../../lib/money';
import { prisma } from '../../lib/prisma';

const visibleTo = (userId: string) => ({ OR: [{ userId: null }, { userId }] });

/**
 * Baris Budget = pengaturan yang berlaku mulai `month` dan seterusnya sampai ada baris
 * yang lebih baru. limitAmount 0 = penanda "anggaran dihentikan" mulai bulan itu.
 * Kembalikan pengaturan yang berlaku di `month` (baris terbaru dengan month ≤ bulan itu) per kategori.
 */
async function effectiveBudgets(
  userId: string,
  month: string,
  opts: { before?: boolean; categoryIds?: string[] } = {},
): Promise<Map<string, Budget>> {
  const rows = await prisma.budget.findMany({
    where: {
      userId,
      month: opts.before ? { lt: month } : { lte: month },
      ...(opts.categoryIds && { categoryId: { in: opts.categoryIds } }),
    },
    orderBy: { month: 'desc' },
  });
  const map = new Map<string, Budget>();
  for (const row of rows) if (!map.has(row.categoryId)) map.set(row.categoryId, row);
  return map;
}

/**
 * Semua kategori pengeluaran aktif beserta anggaran yang berlaku & realisasinya di bulan itu.
 * Kategori tanpa anggaran tetap ikut (id null, limit 0) agar bisa langsung diatur.
 * Urutan: yang beranggaran (paling kritis dulu), lalu sisanya menurut pengeluaran terbesar.
 */
export async function getBudgets(userId: string, month = currentMonth()): Promise<BudgetMonthDTO> {
  const { start, end } = monthRange(month);
  const [categories, effective, spending, nextRows] = await Promise.all([
    prisma.category.findMany({
      where: { type: 'EXPENSE', ...visibleTo(userId) },
      select: { id: true, name: true, icon: true, color: true, archivedAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    effectiveBudgets(userId, month),
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
    prisma.budget.findMany({
      where: { userId, month: shiftMonth(month, 1) },
      select: { categoryId: true },
    }),
  ]);

  const activeBudget = (categoryId: string) => {
    const b = effective.get(categoryId);
    return b && b.limitAmount > 0n ? b : undefined;
  };

  const items: BudgetDTO[] = categories
    // Kategori yang diarsipkan hanya tampil bila anggarannya masih berlaku bulan itu.
    .filter((c) => !c.archivedAt || activeBudget(c.id))
    .map((c) => {
      const budget = activeBudget(c.id);
      const limitAmount = toNumber(budget?.limitAmount);
      const spent = Math.abs(toNumber(spending.find((s) => s.categoryId === c.id)?._sum.amount));
      return {
        id: budget?.id ?? null,
        categoryId: c.id,
        category: { id: c.id, name: c.name, icon: c.icon, color: c.color },
        month,
        since: budget?.month ?? null,
        endsThisMonth: Boolean(budget && nextRows.some((r) => r.categoryId === c.id)),
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

/**
 * Atur banyak anggaran sekaligus mulai `month`; bulan sebelumnya tidak pernah berubah.
 * limitAmount 0 = hentikan anggaran kategori itu. scope "month" = hanya `month`:
 * pengaturan yang tadinya berlaku di bulan berikutnya dikunci dengan baris baru di bulan itu.
 */
export async function putBudgets(userId: string, input: PutBudgetsInput): Promise<BudgetMonthDTO> {
  const { month } = input;
  const nextMonth = shiftMonth(month, 1);
  const byCategory = new Map(input.items.map((i) => [i.categoryId, i]));
  const limits = new Map([...byCategory].map(([id, i]) => [id, i.limitAmount]));
  const monthOnly = [...byCategory.values()].filter((i) => i.scope === 'month');
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

  // Menghentikan anggaran warisan butuh penanda 0; tanpa warisan, baris bulan ini cukup dihapus.
  const inherited = toClear.length
    ? await effectiveBudgets(userId, month, { before: true, categoryIds: toClear })
    : new Map<string, Budget>();
  const needsStop = toClear.filter((id) => (inherited.get(id)?.limitAmount ?? 0n) > 0n);
  const toDelete = toClear.filter((id) => !needsStop.includes(id));

  // Nilai yang berlaku di bulan berikutnya SEBELUM perubahan; bila belum punya baris sendiri, dikunci.
  const nextEffective = monthOnly.length
    ? await effectiveBudgets(userId, nextMonth, { categoryIds: monthOnly.map((i) => i.categoryId) })
    : new Map<string, Budget>();
  const toPin = monthOnly.flatMap((i) => {
    const current = nextEffective.get(i.categoryId);
    if (current?.month === nextMonth) return [];
    const keep = current?.limitAmount ?? 0n;
    return keep === BigInt(i.limitAmount) ? [] : [{ categoryId: i.categoryId, limit: keep }];
  });

  const upsert = (categoryId: string, limit: bigint | number, at = month) =>
    prisma.budget.upsert({
      where: { userId_categoryId_month: { userId, categoryId, month: at } },
      create: { userId, categoryId, month: at, limitAmount: BigInt(limit) },
      update: { limitAmount: BigInt(limit) },
    });

  await prisma.$transaction([
    ...toPin.map((p) => upsert(p.categoryId, p.limit, nextMonth)),
    prisma.budget.deleteMany({ where: { userId, month, categoryId: { in: toDelete } } }),
    ...needsStop.map((categoryId) => upsert(categoryId, 0)),
    ...toSet.map(([categoryId, limit]) => upsert(categoryId, limit)),
  ]);
  track(userId, 'budget_saved', { items: input.items.length, monthOnly: monthOnly.length });
  return getBudgets(userId, month);
}
