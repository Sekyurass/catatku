import { randomUUID } from 'node:crypto';
import type {
  createTransactionSchema,
  createTransferSchema,
  ListTransactionsQuery,
  TransactionDTO,
  TransactionPage,
  TransactionType,
  TransferDTO,
} from '@catatku/shared';
import {
  DATE_REGEX,
  FEATURE_FLAGS,
  type TagRefDTO,
  updateTransactionSchema,
  updateTransferSchema,
} from '@catatku/shared';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { track } from '../../lib/analytics';
import { conflict, notFound, validationError } from '../../lib/errors';
import { fromDbDate, toDbDate, toNumber } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { parse } from '../../lib/validate';
import { findUsableCategory } from '../categories/category.service';
import { learnCategoryInBackground } from '../categories/categoryMap.service';
import { isFeatureEnabled } from '../features/featureFlag.service';
import { resolveTags } from '../tags/tag.service';
import { findActiveWallet } from '../wallets/wallet.service';

const walletSelect = { select: { id: true, name: true, color: true } } as const;
const categorySelect = { select: { id: true, name: true, icon: true, color: true } } as const;
const include = { wallet: walletSelect, category: categorySelect } as const;

type Row = Prisma.TransactionGetPayload<{ include: typeof include }>;
type WalletRef = TransactionDTO['wallet'];

const signed = (type: 'INCOME' | 'EXPENSE', amount: number) =>
  BigInt(type === 'INCOME' ? amount : -amount);

interface Extras {
  counterpart?: WalletRef | null;
  tags?: TagRefDTO[];
  attachmentCount?: number;
}

