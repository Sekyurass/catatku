import { z } from 'zod';
import { IMPORT_MAX_BYTES } from '../constants';
import { idSchema } from './common';

const column = z.number().int().min(0).max(200);

export const DATE_ORDERS = ['DMY', 'MDY', 'YMD'] as const;
export type DateOrder = (typeof DATE_ORDERS)[number];

export const DECIMAL_SEPARATORS = ['comma', 'dot'] as const;
export type DecimalSeparator = (typeof DECIMAL_SEPARATORS)[number];

/** Dipakai bila kolom tipe tidak dipetakan. SIGN = jumlah negatif berarti pengeluaran. */
export const IMPORT_DEFAULT_TYPES = ['SIGN', 'EXPENSE', 'INCOME'] as const;
export type ImportDefaultType = (typeof IMPORT_DEFAULT_TYPES)[number];

/** Cara membaca file; dipakai bersama oleh pratinjau di browser dan pemrosesan di server. */
export const importParseOptionsSchema = z.object({
  hasHeader: z.boolean(),
  columns: z.object({
    date: column,
    amount: column,
    note: column.nullable().default(null),
    type: column.nullable().default(null),
    category: column.nullable().default(null),
  }),
  dateOrder: z.enum(DATE_ORDERS),
  decimal: z.enum(DECIMAL_SEPARATORS),
  defaultType: z.enum(IMPORT_DEFAULT_TYPES).default('SIGN'),
});
export type ImportParseOptions = z.output<typeof importParseOptionsSchema>;

export const importRequestSchema = importParseOptionsSchema.extend({
  filename: z.string().trim().min(1).max(120),
  walletId: idSchema,
  csv: z
    .string()
    .min(1, { error: 'File kosong' })
    .max(IMPORT_MAX_BYTES, { error: 'File terlalu besar (maks. 1 MB)' }),
  /** false = baris yang terdeteksi duplikat tetap diimpor. */
  skipDuplicates: z.boolean().default(true),
});
export type ImportRequestInput = z.input<typeof importRequestSchema>;
