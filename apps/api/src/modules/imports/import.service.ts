import {
  buildImportRows,
  IMPORT_MAX_ISSUES,
  IMPORT_MAX_ROWS,
  IMPORT_SYNC_ROWS,
  type ImportBatchDTO,
  type ImportIssue,
  type ImportPreviewDTO,
  type importRequestSchema,
  parseCsv,
} from '@catatku/shared';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { track } from '../../lib/analytics';
import { conflict, notFound, validationError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { fromDbDate, toDbDate, toNumber } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { findActiveWallet } from '../wallets/wallet.service';

type ImportRequest = z.output<typeof importRequestSchema>;
type Kind = 'INCOME' | 'EXPENSE';
type Stats = ImportBatchDTO['stats'];

const include = { wallet: { select: { id: true, name: true, color: true } } } as const;
type BatchRow = Prisma.ImportBatchGetPayload<{ include: typeof include }>;

/** createMany per potongan agar jumlah parameter query tetap di bawah batas Postgres. */
const INSERT_CHUNK = 1000;
/** Impor latar belakang yang tak kunjung selesai (mis. server mati) dianggap gagal. */
const STALE_MS = 15 * 60 * 1000;
const DUPLICATE_MESSAGE = 'Sudah ada transaksi dengan tanggal, jumlah, dan catatan yang sama';

function toDTO(row: BatchRow): ImportBatchDTO {
  return {
    id: row.id,
    filename: row.filename,
    status: row.status,
    walletId: row.walletId,
    wallet: row.wallet,
    stats: row.stats as unknown as Stats,
    issues: row.issues as unknown as ImportIssue[],
    createdAt: row.createdAt.toISOString(),
    rolledBackAt: row.rolledBackAt?.toISOString() ?? null,
  };
}

interface ReadyRow {
  line: number;
  date: string;
  type: Kind;
  amount: number;
  note: string | null;
  categoryId: string;
  duplicate: boolean;
}

interface Plan {
  total: number;
  rows: ReadyRow[];
  invalid: ImportIssue[];
}

const signed = (type: Kind, amount: number) => (type === 'INCOME' ? amount : -amount);
const duplicateKey = (date: string, amount: number, note: string | null) =>
  `${date}|${amount}|${(note ?? '').trim().toLowerCase()}`;

const byLine = (a: ImportIssue, b: ImportIssue) => a.line - b.line;
const capIssues = (issues: ImportIssue[]) => issues.sort(byLine).slice(0, IMPORT_MAX_ISSUES);

/** Baca file, cocokkan kategori, dan tandai duplikat. Belum ada yang ditulis ke database. */
async function planImport(userId: string, input: ImportRequest): Promise<Plan> {
  const { rows: csvRows } = parseCsv(input.csv);
  const total = csvRows.length - (input.hasHeader ? 1 : 0);
  if (total <= 0) {
    throw validationError('File tidak berisi baris data', { csv: 'File tidak berisi baris data' });
  }
  if (total > IMPORT_MAX_ROWS) {
    const message = `Maksimal ${IMPORT_MAX_ROWS.toLocaleString('id-ID')} baris per impor. Pecah filenya dulu.`;
    throw validationError(message, { csv: message });
  }

  const [wallet, categories] = await Promise.all([
    findActiveWallet(userId, input.walletId),
    prisma.category.findMany({
      where: { OR: [{ userId: null }, { userId }], archivedAt: null },
      select: { id: true, name: true, type: true },
    }),
  ]);
  const categoryIds = new Map(categories.map((c) => [`${c.type}|${c.name.toLowerCase()}`, c.id]));
  // Kategori yang tidak dikenali masuk ke "Lainnya" (bawaan, tidak bisa diarsipkan).
  const resolveCategory = (type: Kind, name: string | null) =>
    (name && categoryIds.get(`${type}|${name.trim().toLowerCase()}`)) ||
    categoryIds.get(`${type}|lainnya`)!;

  const results = buildImportRows(csvRows, input);
  const invalid: ImportIssue[] = [];
  const valid: Omit<ReadyRow, 'duplicate'>[] = [];
  for (const r of results) {
    if (r.ok) valid.push({ ...r, categoryId: resolveCategory(r.type, r.category) });
    else invalid.push({ line: r.line, kind: 'INVALID', message: r.reason });
  }
  if (valid.length === 0) return { total, rows: [], invalid };

  const dates = valid.map((r) => r.date).sort();
  const existing = await prisma.transaction.findMany({
    where: {
      userId,
      walletId: wallet.id,
      deletedAt: null,
      type: { in: ['INCOME', 'EXPENSE'] },
      date: { gte: toDbDate(dates[0]!), lte: toDbDate(dates[dates.length - 1]!) },
    },
    select: { date: true, amount: true, note: true },
  });
  // Dihitung per kemunculan: dua kopi identik di file vs satu di database = satu duplikat, satu baru.
  const remaining = new Map<string, number>();
  for (const e of existing) {
    const key = duplicateKey(fromDbDate(e.date), toNumber(e.amount), e.note);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  const rows = valid.map((r) => {
    const key = duplicateKey(r.date, signed(r.type, r.amount), r.note);
    const left = remaining.get(key) ?? 0;
    if (left > 0) remaining.set(key, left - 1);
    return { ...r, duplicate: left > 0 };
  });
  return { total, rows, invalid };
}

const duplicateIssues = (rows: ReadyRow[]): ImportIssue[] =>
  rows
    .filter((r) => r.duplicate)
    .map((r) => ({ line: r.line, kind: 'DUPLICATE', message: DUPLICATE_MESSAGE }));

export async function previewImport(
  userId: string,
  input: ImportRequest,
): Promise<ImportPreviewDTO> {
  const plan = await planImport(userId, input);
  const duplicates = duplicateIssues(plan.rows);
  return {
    stats: {
      total: plan.total,
      ready: plan.rows.length - duplicates.length,
      duplicates: duplicates.length,
      failed: plan.invalid.length,
    },
    issues: capIssues([...plan.invalid, ...duplicates]),
  };
}

/**
 * Impor kecil diproses langsung (status COMPLETED). Impor besar dikembalikan berstatus
 * PROCESSING lalu dilanjutkan di latar belakang; klien memantau lewat GET /imports/:id.
 */
export async function startImport(userId: string, input: ImportRequest): Promise<ImportBatchDTO> {
  const plan = await planImport(userId, input);
  const duplicates = input.skipDuplicates ? duplicateIssues(plan.rows) : [];
  const rows = input.skipDuplicates ? plan.rows.filter((r) => !r.duplicate) : plan.rows;
  if (rows.length === 0) {
    const message = plan.rows.length
      ? 'Semua baris sudah pernah dicatat'
      : 'Tidak ada baris yang bisa diimpor';
    throw validationError(message, { csv: message });
  }

  const stats: Stats = {
    total: plan.total,
    imported: 0,
    skipped: duplicates.length,
    failed: plan.invalid.length,
  };
  const batch = await prisma.importBatch.create({
    data: {
      userId,
      walletId: input.walletId,
      filename: input.filename,
      stats: stats as unknown as Prisma.InputJsonValue,
      issues: capIssues([...plan.invalid, ...duplicates]) as unknown as Prisma.InputJsonValue,
    },
    include,
  });

  const run = insertRows(userId, batch.id, input.walletId, rows, stats);
  if (rows.length > IMPORT_SYNC_ROWS) {
    run.catch(() => undefined);
    return toDTO(batch);
  }
  return run;
}

async function insertRows(
  userId: string,
  batchId: string,
  walletId: string,
  rows: ReadyRow[],
  stats: Stats,
): Promise<ImportBatchDTO> {
  const data = rows.map((r) => ({
    userId,
    walletId,
    categoryId: r.categoryId,
    type: r.type,
    amount: BigInt(signed(r.type, r.amount)),
    date: toDbDate(r.date),
    note: r.note,
    importBatchId: batchId,
  }));
  const chunks = Array.from({ length: Math.ceil(data.length / INSERT_CHUNK) }, (_, i) =>
    data.slice(i * INSERT_CHUNK, (i + 1) * INSERT_CHUNK),
  );
  const done = { ...stats, imported: rows.length };
  try {
    // Satu transaksi database: impor tidak pernah tersimpan setengah.
    const results = await prisma.$transaction([
      ...chunks.map((chunk) => prisma.transaction.createMany({ data: chunk })),
      prisma.importBatch.update({
        where: { id: batchId },
        data: { status: 'COMPLETED', stats: done as unknown as Prisma.InputJsonValue },
        include,
      }),
    ]);
    track(userId, 'import_completed', {
      imported: done.imported,
      skipped: done.skipped,
      failed: done.failed,
      background: rows.length > IMPORT_SYNC_ROWS,
    });
    return toDTO(results[results.length - 1] as BatchRow);
  } catch (err) {
    logger.error({ err, batchId }, 'Impor CSV gagal');
    await prisma.importBatch
      .update({ where: { id: batchId }, data: { status: 'FAILED' } })
      .catch((e: unknown) => logger.warn({ err: e, batchId }, 'Gagal menandai impor gagal'));
    throw err;
  }
}

async function expireStale(userId: string) {
  await prisma.importBatch.updateMany({
    where: { userId, status: 'PROCESSING', createdAt: { lt: new Date(Date.now() - STALE_MS) } },
    data: { status: 'FAILED' },
  });
}

async function findOwned(userId: string, id: string): Promise<BatchRow> {
  const row = await prisma.importBatch.findFirst({ where: { id, userId }, include });
  if (!row) throw notFound('Impor');
  return row;
}

export async function listImports(userId: string): Promise<ImportBatchDTO[]> {
  await expireStale(userId);
  const rows = await prisma.importBatch.findMany({
    where: { userId },
    include,
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return rows.map(toDTO);
}

export async function getImport(userId: string, id: string): Promise<ImportBatchDTO> {
  await expireStale(userId);
  return toDTO(await findOwned(userId, id));
}

/** Hapus permanen semua transaksi dari impor ini; riwayat impornya tetap ada. */
export async function rollbackImport(userId: string, id: string): Promise<ImportBatchDTO> {
  const batch = await findOwned(userId, id);
  if (batch.status === 'ROLLED_BACK') return toDTO(batch);
  if (batch.status === 'PROCESSING') {
    throw conflict('Impor masih diproses. Tunggu sampai selesai, lalu coba lagi.');
  }
  if (batch.status === 'FAILED') throw conflict('Impor ini gagal, tidak ada yang perlu dibatalkan');
  const [removed, updated] = await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId, importBatchId: id } }),
    prisma.importBatch.update({
      where: { id },
      data: { status: 'ROLLED_BACK', rolledBackAt: new Date() },
      include,
    }),
  ]);
  track(userId, 'import_rolled_back', { removed: removed.count });
  return toDTO(updated);
}
