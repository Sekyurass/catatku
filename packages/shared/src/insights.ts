import { z } from 'zod';
import { merchantKey } from './categorize';
import { formatRupiah } from './money';
import { firstIndexOnOrAfter, occurrenceDate } from './recurrence';

export const INSIGHT_KINDS = [
  'category_change',
  'budget_pace',
  'new_subscription',
  'unusual_expense',
] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];
export type InsightPriority = 'high' | 'medium' | 'low';
export type InsightTone = 'warning' | 'positive' | 'info';

export interface InsightCategoryRef {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface InsightTxRef {
  id: string;
  date: string;
  /** Selalu positif. */
  amount: number;
  note: string | null;
}

interface InsightBase {
  /** Stabil per periode; dipakai untuk menutup insight. */
  id: string;
  priority: InsightPriority;
  tone: InsightTone;
  title: string;
  body: string;
}

export type InsightDTO = InsightBase &
  (
    | {
        kind: 'category_change';
        detail: {
          category: InsightCategoryRef;
          direction: 'up' | 'down';
          current: number;
          previous: number;
          /** (current − previous) / previous, mis. 0.45 = naik 45%. */
          change: number;
          /** Periode pembanding: tanggal 1 sampai tanggal ini di bulan berjalan dan bulan lalu. */
          currentRange: { start: string; end: string };
          previousRange: { start: string; end: string };
          /** Transaksi terbesar periode ini, maks 5. */
          topTransactions: InsightTxRef[];
        };
      }
    | {
        kind: 'budget_pace';
        detail: {
          category: InsightCategoryRef;
          month: string;
          limit: number;
          spent: number;
          /** Perkiraan total sebulan dengan laju harian sejauh ini. */
          projected: number;
          daysElapsed: number;
          daysInMonth: number;
          runOutDate: string;
          /** Batas per hari (termasuk hari ini) supaya sisa anggaran cukup sampai akhir bulan. */
          dailyAllowance: number;
        };
      }
    | {
        kind: 'new_subscription';
        detail: {
          merchant: string;
          amount: number;
          averageGapDays: number;
          lastDate: string;
          /** Perkiraan tagihan berikutnya (paling cepat hari ini). */
          nextDate: string;
          category: InsightCategoryRef | null;
          walletId: string;
          note: string | null;
          occurrences: InsightTxRef[];
        };
      }
    | {
        kind: 'unusual_expense';
        detail: {
          category: InsightCategoryRef;
          transaction: InsightTxRef;
          /** Median pengeluaran kategori ini dalam 90 hari sebelum transaksi tersebut. */
          median: number;
          /** amount / median, dibulatkan 1 desimal. */
          multiple: number;
          sampleSize: number;
        };
      }
  );

export interface InsightExpense {
  id: string;
  date: string;
  /** Selalu positif. */
  amount: number;
  note: string | null;
  categoryId: string | null;
  walletId: string;
  recurringRuleId: string | null;
}

export interface InsightBudget {
  categoryId: string;
  limitAmount: number;
  spent: number;
}

export interface InsightsInput {
  today: string;
  /** Pengeluaran (bukan transfer) dalam INSIGHT_LOOKBACK_DAYS hari terakhir sampai hari ini. */
  expenses: InsightExpense[];
  categories: InsightCategoryRef[];
  /** Anggaran bulan berjalan yang punya batas. */
  budgets: InsightBudget[];
  /** Catatan aturan transaksi berulang yang sudah ada, supaya langganannya tidak disarankan lagi. */
  recurringNotes: (string | null)[];
}

export const INSIGHT_LOOKBACK_DAYS = 120;

/** id insight dikirim di path URL saat menutup insight. */
export const insightIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(
    /^(category_change|budget_pace|new_subscription|unusual_expense):[^/]+$/,
    'Insight tidak dikenal',
  );

const DAY_MS = 86_400_000;
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

const CATEGORY_MIN_DAY = 5;
const CATEGORY_MIN_CHANGE = 0.3;
const CATEGORY_MIN_DIFF = 50_000;
const CATEGORY_MIN_BASE = 100_000;
const BUDGET_MIN_DAY = 3;
const BUDGET_PACE_MARGIN = 1.05;
const SUB_GAP_MIN = 25;
const SUB_GAP_MAX = 35;
const SUB_AMOUNT_TOLERANCE = 0.05;
const UNUSUAL_RECENT_DAYS = 14;
const UNUSUAL_SAMPLE_DAYS = 90;
const UNUSUAL_MIN_SAMPLES = 5;
const UNUSUAL_MULTIPLE = 3;
const UNUSUAL_MIN_AMOUNT = 200_000;

const addDays = (date: string, days: number) =>
  new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

const daysInMonthOf = (date: string) => {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** "2026-10-24" -> "24 Okt". */
function formatShortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number) as [number, number, number];
  return `${d} ${MONTH_SHORT[m - 1]}`;
}

