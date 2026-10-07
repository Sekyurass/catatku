import {
  computeInsights,
  INSIGHT_LOOKBACK_DAYS,
  type InsightDTO,
  toDateString,
} from '@catatku/shared';
import { track } from '../../lib/analytics';
import { fromDbDate, toDbDate, toNumber } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { getBudgets } from '../budgets/budget.service';

const DAY_MS = 86_400_000;

/** Insight untuk hari ini, tanpa yang sudah ditutup pengguna. */
export async function listInsights(userId: string, today = toDateString()): Promise<InsightDTO[]> {
  const from = new Date(Date.parse(today) - INSIGHT_LOOKBACK_DAYS * DAY_MS);
  const [budgetMonth, rows, rules, dismissed] = await Promise.all([
    getBudgets(userId, today.slice(0, 7)),
    prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        type: 'EXPENSE',
        date: { gte: from, lte: toDbDate(today) },
      },
      select: {
        id: true,
        date: true,
        amount: true,
        note: true,
        categoryId: true,
        walletId: true,
        recurringRuleId: true,
      },
    }),
    prisma.recurringRule.findMany({ where: { userId }, select: { note: true } }),
    prisma.insightDismissal.findMany({ where: { userId }, select: { insightId: true } }),
  ]);

  const hidden = new Set(dismissed.map((d) => d.insightId));
  return computeInsights({
    today,
    expenses: rows.map((r) => ({
      id: r.id,
      date: fromDbDate(r.date),
      amount: Math.abs(toNumber(r.amount)),
      note: r.note,
      categoryId: r.categoryId,
      walletId: r.walletId,
      recurringRuleId: r.recurringRuleId,
    })),
    categories: budgetMonth.items.map((b) => b.category),
    budgets: budgetMonth.items
      .filter((b) => b.id !== null)
      .map((b) => ({ categoryId: b.categoryId, limitAmount: b.limitAmount, spent: b.spent })),
    recurringNotes: rules.map((r) => r.note),
  }).filter((i) => !hidden.has(i.id));
}

export async function dismissInsight(userId: string, insightId: string): Promise<void> {
  await prisma.insightDismissal.upsert({
    where: { userId_insightId: { userId, insightId } },
    create: { userId, insightId },
    update: {},
  });
  track(userId, 'insight_dismissed', { kind: insightId.split(':')[0]! });
}

export async function restoreInsight(userId: string, insightId: string): Promise<void> {
  await prisma.insightDismissal.deleteMany({ where: { userId, insightId } });
}
