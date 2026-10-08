import { randomUUID } from 'node:crypto';
import { type AttachmentDTO, MAX_ATTACHMENTS_PER_TRANSACTION } from '@catatku/shared';
import type { Attachment } from '@prisma/client';
import { track } from '../../lib/analytics';
import { runInBackground } from '../../lib/background';
import { AppError, notFound, validationError } from '../../lib/errors';
import { sniffImageType } from '../../lib/imageType';
import { prisma } from '../../lib/prisma';
import { getStorage, type ObjectStorage } from '../../lib/storage';

/** Umur tautan baca. Klien meminta ulang daftar lampiran bila sudah lewat. */
export const URL_TTL_SECONDS = 15 * 60;
const PURGE_BATCH = 500;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function requireStorage(): ObjectStorage {
  const storage = getStorage();
  if (!storage) {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Penyimpanan lampiran belum dikonfigurasi');
  }
  return storage;
}

async function toDTO(storage: ObjectStorage, row: Attachment): Promise<AttachmentDTO> {
  return {
    id: row.id,
    transactionId: row.transactionId!,
    mimeType: row.mimeType,
    size: row.size,
    createdAt: row.createdAt.toISOString(),
    url: await storage.signedUrl(row.storageKey, URL_TTL_SECONDS),
    expiresAt: new Date(Date.now() + URL_TTL_SECONDS * 1000).toISOString(),
  };
}

async function findOwnedTransaction(userId: string, transactionId: string) {
  const tx = await prisma.transaction.findFirst({
    where: { id: transactionId, userId, deletedAt: null },
    select: { id: true },
  });
  if (!tx) throw notFound('Transaksi');
  return tx;
}

export async function listAttachments(
  userId: string,
  transactionId: string,
): Promise<AttachmentDTO[]> {
  const storage = requireStorage();
  await findOwnedTransaction(userId, transactionId);
  const rows = await prisma.attachment.findMany({
    where: { userId, transactionId },
    orderBy: { createdAt: 'asc' },
  });
  return Promise.all(rows.map((r) => toDTO(storage, r)));
}

export async function uploadAttachment(
  userId: string,
  transactionId: string,
  data: unknown,
): Promise<AttachmentDTO> {
  const storage = requireStorage();
  const mimeType = Buffer.isBuffer(data) && data.length > 0 ? sniffImageType(data) : null;
  if (!Buffer.isBuffer(data) || !mimeType) {
    throw validationError('Lampiran harus berupa gambar JPEG, PNG, atau WebP');
  }
  await findOwnedTransaction(userId, transactionId);
  const count = await prisma.attachment.count({ where: { transactionId } });
  if (count >= MAX_ATTACHMENTS_PER_TRANSACTION) {
    throw validationError(`Maksimal ${MAX_ATTACHMENTS_PER_TRANSACTION} lampiran per transaksi`);
  }

  // Awalan userId memudahkan menghapus semua berkas milik satu akun langsung di penyimpanan.
  const storageKey = `${userId}/${transactionId}/${randomUUID()}.${EXTENSIONS[mimeType]}`;
  await storage.put(storageKey, new Uint8Array(data), mimeType);
  try {
    const row = await prisma.attachment.create({
      data: { userId, transactionId, storageKey, mimeType, size: data.length },
    });
    track(userId, 'attachment_uploaded', { mimeType, size: data.length });
    return await toDTO(storage, row);
  } catch (err) {
    await storage.remove([storageKey]).catch(() => undefined);
    throw err;
  }
}

export async function deleteAttachment(userId: string, id: string): Promise<void> {
  const storage = requireStorage();
  const row = await prisma.attachment.findFirst({ where: { id, userId } });
  if (!row) throw notFound('Lampiran');
  // Berkas dihapus dulu: bila gagal, baris tetap ada sehingga bisa dicoba lagi.
  await storage.remove([row.storageKey]);
  await prisma.attachment.delete({ where: { id } });
}

/**
 * Transaksi yang terhapus permanen (hapus dompet, batalkan impor) meninggalkan lampiran tanpa
 * transaksi. Berkasnya dihapus dari penyimpanan, lalu barisnya.
 */
export async function purgeOrphanAttachments(): Promise<number> {
  const storage = getStorage();
  if (!storage) return 0;
  let purged = 0;
  for (;;) {
    const rows = await prisma.attachment.findMany({
      where: { transactionId: null },
      select: { id: true, storageKey: true },
      take: PURGE_BATCH,
    });
    if (rows.length === 0) return purged;
    await storage.remove(rows.map((r) => r.storageKey));
    await prisma.attachment.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    purged += rows.length;
    if (rows.length < PURGE_BATCH) return purged;
  }
}

export function purgeOrphansInBackground(): void {
  runInBackground(purgeOrphanAttachments(), 'Gagal membersihkan lampiran tanpa transaksi');
}