const percent = (ratio: number) => `${Math.round(Math.abs(ratio) * 100)}%`;
const toRef = (t: InsightExpense): InsightTxRef => ({
  id: t.id,
  date: t.date,
  amount: t.amount,
  note: t.note,
});

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function categoryChanges(
  input: InsightsInput,
  cats: Map<string, InsightCategoryRef>,
): InsightDTO[] {
  const { today } = input;
  const day = Number(today.slice(8, 10));
  if (day < CATEGORY_MIN_DAY) return [];
  const month = today.slice(0, 7);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const prevEndDay = Math.min(day, daysInMonthOf(`${prevMonth}-01`));
  const currentRange = { start: `${month}-01`, end: today };
  const previousRange = {
    start: `${prevMonth}-01`,
    end: `${prevMonth}-${String(prevEndDay).padStart(2, '0')}`,
  };

  const totals = new Map<string, { current: number; previous: number; items: InsightExpense[] }>();
  for (const t of input.expenses) {
    if (!t.categoryId || !cats.has(t.categoryId)) continue;
    const inCurrent = t.date >= currentRange.start && t.date <= currentRange.end;
    const inPrevious = t.date >= previousRange.start && t.date <= previousRange.end;
    if (!inCurrent && !inPrevious) continue;
    const entry = totals.get(t.categoryId) ?? { current: 0, previous: 0, items: [] };
    if (inCurrent) {
      entry.current += t.amount;
      entry.items.push(t);
    } else {
      entry.previous += t.amount;
    }
    totals.set(t.categoryId, entry);
  }

  const found: { diff: number; insight: InsightDTO }[] = [];
  for (const [categoryId, { current, previous, items }] of totals) {
    if (previous === 0) continue;
    const diff = current - previous;
    const change = diff / previous;
    if (Math.abs(change) < CATEGORY_MIN_CHANGE || Math.abs(diff) < CATEGORY_MIN_DIFF) continue;
    if (Math.max(current, previous) < CATEGORY_MIN_BASE) continue;
    const category = cats.get(categoryId)!;
    const direction = diff > 0 ? 'up' : 'down';
    const big = change >= 0.5 && diff >= 200_000;
    found.push({
      diff: Math.abs(diff),
      insight: {
        id: `category_change:${month}:${categoryId}:${direction}`,
        kind: 'category_change',
        priority: big ? 'medium' : 'low',
        tone: direction === 'up' ? 'warning' : 'positive',
        title: `${category.name} ${direction === 'up' ? 'naik' : 'turun'} ${percent(change)} dari bulan lalu`,
        body: `${formatRupiah(current)} sampai ${formatShortDate(today)}, dibanding ${formatRupiah(previous)} di periode yang sama bulan lalu.`,
        detail: {
          category,
          direction,
          current,
          previous,
          change,
          currentRange,
          previousRange,
          topTransactions: [...items]
            .sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date))
            .slice(0, 5)
            .map(toRef),
        },
      },
    });
  }
  return found
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 2)
    .map((f) => f.insight);
}

