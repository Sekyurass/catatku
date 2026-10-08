import { randomUUID } from 'node:crypto';
import {
  type ConfirmOccurrenceInput,
  type createRecurringSchema,
  FEATURE_FLAGS,
  firstIndexOnOrAfter,
  occurrenceDate,
  type PendingOccurrenceDTO,
  type RecurrenceSchedule,
  type RecurringRuleDTO,
  TIME_ZONES,
  type TimeZoneId,
  toDateString,
  type updateRecurringSchema,
} from '@catatku/shared';
import type { Prisma, RecurringRule } from '@prisma/client';
import type { z } from 'zod';
import { track } from '../../lib/analytics';
import { conflict, notFound, validationError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { fromDbDate, toDbDate, toNumber } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { findUsableCategory } from '../categories/category.service';
import { isFeatureEnabled } from '../features/featureFlag.service';
import { notify } from '../notifications/notification.service';
import { findActiveWallet } from '../wallets/wallet.service';

/** Batas kejadian yang disusul per aturan per putaran; sisanya diproses putaran berikutnya. */
const MAX_CATCH_UP = 62;

const refs = {
  wallet: { select: { id: true, name: true, color: true } },
  category: { select: { id: true, name: true, icon: true, color: true } },
} as const;

type RuleRow = Prisma.RecurringRuleGetPayload<{ include: typeof refs }>;
type Kind = 'INCOME' | 'EXPENSE';

const signed = (type: Kind, amount: bigint) => (type === 'INCOME' ? amount : -amount);

function scheduleOf(rule: Pick<RecurringRule, 'startDate' | 'frequency' | 'interval'>) {
  return {
    startDate: fromDbDate(rule.startDate),
    frequency: rule.frequency,
    interval: rule.interval,
  } satisfies RecurrenceSchedule;
}

/** Tanggal kejadian ke-`index`, atau null bila sudah melewati tanggal berakhir. */
function runDateAt(schedule: RecurrenceSchedule, index: number, endDate: Date | null) {
  const date = occurrenceDate(schedule, index);
  return endDate && date > fromDbDate(endDate) ? null : date;
}

function toDTO(rule: RuleRow): RecurringRuleDTO {
  return {
    id: rule.id,
    type: rule.type as Kind,
    amount: toNumber(rule.amount),
    walletId: rule.walletId,
    wallet: rule.wallet,
    categoryId: rule.categoryId,
    category: rule.category,
    note: rule.note,
    frequency: rule.frequency,
    interval: rule.interval,
    startDate: fromDbDate(rule.startDate),
    endDate: rule.endDate ? fromDbDate(rule.endDate) : null,
    autoPost: rule.autoPost,
    paused: rule.pausedAt !== null,
    nextRunAt: rule.nextRunAt ? fromDbDate(rule.nextRunAt) : null,
    createdAt: rule.createdAt.toISOString(),
  };
}

async function findOwnedRule(userId: string, id: string): Promise<RuleRow> {
  const rule = await prisma.recurringRule.findFirst({ where: { id, userId }, include: refs });
  if (!rule) throw notFound('Transaksi berulang');
  return rule;
}

export async function listRules(userId: string): Promise<RecurringRuleDTO[]> {
  const rules = await prisma.recurringRule.findMany({
    where: { userId },
    include: refs,
    orderBy: [
      { pausedAt: { sort: 'asc', nulls: 'first' } },
      { nextRunAt: 'asc' },
      { createdAt: 'asc' },
    ],
  });
  return rules.map(toDTO);
}

export async function createRule(
  userId: string,
  data: z.output<typeof createRecurringSchema>,
  today = toDateString(),
): Promise<RecurringRuleDTO> {
  await findActiveWallet(userId, data.walletId);
  await findUsableCategory(userId, data.categoryId, data.type);
  const schedule: RecurrenceSchedule = data;
  // Tanggal mulai di masa lalu hanya menjadi patokan jadwal; kejadian lampau tidak dibuat mundur.
  const nextIndex = firstIndexOnOrAfter(schedule, today);
  const endDate = data.endDate ? toDbDate(data.endDate) : null;
  const nextRunAt = runDateAt(schedule, nextIndex, endDate);
  const rule = await prisma.recurringRule.create({
    data: {
      userId,
      walletId: data.walletId,
      categoryId: data.categoryId,
      type: data.type,
      amount: BigInt(data.amount),
      note: data.note,
      frequency: data.frequency,
      interval: data.interval,
      startDate: toDbDate(data.startDate),
      endDate,
      autoPost: data.autoPost,
      nextIndex,
      nextRunAt: nextRunAt ? toDbDate(nextRunAt) : null,
    },
  });
  track(userId, 'recurring_rule_created', {
    frequency: data.frequency,
    autoPost: data.autoPost,
  });
  await processRule(rule, today);
  return toDTO(await findOwnedRule(userId, rule.id));
}

/** Perubahan hanya berlaku untuk kejadian berikutnya; transaksi yang sudah tercatat tidak diubah. */
export async function updateRule(
  userId: string,
  id: string,
  input: z.output<typeof updateRecurringSchema>,
  today = toDateString(),
): Promise<RecurringRuleDTO> {
  const rule = await findOwnedRule(userId, id);
  const type = input.type ?? (rule.type as Kind);
  const walletId = input.walletId ?? rule.walletId;
  const categoryId = input.categoryId ?? rule.categoryId;
  if (input.walletId && input.walletId !== rule.walletId) await findActiveWallet(userId, walletId);
  if (input.categoryId || input.type) await findUsableCategory(userId, categoryId, type);

  const schedule: RecurrenceSchedule = {
    startDate: input.startDate ?? fromDbDate(rule.startDate),
    frequency: input.frequency ?? rule.frequency,
    interval: input.interval ?? rule.interval,
  };
  let endDate = rule.endDate;
  if (input.endDate !== undefined) endDate = input.endDate ? toDbDate(input.endDate) : null;
  if (endDate && fromDbDate(endDate) < schedule.startDate) {
    throw validationError('Tanggal berakhir tidak boleh sebelum tanggal mulai', {
      endDate: 'Tanggal berakhir tidak boleh sebelum tanggal mulai',
    });
  }
  const scheduleChanged =
    schedule.startDate !== fromDbDate(rule.startDate) ||
    schedule.frequency !== rule.frequency ||
    schedule.interval !== rule.interval;
  const resumed = input.paused === false && rule.pausedAt !== null;
  // Kejadian yang terlewat selama dijeda atau sebelum jadwal diubah tidak dibuat mundur.
  let nextIndex = rule.nextIndex;
  if (scheduleChanged) nextIndex = firstIndexOnOrAfter(schedule, today);
  else if (resumed || input.endDate !== undefined) {
    nextIndex = Math.max(rule.nextIndex, firstIndexOnOrAfter(schedule, today));
  }
  const nextRunAt = runDateAt(schedule, nextIndex, endDate);

  const updated = await prisma.recurringRule.update({
    where: { id },
    data: {
      type,
      walletId,
      categoryId,
      ...(input.amount !== undefined && { amount: BigInt(input.amount) }),
      ...(input.note !== undefined && { note: input.note }),
      ...(input.autoPost !== undefined && { autoPost: input.autoPost }),
      frequency: schedule.frequency,
      interval: schedule.interval,
      startDate: toDbDate(schedule.startDate),
      endDate,
      nextIndex,
      nextRunAt: nextRunAt ? toDbDate(nextRunAt) : null,
      ...(input.paused !== undefined && {
        pausedAt: input.paused ? (rule.pausedAt ?? new Date()) : null,
      }),
    },
  });
  await processRule(updated, today);
  return toDTO(await findOwnedRule(userId, id));
}

/** Transaksi yang sudah dibuat aturan ini tetap ada (tanpa tanda "Berulang"). */
export async function deleteRule(userId: string, id: string): Promise<void> {
  await findOwnedRule(userId, id);
  await prisma.recurringRule.delete({ where: { id } });
}

// ---------- Scheduler ----------

/**
 * Buat semua kejadian yang jatuh tempo sampai `today` untuk satu aturan. Aman dipanggil
 * bersamaan: aturan dimajukan dengan kunci optimistis (nextIndex lama) dan (aturan, tanggal)
 * unik, jadi kejadian yang sama tidak pernah dibuat dua kali.
 */
export async function processRule(rule: RecurringRule, today = toDateString()): Promise<number> {
  if (rule.pausedAt || !rule.nextRunAt || fromDbDate(rule.nextRunAt) > today) return 0;
  if (!(await isFeatureEnabled(FEATURE_FLAGS.RECURRING_TRANSACTIONS, rule.userId))) return 0;

  const [wallet, category] = await Promise.all([
    prisma.wallet.findUnique({ where: { id: rule.walletId }, select: { archivedAt: true } }),
    prisma.category.findUnique({ where: { id: rule.categoryId }, select: { archivedAt: true } }),
  ]);
  if (wallet?.archivedAt || category?.archivedAt) {
    // Dompet/kategori diarsipkan: berhenti mencatat sampai pengguna memperbarui aturannya.
    await prisma.recurringRule.updateMany({
      where: { id: rule.id, pausedAt: null },
      data: { pausedAt: new Date() },
    });
    return 0;
  }

  const schedule = scheduleOf(rule);
  const dates: string[] = [];
  let index = rule.nextIndex;
  for (; dates.length < MAX_CATCH_UP; index++) {
    const date = runDateAt(schedule, index, rule.endDate);
    if (!date || date > today) break;
    dates.push(date);
  }
  const nextRunAt = runDateAt(schedule, index, rule.endDate);

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.recurringRule.updateMany({
      where: { id: rule.id, nextIndex: rule.nextIndex, pausedAt: null },
      data: { nextIndex: index, nextRunAt: nextRunAt ? toDbDate(nextRunAt) : null },
    });
    if (count === 0) return 0;

    const existing = await tx.recurringOccurrence.findMany({
      where: { ruleId: rule.id, date: { in: dates.map(toDbDate) } },
      select: { date: true },
    });
    const taken = new Set(existing.map((o) => fromDbDate(o.date)));
    const fresh = dates.filter((d) => !taken.has(d));
    if (fresh.length === 0) return 0;

    const kind = rule.type as Kind;
    const txIds = fresh.map(() => (rule.autoPost ? randomUUID() : null));
    if (rule.autoPost) {
      await tx.transaction.createMany({
        data: fresh.map((date, i) => ({
          id: txIds[i]!,
          userId: rule.userId,
          walletId: rule.walletId,
          categoryId: rule.categoryId,
          type: kind,
          amount: signed(kind, rule.amount),
          date: toDbDate(date),
          note: rule.note,
          recurringRuleId: rule.id,
        })),
      });
    }
    await tx.recurringOccurrence.createMany({
      data: fresh.map((date, i) => ({
        ruleId: rule.id,
        userId: rule.userId,
        date: toDbDate(date),
        status: rule.autoPost ? 'POSTED' : 'PENDING',
        transactionId: txIds[i],
      })),
    });
    return fresh.length;
  });
}

