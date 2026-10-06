import type { CategoryBreakdownDTO, CategoryType, SummaryDTO, TrendDTO } from '@catatku/shared';
import { currentMonth, lastMonths, monthRange } from '@catatku/shared';
import type { Prisma } from '@prisma/client';
import { fromDbDate, toDbDate, toNumber } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { recentTransactions } from '../transactions/transaction.service';

/** Pemasukan & pengeluaran saja; transfer bukan pemasukan/pengeluaran. */
function flowWhere(userId: string, start: string, end: string): Prisma.TransactionWhereInput {
  return {
    userId,
    deletedAt: null,
    type: { in: ['INCOME', 'EXPENSE'] },
    date: { gte: toDbDate(start), lte: toDbDate(end) },
  };
}

/** Total saldo seluruh dompet aktif = Σ saldo awal + Σ transaksi aktif di dompet tersebut. */
export async function totalBalance(userId: string): Promise<number> {
  const [wallets, txs] = await Promise.all([
    prisma.wallet.aggregate({
      where: { userId, archivedAt: null },
      _sum: { initialBalance: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, deletedAt: null, wallet: { archivedAt: null } },
      _sum: { amount: true },
    }),
  ]);
  return toNumber((wallets._sum.initialBalance ?? 0n) + (txs._sum.amount ?? 0n));
}

export async function getSummary(userId: string, month = currentMonth()): Promise<SummaryDTO> {
  const { start, end } = monthRange(month);
  const [balance, flows, recent] = await Promise.all([
    totalBalance(userId),
    prisma.transaction.groupBy({
      by: ['type'],
      where: flowWhere(userId, start, end),
      _sum: { amount: true },
    }),
    recentTransactions(userId, 5),
  ]);
  const sumOf = (type: CategoryType) =>
    Math.abs(toNumber(flows.find((f) => f.type === type)?._sum.amount));
  const income = sumOf('INCOME');
  const expense = sumOf('EXPENSE');
  return { month, totalBalance: balance, income, expense, net: income - expense, recent };
}

export async function getByCategory(
  userId: string,
  type: CategoryType,
  month = currentMonth(),
): Promise<CategoryBreakdownDTO> {
  const { start, end } = monthRange(month);
  // Kategori pengguna jumlahnya kecil, jadi diambil sekaligus agar tidak menunggu hasil agregasi.
  const [groups, categories] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { ...flowWhere(userId, start, end), type },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.category.findMany({
      where: { type, OR: [{ userId: null }, { userId }] },
      select: { id: true, name: true, icon: true, color: true },
    }),
  ]);

  const total = groups.reduce((s, g) => s + Math.abs(toNumber(g._sum.amount)), 0);
  const items = groups
    .map((g) => {
      const c = categories.find((x) => x.id === g.categoryId);
      const amount = Math.abs(toNumber(g._sum.amount));
      return {
        categoryId: c?.id ?? null,
        name: c?.name ?? 'Tanpa kategori',
        icon: c?.icon ?? 'circle-ellipsis',
        color: c?.color ?? '#94A3B8',
        total: amount,
        ratio: total > 0 ? amount / total : 0,
        count: g._count._all,
      };
    })
    .sort((a, b) => b.total - a.total);
  return { month, type, total, items };
}

export async function getTrend(userId: string, months: number): Promise<TrendDTO> {
  const list = lastMonths(currentMonth(), months);
  const start = monthRange(list[0]!).start;
  const end = monthRange(list[list.length - 1]!).end;
  // Dikelompokkan per tanggal oleh database (maks ~730 baris untuk 24 bulan), lalu dilipat per bulan.
  const rows = await prisma.transaction.groupBy({
    by: ['date', 'type'],
    where: flowWhere(userId, start, end),
    _sum: { amount: true },
  });
  const byMonth = new Map(list.map((m) => [m, { month: m, income: 0, expense: 0 }]));
  for (const row of rows) {
    const point = byMonth.get(fromDbDate(row.date).slice(0, 7));
    if (!point) continue;
    const value = Math.abs(toNumber(row._sum.amount));
    if (row.type === 'INCOME') point.income += value;
    else point.expense += value;
  }
  return { months: [...byMonth.values()] };
}
