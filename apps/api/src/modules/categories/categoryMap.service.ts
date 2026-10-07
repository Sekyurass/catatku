import {
  FEATURE_FLAGS,
  merchantKey,
  type CategoryMapDTO,
  type CategoryType,
} from '@catatku/shared';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { isFeatureEnabled } from '../features/featureFlag.service';

/** Cukup untuk ratusan toko/catatan langganan; klien mencocokkan semuanya secara lokal. */
const MAX_MAPS = 500;

export async function learnCategory(
  userId: string,
  note: string | null | undefined,
  categoryId: string,
  type: CategoryType,
): Promise<void> {
  const key = note ? merchantKey(note) : null;
  if (!key) return;
  await prisma.merchantCategoryMap.upsert({
    where: { userId_type_key: { userId, type, key } },
    create: { userId, type, key, categoryId },
    update: { categoryId, hits: { increment: 1 } },
  });
}

/**
 * Dipanggil setelah transaksi tersimpan: pilihan terakhir pengguna menjadi saran berikutnya.
 * Tidak ditunggu dan tidak pernah menggagalkan penyimpanan transaksi.
 */
export function learnCategoryInBackground(
  userId: string,
  note: string | null | undefined,
  categoryId: string,
  type: CategoryType,
): void {
  if (!note || !merchantKey(note)) return;
  isFeatureEnabled(FEATURE_FLAGS.AUTO_CATEGORY, userId)
    .then((on) => (on ? learnCategory(userId, note, categoryId, type) : undefined))
    .catch((err: unknown) => logger.warn({ err }, 'Gagal mempelajari kategori dari transaksi'));
}

export async function listCategoryMaps(userId: string): Promise<CategoryMapDTO[]> {
  const rows = await prisma.merchantCategoryMap.findMany({
    where: { userId, category: { archivedAt: null } },
    orderBy: { updatedAt: 'desc' },
    take: MAX_MAPS,
    select: { key: true, type: true, categoryId: true },
  });
  return rows;
}