/**
 * Kabari pengguna setelah scheduler memproses aturannya. Yang perlu tindakan (konfirmasi) dikirim
 * sebagai push; yang tercatat otomatis cukup masuk lonceng agar aturan harian tidak berisik.
 */
async function notifyProcessed(rule: RecurringRule, count: number) {
  const full = await prisma.recurringRule.findUnique({ where: { id: rule.id }, include: refs });
  if (!full || !rule.nextRunAt) return;
  const name = full.note || full.category.name;
  const dedupeKey = `recurring:${rule.id}:${fromDbDate(rule.nextRunAt)}`;
  if (rule.autoPost) {
    await notify(rule.userId, {
      type: 'RECURRING_POSTED',
      title: `${name} tercatat otomatis`,
      body:
        count > 1
          ? `${count} transaksi dari jadwal berulang masuk ke ${full.wallet.name}.`
          : `Transaksi dari jadwal berulang masuk ke ${full.wallet.name}.`,
      link: '/transaksi',
      dedupeKey,
      push: false,
    });
  } else {
    await notify(rule.userId, {
      type: 'RECURRING_PENDING',
      title: `${name} menunggu konfirmasi`,
      body: 'Catat dengan nominal yang sesuai atau lewati dari Beranda.',
      link: '/',
      dedupeKey,
    });
  }
}

