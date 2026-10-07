import {
  computeForecast,
  FORECAST_LOOKBACK_DAYS,
  type ForecastDTO,
  type ForecastUpcomingItem,
  monthRange,
  occurrenceDate,
  toDateString,
} from '@catatku/shared';
import { fromDbDate, toDbDate, toNumber } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { totalBalance } from './report.service';

/** Pengaman bila data jadwal rusak; aturan harian pun paling banyak 31 kejadian sebulan. */
const MAX_OCCURRENCES_PER_RULE = 40;

const category = { select: { id: true, name: true, icon: true, color: true } } as const;

const DAY_MS = 86_400_000;
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * Perkiraan saldo akhir bulan. Transaksi dari aturan berulang tidak masuk rata-rata harian karena
 * kejadian berikutnya sudah dihitung terpisah sebagai tagihan/pemasukan terjadwal.
 */
export async function getForecast(userId: string, today = toDateString()): Promise<ForecastDTO> {
  const { end: monthEnd } = monthRange(today.slice(0, 7));
  const activeWallet = { archivedAt: null };

  const [balance, expenses, first, rules, pending] = await Promise.all([
    totalBalance(userId),
    prisma.transaction.groupBy({
      by: ['date'],
      where: {
        userId,
        deletedAt: null,
        type: 'EXPENSE',
        recurringRuleId: null,
        wallet: activeWallet,
        date: { gte: toDbDate(addDays(today, -FORECAST_LOOKBACK_DAYS)), lt: toDbDate(today) },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { date: 'asc' },
      select: { date: true },
    }),
    prisma.recurringRule.findMany({
      where: {
        userId,
        pausedAt: null,
        type: { in: ['INCOME', 'EXPENSE'] },
        nextRunAt: { not: null, lte: toDbDate(monthEnd) },
        wallet: activeWallet,
      },
      include: { category },
    }),
    prisma.recurringOccurrence.findMany({
      where: { userId, status: 'PENDING', date: { lte: toDbDate(monthEnd) } },
      include: { rule: { include: { category, wallet: { select: { archivedAt: true } } } } },
    }),
  ]);

  const upcoming: ForecastUpcomingItem[] = [];
  for (const o of pending) {
    if (o.rule.wallet.archivedAt) continue;
    upcoming.push({
      date: fromDbDate(o.date),
      type: o.rule.type as ForecastUpcomingItem['type'],
      amount: toNumber(o.rule.amount),
      note: o.rule.note,
      category: o.rule.category,
      status: 'pending',
    });
  }
  for (const rule of rules) {
    const schedule = {
      startDate: fromDbDate(rule.startDate),
      frequency: rule.frequency,
      interval: rule.interval,
    };
    const endDate = rule.endDate ? fromDbDate(rule.endDate) : null;
    for (let i = rule.nextIndex; i < rule.nextIndex + MAX_OCCURRENCES_PER_RULE; i++) {
      const date = occurrenceDate(schedule, i);
      if (date > monthEnd || (endDate && date > endDate)) break;
      upcoming.push({
        date,
        type: rule.type as ForecastUpcomingItem['type'],
        amount: toNumber(rule.amount),
        note: rule.note,
        category: rule.category,
        status: 'scheduled',
      });
    }
  }

  return computeForecast({
    today,
    balance,
    expenses: expenses.map((e) => ({
      date: fromDbDate(e.date),
      amount: Math.abs(toNumber(e._sum.amount)),
    })),
    firstActivityDate: first ? fromDbDate(first.date) : null,
    upcoming,
  });
}
