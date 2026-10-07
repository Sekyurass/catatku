import type { CategoryType, TagBreakdownDTO, TagDTO, TagRefDTO } from '@catatku/shared';
import { currentMonth, monthRange, tagKey } from '@catatku/shared';
import { conflict, notFound } from '../../lib/errors';
import { toDbDate, toNumber } from '../../lib/money';
import { prisma } from '../../lib/prisma';

/**
 * Nama tag -> tag milik pengguna, dibuat bila belum ada. Dua kueri berapa pun jumlah tagnya.
 * Diurutkan menurut nama, sama seperti saat transaksi dibaca ulang.
 */
export async function resolveTags(userId: string, names: string[]): Promise<TagRefDTO[]> {
  if (names.length === 0) return [];
  const keys = names.map(tagKey);
  await prisma.tag.createMany({
    data: names.map((name, i) => ({ userId, name, key: keys[i]! })),
    skipDuplicates: true,
  });
  return prisma.tag.findMany({
    where: { userId, key: { in: keys } },
    select: { id: true, name: true },
    orderBy: { key: 'asc' },
  });
}

export async function listTags(userId: string): Promise<TagDTO[]> {
  const rows = await prisma.tag.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      _count: { select: { transactions: { where: { transaction: { deletedAt: null } } } } },
    },
    orderBy: { key: 'asc' },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, count: r._count.transactions }));
}

async function findOwnedTag(userId: string, id: string) {
  const tag = await prisma.tag.findFirst({ where: { id, userId } });
  if (!tag) throw notFound('Tag');
  return tag;
}

export async function renameTag(userId: string, id: string, name: string): Promise<TagRefDTO> {
  await findOwnedTag(userId, id);
  const key = tagKey(name);
  const clash = await prisma.tag.findFirst({ where: { userId, key, NOT: { id } } });
  if (clash) throw conflict('Tag dengan nama ini sudah ada', { name: 'Nama sudah dipakai' });
  const tag = await prisma.tag.update({ where: { id }, data: { name, key } });
  return { id: tag.id, name: tag.name };
}

/** Tag dilepas dari semua transaksi; transaksinya sendiri tidak berubah. */
export async function deleteTag(userId: string, id: string): Promise<void> {
  await findOwnedTag(userId, id);
  await prisma.tag.delete({ where: { id } });
}

/** Total pemasukan/pengeluaran per tag dalam satu bulan. Satu transaksi bisa terhitung di beberapa tag. */
export async function getByTag(
  userId: string,
  type: CategoryType,
  month = currentMonth(),
): Promise<TagBreakdownDTO> {
  const { start, end } = monthRange(month);
  const rows = await prisma.$queryRaw<
    { tagId: string; name: string; total: bigint; count: number }[]
  >`
    SELECT tt."tagId", tg.name, SUM(ABS(tx.amount))::bigint AS total, COUNT(*)::int AS count
    FROM "TransactionTag" tt
    JOIN "Transaction" tx ON tx.id = tt."transactionId"
    JOIN "Tag" tg ON tg.id = tt."tagId"
    WHERE tx."userId" = ${userId}
      AND tx."deletedAt" IS NULL
      AND tx.type = ${type}::"TransactionType"
      AND tx.date BETWEEN ${toDbDate(start)}::date AND ${toDbDate(end)}::date
    GROUP BY tt."tagId", tg.name
    ORDER BY total DESC, tg.name ASC`;
  return {
    month,
    type,
    items: rows.map((r) => ({
      tagId: r.tagId,
      name: r.name,
      total: toNumber(r.total),
      count: r.count,
    })),
  };
}