function budgetPaces(input: InsightsInput, cats: Map<string, InsightCategoryRef>): InsightDTO[] {
  const { today } = input;
  const day = Number(today.slice(8, 10));
  if (day < BUDGET_MIN_DAY) return [];
  const month = today.slice(0, 7);
  const dim = daysInMonthOf(today);
  const out: InsightDTO[] = [];
  for (const b of input.budgets) {
    const category = cats.get(b.categoryId);
    if (!category || b.limitAmount <= 0 || b.spent <= 0 || b.spent >= b.limitAmount) continue;
    const perDay = b.spent / day;
    const projected = Math.round(perDay * dim);
    if (projected <= b.limitAmount * BUDGET_PACE_MARGIN) continue;
    const runOutDay = Math.min(dim, Math.max(day, Math.ceil(b.limitAmount / perDay)));
    const runOutDate = `${month}-${String(runOutDay).padStart(2, '0')}`;
    const dailyAllowance = Math.floor((b.limitAmount - b.spent) / (dim - day + 1));
    out.push({
      id: `budget_pace:${month}:${b.categoryId}`,
      kind: 'budget_pace',
      priority: runOutDay - day <= 7 ? 'high' : 'medium',
      tone: 'warning',
      title: `Anggaran ${category.name} bisa habis sekitar ${formatShortDate(runOutDate)}`,
      body: `Dengan laju sekarang, totalnya sekitar ${formatRupiah(projected)} bulan ini. Supaya cukup, sekitar ${formatRupiah(dailyAllowance)} per hari sampai akhir bulan.`,
      detail: {
        category,
        month,
        limit: b.limitAmount,
        spent: b.spent,
        projected,
        daysElapsed: day,
        daysInMonth: dim,
        runOutDate,
        dailyAllowance,
      },
    });
  }
  return out;
}

