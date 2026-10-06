import { randomUUID } from 'node:crypto';
import type {
  createTransactionSchema,
  createTransferSchema,
  ListTransactionsQuery,
  TransactionDTO,
  TransactionPage,
  TransferDTO,
} from '@catatku/shared';
import { DATE_REGEX, updateTransactionSchema, updateTransferSchema } from '@catatku/shared';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { notFound, validationError } from '../../lib/errors';
import { fromDbDate, toDbDate, toNumber } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { parse } from '../../lib/validate';
import { findUsableCategory } from '../categories/category.service';
import { findActiveWallet } from '../wallets/wallet.service';

const walletSelect = { select: { id: true, name: true, color: true } } as const;
const categorySelect = { select: { id: true, name: true, icon: true, color: true } } as const;
const include = { wallet: walletSelect, category: categorySelect } as const;

type Row = Prisma.TransactionGetPayload<{ include: typeof include }>;
type WalletRef = TransactionDTO['wallet'];

const signed = (type: 'INCOME' | 'EXPENSE', amount: number) =>
  BigInt(type === 'INCOME' ? amount : -amount);

function toDTO(row: Row, counterpart: WalletRef | null = null): TransactionDTO {
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
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Lengkapi baris transfer dengan dompet di sisi seberangnya (satu query untuk semua baris). */
async function toDTOs(userId: string, rows: Row[]): Promise<TransactionDTO[]> {
  const groupIds = [
    ...new Set(rows.flatMap((r) => (r.transferGroupId ? [r.transferGroupId] : []))),
  ];
  const legs = groupIds.length
    ? await prisma.transaction.findMany({
        where: { userId, transferGroupId: { in: groupIds } },
        select: { id: true, transferGroupId: true, wallet: walletSelect },
      })
    : [];
  return rows.map((row) => {
    const other = row.transferGroupId
      ? legs.find((l) => l.transferGroupId === row.transferGroupId && l.id !== row.id)
      : undefined;
    return toDTO(row, other?.wallet ?? null);
  });
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
    ...((q.from || q.to) && {
      date: { ...(q.from && { gte: toDbDate(q.from) }), ...(q.to && { lte: toDbDate(q.to) }) },
    }),
    ...(q.q && {
      OR: [
        { note: { contains: q.q, mode: 'insensitive' } },
        { category: { is: { name: { contains: q.q, mode: 'insensitive' } } } },
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

// ---------- Pemasukan / pengeluaran ----------

export async function createTransaction(
  userId: string,
  data: z.output<typeof createTransactionSchema>,
): Promise<TransactionDTO> {
  await findActiveWallet(userId, data.walletId);
  await findUsableCategory(userId, data.categoryId, data.type);
  const row = await prisma.transaction.create({
    data: {
      userId,
      walletId: data.walletId,
      categoryId: data.categoryId,
      type: data.type,
      amount: signed(data.type, data.amount),
      date: toDbDate(data.date),
      note: data.note,
    },
    include,
  });
  return toDTO(row);
}

/** PATCH satu endpoint: skema mengikuti jenis transaksi yang diedit. */
export async function updateTransaction(
  userId: string,
  id: string,
  body: unknown,
): Promise<TransactionDTO> {
  const existing = await findActiveRow(userId, id);
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

  const row = await prisma.transaction.update({
    where: { id },
    data: {
      type,
      amount: signed(type, amount),
      categoryId,
      ...(input.walletId && { walletId: input.walletId }),
      ...(input.date && { date: toDbDate(input.date) }),
      ...(input.note !== undefined && { note: input.note }),
    },
    include,
  });
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
  const legs = await getTransferLegs(userId, transferGroupId);
  return {
    transferGroupId,
    out: toDTO(legs.out, legs.in.wallet),
    in: toDTO(legs.in, legs.out.wallet),
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
