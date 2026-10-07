import {
  type createTemplateSchema,
  MAX_TEMPLATES,
  type reorderTemplatesSchema,
  type TransactionDTO,
  type TransactionTemplateDTO,
  type updateTemplateSchema,
  type recordTemplateSchema,
} from '@catatku/shared';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { track } from '../../lib/analytics';
import { conflict, notFound, validationError } from '../../lib/errors';
import { toNumber } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { findUsableCategory } from '../categories/category.service';
import { createTransaction } from '../transactions/transaction.service';
import { findActiveWallet } from '../wallets/wallet.service';

const refs = {
  wallet: { select: { id: true, name: true, color: true, archivedAt: true } },
  category: { select: { id: true, name: true, icon: true, color: true, archivedAt: true } },
} as const;

type TemplateRow = Prisma.TransactionTemplateGetPayload<{ include: typeof refs }>;
type Kind = 'INCOME' | 'EXPENSE';

function toDTO(row: TemplateRow): TransactionTemplateDTO {
  const { archivedAt: walletArchived, ...wallet } = row.wallet;
  const { archivedAt: categoryArchived, ...category } = row.category;
  return {
    id: row.id,
    name: row.name,
    type: row.type as Kind,
    amount: row.amount === null ? null : toNumber(row.amount),
    walletId: row.walletId,
    wallet,
    categoryId: row.categoryId,
    category,
    usable: !walletArchived && !categoryArchived,
  };
}

function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((k) => [k, obj[k]])) as Pick<T, K>;
}

async function findOwnedTemplate(userId: string, id: string) {
  const row = await prisma.transactionTemplate.findFirst({ where: { id, userId } });
  if (!row) throw notFound('Template');
  return row;
}

export async function listTemplates(userId: string): Promise<TransactionTemplateDTO[]> {
  const rows = await prisma.transactionTemplate.findMany({
    where: { userId },
    include: refs,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toDTO);
}

export async function createTemplate(
  userId: string,
  data: z.output<typeof createTemplateSchema>,
): Promise<TransactionTemplateDTO> {
  // Tiap query ke DB jarak jauh mahal; validasi dijalankan paralel dan relasi diambil dari sini.
  const [{ _count, _max }, wallet, category] = await Promise.all([
    prisma.transactionTemplate.aggregate({
      where: { userId },
      _count: true,
      _max: { sortOrder: true },
    }),
    findActiveWallet(userId, data.walletId),
    findUsableCategory(userId, data.categoryId, data.type),
  ]);
  if (_count >= MAX_TEMPLATES) {
    throw conflict(`Maksimal ${MAX_TEMPLATES} template. Hapus yang jarang dipakai dulu.`);
  }
  const row = await prisma.transactionTemplate.create({
    data: {
      userId,
      name: data.name,
      type: data.type,
      amount: data.amount === null ? null : BigInt(data.amount),
      walletId: data.walletId,
      categoryId: data.categoryId,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });
  track(userId, 'template_created', { type: data.type, fixedAmount: data.amount !== null });
  return toDTO({
    ...row,
    wallet: pick(wallet, ['id', 'name', 'color', 'archivedAt']),
    category: pick(category, ['id', 'name', 'icon', 'color', 'archivedAt']),
  });
}

export async function updateTemplate(
  userId: string,
  id: string,
  input: z.output<typeof updateTemplateSchema>,
): Promise<TransactionTemplateDTO> {
  const row = await findOwnedTemplate(userId, id);
  const type = input.type ?? (row.type as Kind);
  await Promise.all([
    input.walletId && input.walletId !== row.walletId
      ? findActiveWallet(userId, input.walletId)
      : null,
    input.categoryId || input.type
      ? findUsableCategory(userId, input.categoryId ?? row.categoryId, type)
      : null,
  ]);
  const updated = await prisma.transactionTemplate.update({
    where: { id },
    data: {
      type,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.amount !== undefined && {
        amount: input.amount === null ? null : BigInt(input.amount),
      }),
      ...(input.walletId !== undefined && { walletId: input.walletId }),
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
    },
    include: refs,
  });
  return toDTO(updated);
}

export async function deleteTemplate(userId: string, id: string): Promise<void> {
  await findOwnedTemplate(userId, id);
  await prisma.transactionTemplate.delete({ where: { id } });
}

/** Harus berisi tepat seluruh template milik pengguna agar urutan tidak pernah setengah jadi. */
export async function reorderTemplates(
  userId: string,
  { ids }: z.output<typeof reorderTemplatesSchema>,
): Promise<TransactionTemplateDTO[]> {
  const owned = await prisma.transactionTemplate.findMany({
    where: { userId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((t) => t.id));
  if (ids.some((id) => !ownedIds.has(id))) throw notFound('Template');
  if (new Set(ids).size !== ids.length || ids.length !== ownedIds.size) {
    throw validationError('Urutan harus memuat semua template tepat sekali');
  }
  await prisma.$transaction(
    ids.map((id, sortOrder) =>
      prisma.transactionTemplate.update({ where: { id }, data: { sortOrder } }),
    ),
  );
  return listTemplates(userId);
}

/** Satu tap "Cepat catat": transaksi dibuat dengan nama template sebagai catatan. */
export async function recordFromTemplate(
  userId: string,
  id: string,
  input: z.output<typeof recordTemplateSchema>,
): Promise<TransactionDTO> {
  const row = await findOwnedTemplate(userId, id);
  const amount = input.amount ?? (row.amount === null ? null : toNumber(row.amount));
  if (amount === null) {
    throw validationError('Template ini tanpa nominal. Isi nominalnya dulu.', {
      amount: 'Isi nominal',
    });
  }
  const tx = await createTransaction(userId, {
    type: row.type as Kind,
    amount,
    walletId: row.walletId,
    categoryId: row.categoryId,
    date: input.date,
    note: row.name,
  });
  track(userId, 'template_used', { type: row.type, amountChanged: input.amount !== undefined });
  return tx;
}
