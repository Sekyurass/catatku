import type {
  CategoryBreakdownDTO,
  CategoryBreakdownItem,
  CategoryType,
  CompareDTO,
  MonthlyReportDTO,
  MonthTotals,
  SummaryDTO,
  TrendDTO,
  YearlyReportDTO,
} from '@catatku/shared';
import { currentMonth, dailyStats, lastMonths, monthRange, toDateString } from '@catatku/shared';
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
  const { total, items } = await categoryTotals(userId, type, start, end);
  return { month, type, total, items };
}

async function categoryTotals(
  userId: string,
  type: CategoryType,
  start: string,
  end: string,
): Promise<{ total: number; items: CategoryBreakdownItem[] }> {
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
  return { total, items };
}

async function monthTotals(userId: string, month: string): Promise<MonthTotals> {
  const { start, end } = monthRange(month);
  const flows = await prisma.transaction.groupBy({
    by: ['type'],
    where: flowWhere(userId, start, end),
    _sum: { amount: true },
  });
  const sumOf = (type: CategoryType) =>
    Math.abs(toNumber(flows.find((f) => f.type === type)?._sum.amount));
  const income = sumOf('INCOME');
  const expense = sumOf('EXPENSE');
  return { month, income, expense, net: income - expense };
}

export async function getMonthlyReport(
  userId: string,
  month = currentMonth(),
  today = toDateString(),
): Promise<MonthlyReportDTO> {
  const { start, end } = monthRange(month);
  const [rows, top] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['date', 'type'],
      where: flowWhere(userId, start, end),
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.transaction.findMany({
      where: { ...flowWhere(userId, start, end), type: 'EXPENSE' },
      // Pengeluaran bernilai negatif: yang terkecil = yang terbesar.
      orderBy: [{ amount: 'asc' }, { date: 'desc' }, { id: 'asc' }],
      take: 5,
      select: {
        id: true,
        date: true,
        amount: true,
        note: true,
        category: { select: { id: true, name: true, icon: true, color: true } },
        wallet: { select: { id: true, name: true, color: true } },
      },
    }),
  ]);

  const byDate = new Map<
    string,
    { date: string; income: number; expense: number; expenseCount: number }
  >();
  for (const r of rows) {
    const date = fromDbDate(r.date);
    const entry = byDate.get(date) ?? { date, income: 0, expense: 0, expenseCount: 0 };
    const value = Math.abs(toNumber(r._sum.amount));
    if (r.type === 'INCOME') entry.income += value;
    else {
      entry.expense += value;
      entry.expenseCount += r._count._all;
    }
    byDate.set(date, entry);
  }
  const days = [...byDate.values()];
  const income = days.reduce((s, d) => s + d.income, 0);
  const expense = days.reduce((s, d) => s + d.expense, 0);

  return {
    month,
    income,
    expense,
    net: income - expense,
    ...dailyStats(month, today, days),
    topExpenses: top.map((t) => ({
      id: t.id,
      date: fromDbDate(t.date),
      amount: Math.abs(toNumber(t.amount)),
      note: t.note,
      category: t.category,
      wallet: t.wallet,
    })),
  };
}

export async function getCompare(
  userId: string,
  from: string,
  to: string,
  type: CategoryType,
): Promise<CompareDTO> {
  const [fromTotals, toTotals, fromCats, toCats] = await Promise.all([
    monthTotals(userId, from),
    monthTotals(userId, to),
    categoryTotals(userId, type, monthRange(from).start, monthRange(from).end),
    categoryTotals(userId, type, monthRange(to).start, monthRange(to).end),
  ]);
  const keyOf = (c: CategoryBreakdownItem) => c.categoryId ?? '';
  const merged = new Map<string, CompareDTO['items'][number]>();
  for (const [side, list] of [
    ['from', fromCats.items],
    ['to', toCats.items],
  ] as const) {
    for (const c of list) {
      const item = merged.get(keyOf(c)) ?? {
        categoryId: c.categoryId,
        name: c.name,
        icon: c.icon,
        color: c.color,
        from: 0,
        to: 0,
        diff: 0,
        change: null,
      };
      item[side] = c.total;
      merged.set(keyOf(c), item);
    }
  }
  const items = [...merged.values()]
    .map((i) => ({
      ...i,
      diff: i.to - i.from,
      change: i.from > 0 ? (i.to - i.from) / i.from : null,
    }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || b.to - a.to);
  return { type, from: fromTotals, to: toTotals, items };
}

export async function getYearly(
  userId: string,
  year: number,
  today = toDateString(),
): Promise<YearlyReportDTO> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const [rows, cats] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['date', 'type'],
      where: flowWhere(userId, start, end),
      _sum: { amount: true },
    }),
    categoryTotals(userId, 'EXPENSE', start, end),
  ]);
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: `${year}-${String(i + 1).padStart(2, '0')}`,
    income: 0,
    expense: 0,
    net: 0,
  }));
  for (const r of rows) {
    const m = months[Number(fromDbDate(r.date).slice(5, 7)) - 1]!;
    const value = Math.abs(toNumber(r._sum.amount));
    if (r.type === 'INCOME') m.income += value;
    else m.expense += value;
  }
  for (const m of months) m.net = m.income - m.expense;

  const thisYear = Number(today.slice(0, 4));
  const monthsCounted = year < thisYear ? 12 : year > thisYear ? 0 : Number(today.slice(5, 7));
  const countedExpense = months.slice(0, monthsCounted).reduce((s, m) => s + m.expense, 0);
  const income = months.reduce((s, m) => s + m.income, 0);
  const expense = months.reduce((s, m) => s + m.expense, 0);
  return {
    year,
    income,
    expense,
    net: income - expense,
    months,
    averageMonthlyExpense: monthsCounted > 0 ? Math.round(countedExpense / monthsCounted) : 0,
    monthsCounted,
    topCategories: cats.items.slice(0, 5),
  };
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