/**
 * Satu putaran scheduler untuk semua pengguna. Dipanggil saat server menyala dan tiap jam.
 * "Hari ini" mengikuti zona tiap pengguna, kecuali `today` diberikan (berlaku untuk semua).
 */
export async function runDueRules(today?: string, now: Date = new Date()): Promise<number> {
  let created = 0;
  for (const zone of TIME_ZONES) {
    created += await runDueRulesInZone(today ?? toDateString(now, zone), zone);
  }
  return created;
}

async function runDueRulesInZone(today: string, zone: TimeZoneId): Promise<number> {
  let created = 0;
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.recurringRule.findMany({
      where: { pausedAt: null, nextRunAt: { lte: toDbDate(today) }, user: { timeZone: zone } },
      orderBy: { id: 'asc' },
      take: 100,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    for (const rule of batch) {
      try {
        const count = await processRule(rule, today);
        if (count > 0) {
          created += count;
          await notifyProcessed(rule, count).catch((err: unknown) =>
            logger.warn({ err, ruleId: rule.id }, 'Gagal membuat notifikasi transaksi berulang'),
          );
        }
      } catch (err) {
        logger.error({ err, ruleId: rule.id }, 'Gagal memproses transaksi berulang');
      }
    }
    if (batch.length < 100) break;
    cursor = batch[batch.length - 1]!.id;
  }
  return created;
}

// ---------- Konfirmasi ----------

export async function listPending(userId: string): Promise<PendingOccurrenceDTO[]> {
  const rows = await prisma.recurringOccurrence.findMany({
    where: { userId, status: 'PENDING' },
    include: { rule: { include: refs } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    take: 50,
  });
  return rows.map((o) => ({
    id: o.id,
    ruleId: o.ruleId,
    date: fromDbDate(o.date),
    type: o.rule.type as Kind,
    amount: toNumber(o.rule.amount),
    note: o.rule.note,
    wallet: o.rule.wallet,
    category: o.rule.category,
  }));
}

async function findPending(userId: string, id: string) {
  const occurrence = await prisma.recurringOccurrence.findFirst({
    where: { id, userId },
    include: { rule: true },
  });
  if (!occurrence) throw notFound('Kejadian');
  if (occurrence.status !== 'PENDING') throw conflict('Kejadian ini sudah diproses');
  return occurrence;
}

export async function confirmOccurrence(
  userId: string,
  id: string,
  input: ConfirmOccurrenceInput,
): Promise<{ transactionId: string }> {
  const { rule, date } = await findPending(userId, id);
  const kind = rule.type as Kind;
  await findActiveWallet(userId, rule.walletId);
  await findUsableCategory(userId, rule.categoryId, kind);
  const amount = input.amount !== undefined ? BigInt(input.amount) : rule.amount;
  const transactionId = randomUUID();

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.recurringOccurrence.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'POSTED', transactionId },
    });
    if (count === 0) throw conflict('Kejadian ini sudah diproses');
    await tx.transaction.create({
      data: {
        id: transactionId,
        userId,
        walletId: rule.walletId,
        categoryId: rule.categoryId,
        type: kind,
        amount: signed(kind, amount),
        date,
        note: rule.note,
        recurringRuleId: rule.id,
      },
    });
  });
  track(userId, 'transaction_created', { type: kind, source: 'recurring' });
  return { transactionId };
}

export async function skipOccurrence(userId: string, id: string): Promise<void> {
  await findPending(userId, id);
  await prisma.recurringOccurrence.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'SKIPPED' },
  });
}
