import { randomUUID } from 'node:crypto';
import {
  detectStatement,
  IMPORT_MAX_ISSUES,
  IMPORT_MAX_ROWS,
  merchantKey,
  STATEMENT_BANK_NAMES,
  statementBalanced,
  suggestCategoryByKeyword,
  toDateString,
  type ImportBatchDTO,
  type ImportIssue,
  type ParsedStatement,
  type StatementEntry,
  type statementImportSchema,
  type StatementPreviewDTO,
  type statementPreviewSchema,
  type StatementRowDTO,
} from '@catatku/shared';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { track } from '../../lib/analytics';
import { validationError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { fromDbDate, toDbDate, toNumber } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { learnCategoryInBackground } from '../categories/categoryMap.service';
import { findActiveWallet } from '../wallets/wallet.service';
import { batchInclude, toDTO as toBatchDTO, type BatchRow } from './import.service';

type PreviewInput = z.output<typeof statementPreviewSchema>;
type ImportInput = z.output<typeof statementImportSchema>;
type Kind = 'INCOME' | 'EXPENSE';

/** Bank bisa membukukan beberapa hari setelah transaksi dicatat pengguna (akhir pekan, kliring). */
const MATCH_DAYS = 3;
/** Baris PEND bertanggal perkiraan, jadi jendelanya lebih lebar. */
const PENDING_MATCH_DAYS = 5;
const INSERT_CHUNK = 1000;
const MATCHED_MESSAGE = 'Sudah tercatat, dilewati';
const SKIPPED_MESSAGE = 'Tidak dipilih untuk diimpor';

const DAY_MS = 86_400_000;
const dayDiff = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;
const shiftDate = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const signed = (type: Kind, amount: number) => (type === 'INCOME' ? amount : -amount);
const windowFor = (e: StatementEntry) => (e.pending ? PENDING_MATCH_DAYS : MATCH_DAYS);

function readStatement(input: PreviewInput): ParsedStatement {
  const parser = detectStatement(input.content);
  if (!parser) {
    const message = 'Format mutasi tidak dikenali. Saat ini yang didukung: CSV mutasi BCA.';
    throw validationError(message, { content: message });
  }
  const parsed = parser.parse(input.content, { today: toDateString() });
  if (parsed.entries.length === 0) {
    const message = 'Tidak ada transaksi yang terbaca di file mutasi';
    throw validationError(message, { content: message });
  }
  if (parsed.entries.length > IMPORT_MAX_ROWS) {
    const message = `Maksimal ${IMPORT_MAX_ROWS.toLocaleString('id-ID')} baris per impor. Pecah filenya dulu.`;
    throw validationError(message, { content: message });
  }
  return parsed;
}

interface Candidate {
  id: string;
  date: string;
}

/**
 * Pasangan satu-lawan-satu dengan selisih tanggal terkecil lebih dulu, agar dua transaksi
 * bernominal sama di minggu yang sama tidak saling "mencuri" pasangan.
 */
function pairUp<C extends Candidate>(
  entries: StatementEntry[],
  candidates: C[],
  key: (e: StatementEntry) => string,
  candidateKey: (c: C) => string,
): Map<number, C> {
  const byKey = new Map<string, C[]>();
  for (const c of candidates) {
    const k = candidateKey(c);
    byKey.set(k, [...(byKey.get(k) ?? []), c]);
  }
  const pairs: { entry: StatementEntry; candidate: C; diff: number }[] = [];
  for (const entry of entries) {
    for (const candidate of byKey.get(key(entry)) ?? []) {
      const diff = dayDiff(entry.date, candidate.date);
      if (diff <= windowFor(entry)) pairs.push({ entry, candidate, diff });
    }
  }
  pairs.sort((a, b) => a.diff - b.diff || a.entry.line - b.entry.line);
  const result = new Map<number, C>();
  const used = new Set<string>();
  for (const p of pairs) {
    if (result.has(p.entry.line) || used.has(p.candidate.id)) continue;
    result.set(p.entry.line, p.candidate);
    used.add(p.candidate.id);
  }
  return result;
}

interface Plan {
  parsed: ParsedStatement;
  rows: StatementRowDTO[];
  categoryTypes: Map<string, Kind>;
}

async function planStatement(userId: string, input: PreviewInput): Promise<Plan> {
  const parsed = readStatement(input);
  const { entries } = parsed;
  const dates = entries.map((e) => e.date).sort();
  const from = toDbDate(shiftDate(dates[0]!, -PENDING_MATCH_DAYS));
  const to = toDbDate(shiftDate(dates[dates.length - 1]!, PENDING_MATCH_DAYS));

  const [, categories, maps, existing, emails] = await Promise.all([
    findActiveWallet(userId, input.walletId),
    prisma.category.findMany({
      where: { OR: [{ userId: null }, { userId }], archivedAt: null },
      select: { id: true, name: true, type: true },
    }),
    prisma.merchantCategoryMap.findMany({
      where: { userId, category: { archivedAt: null } },
      select: { key: true, type: true, categoryId: true },
    }),
    // Termasuk kaki transfer: tarik tunai yang dicatat sebagai transfer ke dompet tunai juga cocok.
    prisma.transaction.findMany({
      where: { userId, walletId: input.walletId, deletedAt: null, date: { gte: from, lte: to } },
      select: { id: true, date: true, type: true, amount: true, note: true },
    }),
    prisma.inboundTransaction.findMany({
      where: { userId, status: 'PENDING', date: { gte: from, lte: to } },
      select: { id: true, date: true, type: true, amount: true },
    }),
  ]);

  const categoryTypes = new Map(categories.map((c) => [c.id, c.type as Kind]));
  const lainnya = (type: Kind) =>
    categories.find((c) => c.type === type && c.name.toLowerCase() === 'lainnya')!.id;
  const learned = new Map(maps.map((m) => [`${m.type}|${m.key}`, m.categoryId]));
  const suggest = (e: StatementEntry): Pick<StatementRowDTO, 'categoryId' | 'categorySource'> => {
    const key = merchantKey(e.note);
    const fromHistory = key ? learned.get(`${e.type}|${key}`) : undefined;
    if (fromHistory && categoryTypes.has(fromHistory)) {
      return { categoryId: fromHistory, categorySource: 'history' };
    }
    const byKeyword = suggestCategoryByKeyword(e.note, e.type);
    if (byKeyword && categoryTypes.get(byKeyword) === e.type) {
      return { categoryId: byKeyword, categorySource: 'keyword' };
    }
    return { categoryId: lainnya(e.type), categorySource: 'default' };
  };

  const txs = existing.map((t) => ({
    id: t.id,
    date: fromDbDate(t.date),
    type: t.type,
    amount: toNumber(t.amount),
    note: t.note,
  }));
  const matches = pairUp(
    entries,
    txs,
    (e) => String(signed(e.type, e.amount)),
    (t) => String(t.amount),
  );
  const unmatched = entries.filter((e) => !matches.has(e.line));
  const emailMatches = pairUp(
    unmatched,
    emails.map((m) => ({
      id: m.id,
      date: fromDbDate(m.date),
      key: `${m.type}|${toNumber(m.amount)}`,
    })),
    (e) => `${e.type}|${e.amount}`,
    (m) => m.key,
  );

  const rows = entries.map((e): StatementRowDTO => {
    const match = matches.get(e.line);
    return {
      ...e,
      ...suggest(e),
      match: match
        ? {
            id: match.id,
            date: match.date,
            type: match.type,
            amount: Math.abs(match.amount),
            note: match.note,
          }
        : null,
      bankEmailId: emailMatches.get(e.line)?.id ?? null,
    };
  });
  return { parsed, rows, categoryTypes };
}

/** Usulan bawaan: impor baris yang belum tercatat; tarik/setor tunai menunggu keputusan pengguna. */
const importByDefault = (r: StatementRowDTO) => r.match === null && !r.cash;

export async function previewStatement(
  userId: string,
  input: PreviewInput,
): Promise<StatementPreviewDTO> {
  const { parsed, rows } = await planStatement(userId, input);
  const balanced = statementBalanced(parsed);
  const matched = rows.filter((r) => r.match).length;
  return {
    bank: parsed.bank,
    bankName: STATEMENT_BANK_NAMES[parsed.bank],
    accountHint: parsed.accountHint,
    period: parsed.period,
    balance: parsed.balance ? { ...parsed.balance, balanced: balanced ?? false } : null,
    rows,
    invalidLines: parsed.invalidLines,
    stats: {
      total: rows.length + parsed.invalidLines.length,
      new: rows.length - matched,
      matched,
      failed: parsed.invalidLines.length,
    },
  };
}

/**
 * File dibaca dan dicocokkan ulang di server (klien hanya mengirim keputusan per baris),
 * jadi isi tabel yang diimpor selalu sama dengan file aslinya. Isi file tidak disimpan.
 */
export async function importStatement(userId: string, input: ImportInput): Promise<ImportBatchDTO> {
  const { parsed, rows, categoryTypes } = await planStatement(userId, input);
  const decisions = new Map(input.rows.map((d) => [d.line, d]));

  const chosen: (StatementRowDTO & { id: string })[] = [];
  const issues: ImportIssue[] = parsed.invalidLines.map((line) => ({
    line,
    kind: 'INVALID',
    message: 'Baris tidak terbaca',
  }));
  for (const row of rows) {
    const decision = decisions.get(row.line);
    if (!(decision?.import ?? importByDefault(row))) {
      issues.push({
        line: row.line,
        kind: 'DUPLICATE',
        message: row.match ? MATCHED_MESSAGE : SKIPPED_MESSAGE,
      });
      continue;
    }
    const picked = decision?.categoryId;
    if (picked && categoryTypes.get(picked) !== row.type) {
      const message = `Kategori baris ${row.line} tidak sesuai`;
      throw validationError(message, { rows: message });
    }
    chosen.push({ ...row, categoryId: picked ?? row.categoryId, id: randomUUID() });
    if (picked && picked !== row.categoryId) {
      learnCategoryInBackground(userId, row.note, picked, row.type);
    }
  }
  if (chosen.length === 0) {
    const message = rows.some((r) => r.match)
      ? 'Semua transaksi di mutasi ini sudah tercatat'
      : 'Tidak ada baris yang dipilih untuk diimpor';
    throw validationError(message, { rows: message });
  }

  const stats = {
    total: rows.length + parsed.invalidLines.length,
    imported: chosen.length,
    skipped: rows.length - chosen.length,
    failed: parsed.invalidLines.length,
  };
  const batch = await prisma.importBatch.create({
    data: {
      userId,
      walletId: input.walletId,
      filename: input.filename,
      source: parsed.bank,
      stats: stats as unknown as Prisma.InputJsonValue,
      issues: issues
        .sort((a, b) => a.line - b.line)
        .slice(0, IMPORT_MAX_ISSUES) as unknown as Prisma.InputJsonValue,
    },
  });

  const data = chosen.map((r) => ({
    id: r.id,
    userId,
    walletId: input.walletId,
    categoryId: r.categoryId,
    type: r.type,
    amount: BigInt(signed(r.type, r.amount)),
    date: toDbDate(r.date),
    note: r.note,
    importBatchId: batch.id,
  }));
  const chunks = Array.from({ length: Math.ceil(data.length / INSERT_CHUNK) }, (_, i) =>
    data.slice(i * INSERT_CHUNK, (i + 1) * INSERT_CHUNK),
  );
  const linked = chosen.filter((r) => r.bankEmailId);
  try {
    const results = await prisma.$transaction([
      ...chunks.map((chunk) => prisma.transaction.createMany({ data: chunk })),
      ...linked.map((r) =>
        prisma.inboundTransaction.updateMany({
          where: { id: r.bankEmailId!, userId, status: 'PENDING' },
          data: { status: 'CONFIRMED', transactionId: r.id },
        }),
      ),
      prisma.importBatch.update({
        where: { id: batch.id },
        data: { status: 'COMPLETED' },
        include: batchInclude,
      }),
    ]);
    track(userId, 'statement_imported', {
      bank: parsed.bank,
      imported: stats.imported,
      skipped: stats.skipped,
      failed: stats.failed,
      bankEmails: linked.length,
    });
    return toBatchDTO(results[results.length - 1] as BatchRow);
  } catch (err) {
    logger.error({ err, batchId: batch.id }, 'Impor mutasi gagal');
    await prisma.importBatch
      .update({ where: { id: batch.id }, data: { status: 'FAILED' } })
      .catch((e: unknown) =>
        logger.warn({ err: e, batchId: batch.id }, 'Gagal menandai impor gagal'),
      );
    throw err;
  }
}
