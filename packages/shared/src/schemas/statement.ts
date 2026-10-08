import { z } from 'zod';
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from '../constants';
import { idSchema } from './common';

export const statementPreviewSchema = z.object({
  filename: z.string().trim().min(1).max(120),
  walletId: idSchema,
  /** Isi file mutasi apa adanya. Hanya dibaca di memori; tidak pernah disimpan. */
  content: z
    .string()
    .min(1, { error: 'File kosong' })
    .max(IMPORT_MAX_BYTES, { error: 'File terlalu besar (maks. 1 MB)' }),
});

/** Keputusan pengguna di layar rekonsiliasi; baris yang tidak disebut memakai usulan server. */
export const statementDecisionSchema = z.object({
  line: z.number().int().min(1),
  import: z.boolean(),
  categoryId: idSchema.optional(),
});

export const statementImportSchema = statementPreviewSchema.extend({
  rows: z.array(statementDecisionSchema).max(IMPORT_MAX_ROWS).default([]),
});
export type StatementImportInput = z.input<typeof statementImportSchema>;
export type StatementDecision = z.output<typeof statementDecisionSchema>;