function toDTO(
  row: Row,
  { counterpart = null, tags = [], attachmentCount = 0 }: Extras = {},
): TransactionDTO {
  return {
    id: row.id,
    type: row.type,
    amount: toNumber(row.amount),
    date: fromDbDate(row.date),
    note: row.note,
    walletId: row.walletId,
    wallet: row.wallet,
    categoryId: row.categoryId,
    category: row.category,
    transferGroupId: row.transferGroupId,
    counterpartWallet: counterpart,
    recurringRuleId: row.recurringRuleId,
    debtId: row.debtId,
    tags,
    attachmentCount,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Lengkapi baris dengan dompet seberang (transfer), tag, dan jumlah lampiran. Ketiganya diambil
 * paralel, masing-masing satu kueri untuk semua baris.
 */
async function toDTOs(userId: string, rows: Row[]): Promise<TransactionDTO[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const groupIds = [
    ...new Set(rows.flatMap((r) => (r.transferGroupId ? [r.transferGroupId] : []))),
  ];
  const [legs, tagRows, counts] = await Promise.all([
    groupIds.length
      ? prisma.transaction.findMany({
          where: { userId, transferGroupId: { in: groupIds } },
          select: { id: true, transferGroupId: true, wallet: walletSelect },
        })
      : [],
    prisma.$queryRaw<{ transactionId: string; id: string; name: string }[]>`
      SELECT tt."transactionId", tg.id, tg.name
      FROM "TransactionTag" tt JOIN "Tag" tg ON tg.id = tt."tagId"
      WHERE tt."transactionId" IN (${Prisma.join(ids)})
      ORDER BY tg.key`,
    prisma.attachment.groupBy({
      by: ['transactionId'],
      where: { transactionId: { in: ids } },
      _count: { _all: true },
    }),
  ]);
  return rows.map((row) => {
    const other = row.transferGroupId
      ? legs.find((l) => l.transferGroupId === row.transferGroupId && l.id !== row.id)
      : undefined;
    return toDTO(row, {
      counterpart: other?.wallet ?? null,
      tags: tagRows
        .filter((t) => t.transactionId === row.id)
        .map((t) => ({ id: t.id, name: t.name })),
      attachmentCount: counts.find((c) => c.transactionId === row.id)?._count._all ?? 0,
    });
  });
}

/** Tag dari input dipakai hanya bila fitur tag aktif untuk pengguna ini. */
async function tagsFromInput(userId: string, names: string[] | undefined) {
  if (names === undefined) return undefined;
  if (!(await isFeatureEnabled(FEATURE_FLAGS.TAGS, userId))) return undefined;
  return resolveTags(userId, names);
}

/** Transaksi utang/piutang mengikuti catatan di halaman Utang supaya sisa tagihan tetap cocok. */
function assertNotDebt<T extends { type: TransactionType }>(
  row: T,
): asserts row is T & { type: Exclude<TransactionType, 'DEBT'> } {
  if (row.type === 'DEBT') {
    throw conflict('Transaksi utang/piutang diubah atau dihapus dari halaman Utang');
  }
}

async function findActiveRow(userId: string, id: string): Promise<Row> {
  const row = await prisma.transaction.findFirst({
    where: { id, userId, deletedAt: null },
    include,
  });
  if (!row) throw notFound('Transaksi');
  return row;
}

export async function getTransaction(userId: string, id: string): Promise<TransactionDTO> {
  const [dto] = await toDTOs(userId, [await findActiveRow(userId, id)]);
  return dto!;
}

// ---------- List + cursor ----------

interface Cursor {
  d: string;
  c: string;
  i: string;
}

const encodeCursor = (row: Row) =>
  Buffer.from(
    JSON.stringify({ d: fromDbDate(row.date), c: row.createdAt.toISOString(), i: row.id }),
  ).toString('base64url');

function decodeCursor(raw: string): Cursor {
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (
      typeof c.d === 'string' &&
      DATE_REGEX.test(c.d) &&
      typeof c.c === 'string' &&
      !Number.isNaN(Date.parse(c.c)) &&
      typeof c.i === 'string'
    ) {
      return c as Cursor;
    }
  } catch {
    // jatuh ke error di bawah
  }
  throw validationError('Cursor tidak valid', { cursor: 'Cursor tidak valid' });
}

/** Filter bersama untuk daftar transaksi dan ekspor CSV. */
export function buildTransactionFilter(
  userId: string,
  q: Omit<ListTransactionsQuery, 'cursor' | 'limit'>,
): Prisma.TransactionWhereInput {
  return {
    userId,
    deletedAt: null,
    ...(q.walletId && { walletId: q.walletId }),
    ...(q.categoryId && { categoryId: q.categoryId }),
    ...(q.type && { type: q.type }),
    ...(q.tagId && { tags: { some: { tagId: q.tagId } } }),
    ...((q.from || q.to) && {
      date: { ...(q.from && { gte: toDbDate(q.from) }), ...(q.to && { lte: toDbDate(q.to) }) },
    }),
    ...(q.q && {
      OR: [
        { note: { contains: q.q, mode: 'insensitive' } },
        { category: { is: { name: { contains: q.q, mode: 'insensitive' } } } },
        { tags: { some: { tag: { name: { contains: q.q, mode: 'insensitive' } } } } },
      ],
    }),
  };
}

export const transactionOrder: Prisma.TransactionOrderByWithRelationInput[] = [
  { date: 'desc' },
  { createdAt: 'desc' },
  { id: 'desc' },
];

export async function listTransactions(
  userId: string,
  query: ListTransactionsQuery,
): Promise<TransactionPage> {
  const where = buildTransactionFilter(userId, query);
  if (query.cursor) {
    const c = decodeCursor(query.cursor);
    const d = toDbDate(c.d);
    const created = new Date(c.c);
    where.AND = [
      {
        OR: [
          { date: { lt: d } },
          { date: d, createdAt: { lt: created } },
          { date: d, createdAt: created, id: { lt: c.i } },
        ],
      },
    ];
  }
  const rows = await prisma.transaction.findMany({
    where,
    include,
    orderBy: transactionOrder,
    take: query.limit + 1,
  });
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  return {
    items: await toDTOs(userId, page),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]!) : null,
  };
}