function subscriptions(input: InsightsInput, cats: Map<string, InsightCategoryRef>): InsightDTO[] {
  const { today } = input;
  // "Netflix" dan aturan "Netflix bulanan" dianggap sama: cocok per kata utuh, ke dua arah.
  const known = input.recurringNotes
    .map((n) => (n ? merchantKey(n) : null))
    .filter((k) => k !== null)
    .map((k) => ` ${k} `);
  const isKnown = (key: string) =>
    known.some((k) => k.includes(` ${key} `) || ` ${key} `.includes(k));
  const groups = new Map<string, InsightExpense[]>();
  for (const t of input.expenses) {
    if (t.recurringRuleId || !t.note || t.date > today) continue;
    const key = merchantKey(t.note);
    if (!key || isKnown(key)) continue;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const out: { amount: number; insight: InsightDTO }[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
    const last = sorted[0]!;
    if (daysBetween(last.date, today) > SUB_GAP_MAX) continue;
    const similar = sorted.filter(
      (t) => Math.abs(t.amount - last.amount) <= last.amount * SUB_AMOUNT_TOLERANCE,
    );
    const chain = [last];
    for (const t of similar.slice(1)) {
      const gap = daysBetween(t.date, chain[chain.length - 1]!.date);
      if (gap < SUB_GAP_MIN) continue;
      if (gap > SUB_GAP_MAX) break;
      chain.push(t);
    }
    if (chain.length < 2) continue;

    const schedule = { startDate: last.date, frequency: 'MONTHLY' as const, interval: 1 };
    const nextDate = occurrenceDate(schedule, Math.max(1, firstIndexOnOrAfter(schedule, today)));
    const averageGapDays = Math.round(
      daysBetween(chain[chain.length - 1]!.date, last.date) / (chain.length - 1),
    );
    const merchant = (last.note!.split(':')[0] ?? key).trim() || key;
    out.push({
      amount: last.amount,
      insight: {
        id: `new_subscription:${key}`,
        kind: 'new_subscription',
        priority: 'medium',
        tone: 'info',
        title: `Sepertinya ada langganan: ${merchant}`,
        body: `${formatRupiah(last.amount)} tercatat ${chain.length} kali, sekitar sebulan sekali. Perkiraan berikutnya ${formatShortDate(nextDate)}.`,
        detail: {
          merchant,
          amount: last.amount,
          averageGapDays,
          lastDate: last.date,
          nextDate,
          category: last.categoryId ? (cats.get(last.categoryId) ?? null) : null,
          walletId: last.walletId,
          note: last.note,
          occurrences: chain.map(toRef),
        },
      },
    });
  }
  return out.sort((a, b) => b.amount - a.amount).map((o) => o.insight);
}

function unusualExpenses(
  input: InsightsInput,
  cats: Map<string, InsightCategoryRef>,
): InsightDTO[] {
  const { today } = input;
  const recentFrom = addDays(today, -(UNUSUAL_RECENT_DAYS - 1));
  const byCategory = new Map<string, InsightExpense[]>();
  for (const t of input.expenses) {
    if (!t.categoryId) continue;
    const list = byCategory.get(t.categoryId) ?? [];
    list.push(t);
    byCategory.set(t.categoryId, list);
  }

  const found: { multiple: number; insight: InsightDTO }[] = [];
  for (const [categoryId, list] of byCategory) {
    const category = cats.get(categoryId);
    if (!category) continue;
    for (const t of list) {
      if (t.date < recentFrom || t.date > today || t.recurringRuleId) continue;
      if (t.amount < UNUSUAL_MIN_AMOUNT) continue;
      const sampleFrom = addDays(t.date, -UNUSUAL_SAMPLE_DAYS);
      const samples = list
        .filter((s) => s.id !== t.id && s.date >= sampleFrom && s.date < t.date)
        .map((s) => s.amount);
      if (samples.length < UNUSUAL_MIN_SAMPLES) continue;
      const med = median(samples);
      if (med <= 0 || t.amount < med * UNUSUAL_MULTIPLE) continue;
      const multiple = Math.round((t.amount / med) * 10) / 10;
      const label = t.note
        ? ` untuk "${t.note.length > 40 ? `${t.note.slice(0, 39)}…` : t.note}"`
        : '';
      found.push({
        multiple,
        insight: {
          id: `unusual_expense:${t.id}`,
          kind: 'unusual_expense',
          priority: multiple >= 5 ? 'medium' : 'low',
          tone: 'info',
          title: `Pengeluaran ${category.name} lebih besar dari biasanya`,
          body: `${formatRupiah(t.amount)}${label} pada ${formatShortDate(t.date)}, sekitar ${String(multiple).replace('.', ',')}× pengeluaran ${category.name} yang biasa (${formatRupiah(med)}).`,
          detail: {
            category,
            transaction: toRef(t),
            median: med,
            multiple,
            sampleSize: samples.length,
          },
        },
      });
    }
  }
  return found
    .sort((a, b) => b.multiple - a.multiple)
    .slice(0, 2)
    .map((f) => f.insight);
}

const PRIORITY_RANK: Record<InsightPriority, number> = { high: 0, medium: 1, low: 2 };
const KIND_RANK: Record<InsightKind, number> = {
  budget_pace: 0,
  category_change: 1,
  new_subscription: 2,
  unusual_expense: 3,
};

/**
 * Insight berbasis aturan dari data bulan ini dan sekitar 4 bulan terakhir. Urut prioritas
 * (tinggi dulu), lalu jenis. Semua nominal positif; teks netral dan tidak menghakimi.
 */
export function computeInsights(input: InsightsInput): InsightDTO[] {
  const cats = new Map(input.categories.map((c) => [c.id, c]));
  const expenses = input.expenses.filter((t) => t.amount > 0 && t.date <= input.today);
  const scoped = { ...input, expenses };
  return [
    ...budgetPaces(scoped, cats),
    ...categoryChanges(scoped, cats),
    ...subscriptions(scoped, cats),
    ...unusualExpenses(scoped, cats),
  ].sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      KIND_RANK[a.kind] - KIND_RANK[b.kind],
  );
}
