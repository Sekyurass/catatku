import type { createWalletSchema, UpdateWalletInput, WalletDTO } from '@catatku/shared';
import type { Wallet } from '@prisma/client';
import type { z } from 'zod';
import { notFound, validationError } from '../../lib/errors';
import { toNumber } from '../../lib/money';
import { prisma } from '../../lib/prisma';

interface WalletStats {
  sum: bigint;
  lastUsedAt: Date | null;
}

/** Σ amount transaksi aktif per dompet, dihitung oleh database. */
export async function getWalletStats(userId: string): Promise<Map<string, WalletStats>> {
  const rows = await prisma.transaction.groupBy({
    by: ['walletId'],
    where: { userId, deletedAt: null },
    _sum: { amount: true },
    _max: { createdAt: true },
  });
  return new Map(
    rows.map((r) => [r.walletId, { sum: r._sum.amount ?? 0n, lastUsedAt: r._max.createdAt }]),
  );
}

function toDTO(wallet: Wallet, stats?: WalletStats): WalletDTO {
  return {
    id: wallet.id,
    name: wallet.name,
    type: wallet.type,
    initialBalance: toNumber(wallet.initialBalance),
    balance: toNumber(wallet.initialBalance + (stats?.sum ?? 0n)),
    color: wallet.color,
    archivedAt: wallet.archivedAt?.toISOString() ?? null,
    createdAt: wallet.createdAt.toISOString(),
    lastUsedAt: stats?.lastUsedAt?.toISOString() ?? null,
  };
}

export async function listWallets(userId: string, includeArchived = false): Promise<WalletDTO[]> {
  const [wallets, stats] = await Promise.all([
    prisma.wallet.findMany({
      where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: { createdAt: 'asc' },
    }),
    getWalletStats(userId),
  ]);
  return wallets.map((w) => toDTO(w, stats.get(w.id)));
}

export async function findOwnedWallet(userId: string, walletId: string): Promise<Wallet> {
  const wallet = await prisma.wallet.findFirst({ where: { id: walletId, userId } });
  if (!wallet) throw notFound('Dompet');
  return wallet;
}

/** Dompet milik pengguna yang belum diarsipkan; untuk mencatat transaksi baru. */
export async function findActiveWallet(userId: string, walletId: string, field = 'walletId') {
  const wallet = await prisma.wallet.findFirst({ where: { id: walletId, userId } });
  if (!wallet)
    throw validationError('Dompet tidak ditemukan', { [field]: 'Dompet tidak ditemukan' });
  if (wallet.archivedAt) {
    throw validationError('Dompet sudah diarsipkan', { [field]: 'Dompet ini sudah diarsipkan' });
  }
  return wallet;
}

export async function getWallet(userId: string, walletId: string): Promise<WalletDTO> {
  const wallet = await findOwnedWallet(userId, walletId);
  const stats = await getWalletStats(userId);
  return toDTO(wallet, stats.get(wallet.id));
}

export async function createWallet(
  userId: string,
  data: z.output<typeof createWalletSchema>,
): Promise<WalletDTO> {
  const wallet = await prisma.wallet.create({
    data: { ...data, initialBalance: BigInt(data.initialBalance), userId },
  });
  return toDTO(wallet);
}

export async function updateWallet(
  userId: string,
  walletId: string,
  input: UpdateWalletInput,
): Promise<WalletDTO> {
  await findOwnedWallet(userId, walletId);
  const { archived, initialBalance, ...rest } = input;
  await prisma.wallet.update({
    where: { id: walletId },
    data: {
      ...rest,
      ...(initialBalance !== undefined && { initialBalance: BigInt(initialBalance) }),
      ...(archived !== undefined && { archivedAt: archived ? new Date() : null }),
    },
  });
  return getWallet(userId, walletId);
}

/** Dompet tanpa riwayat dihapus permanen; yang punya riwayat diarsipkan agar laporan lama tetap utuh. */
export async function deleteWallet(
  userId: string,
  walletId: string,
): Promise<'deleted' | 'archived'> {
  await findOwnedWallet(userId, walletId);
  const used = await prisma.transaction.count({ where: { walletId, userId } });
  if (used === 0) {
    await prisma.wallet.delete({ where: { id: walletId } });
    return 'deleted';
  }
  await prisma.wallet.update({ where: { id: walletId }, data: { archivedAt: new Date() } });
  return 'archived';
}