/** N transaksi terbaru; transfer cukup diwakili sisi keluarnya. */
export async function recentTransactions(userId: string, limit: number): Promise<TransactionDTO[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId, deletedAt: null, NOT: { type: 'TRANSFER', amount: { gt: 0 } } },
    include,
    orderBy: transactionOrder,
    take: limit,
  });
  return toDTOs(userId, rows);
}

// ---------- Pemasukan / pengeluaran ----------

export async function createTransaction(
  userId: string,
  data: z.output<typeof createTransactionSchema>,
): Promise<TransactionDTO> {
  // Tiap kueri = satu perjalanan ke database jarak jauh: validasi berjalan paralel, dan dompet/kategori
  // yang sudah diambil dipakai ulang alih-alih `include` (yang memakai BEGIN + 3 SELECT + COMMIT).
  const [wallet, category, tags] = await allInOrder([
    findActiveWallet(userId, data.walletId),
    findUsableCategory(userId, data.categoryId, data.type),
    tagsFromInput(userId, data.tags),
  ]);
  const row = await prisma.transaction.create({
    data: {
      userId,
      walletId: data.walletId,
      categoryId: data.categoryId,
      type: data.type,
      amount: signed(data.type, data.amount),
      date: toDbDate(data.date),
      note: data.note,
      ...(tags && tags.length > 0 && { tags: { create: tags.map((t) => ({ tagId: t.id })) } }),
    },
  });
  track(userId, 'transaction_created', { type: data.type, tags: tags?.length ?? 0 });
  learnCategoryInBackground(userId, data.note, data.categoryId, data.type);
  return toDTO(
    {
      ...row,
      wallet: { id: wallet.id, name: wallet.name, color: wallet.color },
      category: {
        id: category.id,
        name: category.name,
        icon: category.icon,
        color: category.color,
      },
    },
    { tags: tags ?? [] },
  );
}

/** Seperti Promise.all, tapi bila beberapa gagal yang dilempar selalu yang pertama di daftar. */
async function allInOrder<T extends readonly unknown[]>(
  promises: readonly [...{ [K in keyof T]: Promise<T[K]> }],
): Promise<T> {
  const results = await Promise.allSettled(promises);
  for (const r of results) if (r.status === 'rejected') throw r.reason;
  return results.map((r) => (r as PromiseFulfilledResult<unknown>).value) as unknown as T;
}

/** PATCH satu endpoint: skema mengikuti jenis transaksi yang diedit. */
export async function updateTransaction(
  userId: string,
  id: string,
  body: unknown,
): Promise<TransactionDTO> {
  const existing = await findActiveRow(userId, id);
  assertNotDebt(existing);
  if (existing.type === 'TRANSFER') {
    await updateTransfer(userId, existing, parse(updateTransferSchema, body));
    return getTransaction(userId, id);
  }

  const input = parse(updateTransactionSchema, body);
  const type = input.type ?? existing.type;
  const amount = input.amount ?? Math.abs(toNumber(existing.amount));
  const categoryId = input.categoryId ?? existing.categoryId;

  if (input.walletId && input.walletId !== existing.walletId) {
    await findActiveWallet(userId, input.walletId);
  }
  if (!categoryId) {
    throw validationError('Kategori wajib dipilih', { categoryId: 'Kategori wajib dipilih' });
  }
  if (input.categoryId || input.type) await findUsableCategory(userId, categoryId, type);
  const tags = await tagsFromInput(userId, input.tags);

  const row = await prisma.transaction.update({
    where: { id },
    data: {
      type,
      amount: signed(type, amount),
      categoryId,
      ...(input.walletId && { walletId: input.walletId }),
      ...(input.date && { date: toDbDate(input.date) }),
      ...(input.note !== undefined && { note: input.note }),
      ...(tags && {
        tags: { deleteMany: {}, create: tags.map((t) => ({ tagId: t.id })) },
      }),
    },
    include,
  });
  if (input.categoryId || input.note !== undefined || input.type) {
    learnCategoryInBackground(userId, row.note, categoryId, type);
  }
  const [dto] = await toDTOs(userId, [row]);
  return dto!;
}

// ---------- Transfer ----------

async function getTransferLegs(userId: string, transferGroupId: string) {
  const legs = await prisma.transaction.findMany({
    where: { userId, transferGroupId },
    include,
  });
  const out = legs.find((l) => l.amount < 0n);
  const inn = legs.find((l) => l.amount > 0n);
  if (!out || !inn) throw notFound('Transfer');
  return { out, in: inn };
}

export async function createTransfer(
  userId: string,
  data: z.output<typeof createTransferSchema>,
): Promise<TransferDTO> {
  await findActiveWallet(userId, data.fromWalletId, 'fromWalletId');
  await findActiveWallet(userId, data.toWalletId, 'toWalletId');
  const transferGroupId = randomUUID();
  const base = {
    userId,
    type: 'TRANSFER' as const,
    date: toDbDate(data.date),
    note: data.note,
    transferGroupId,
  };
  await prisma.$transaction([
    prisma.transaction.create({
      data: { ...base, walletId: data.fromWalletId, amount: BigInt(-data.amount) },
    }),
    prisma.transaction.create({
      data: { ...base, walletId: data.toWalletId, amount: BigInt(data.amount) },
    }),
  ]);
  track(userId, 'transaction_created', { type: 'TRANSFER' });
  const legs = await getTransferLegs(userId, transferGroupId);
  return {
    transferGroupId,
    out: toDTO(legs.out, { counterpart: legs.in.wallet }),
    in: toDTO(legs.in, { counterpart: legs.out.wallet }),
  };
}

async function updateTransfer(
  userId: string,
  leg: Row,
  input: z.output<typeof updateTransferSchema>,
): Promise<void> {
  const legs = await getTransferLegs(userId, leg.transferGroupId!);
  const fromWalletId = input.fromWalletId ?? legs.out.walletId;
  const toWalletId = input.toWalletId ?? legs.in.walletId;
  if (fromWalletId === toWalletId) {
    throw validationError('Dompet asal dan tujuan harus berbeda', {
      toWalletId: 'Dompet asal dan tujuan harus berbeda',
    });
  }
  if (fromWalletId !== legs.out.walletId)
    await findActiveWallet(userId, fromWalletId, 'fromWalletId');
  if (toWalletId !== legs.in.walletId) await findActiveWallet(userId, toWalletId, 'toWalletId');

  const amount = input.amount ?? toNumber(legs.in.amount);
  const shared = {
    ...(input.date && { date: toDbDate(input.date) }),
    ...(input.note !== undefined && { note: input.note }),
  };
  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: legs.out.id },
      data: { ...shared, walletId: fromWalletId, amount: BigInt(-amount) },
    }),
    prisma.transaction.update({
      where: { id: legs.in.id },
      data: { ...shared, walletId: toWalletId, amount: BigInt(amount) },
    }),
  ]);
}

// ---------- Hapus / urungkan ----------

/** Soft delete; untuk transfer kedua sisinya ikut terhapus. */
export async function deleteTransaction(userId: string, id: string): Promise<void> {
  const row = await findActiveRow(userId, id);
  assertNotDebt(row);
  const where = row.transferGroupId
    ? { userId, transferGroupId: row.transferGroupId }
    : { userId, id };
  await prisma.transaction.updateMany({ where, data: { deletedAt: new Date() } });
}

export async function restoreTransaction(userId: string, id: string): Promise<TransactionDTO> {
  const row = await prisma.transaction.findFirst({ where: { id, userId } });
  if (!row) throw notFound('Transaksi');
  const where = row.transferGroupId
    ? { userId, transferGroupId: row.transferGroupId }
    : { userId, id };
  await prisma.transaction.updateMany({ where, data: { deletedAt: null } });
  return getTransaction(userId, id);
}
