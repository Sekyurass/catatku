import { z } from 'zod';
import { TRANSACTION_TYPES } from '../constants';
import { amountSchema, dateSchema, idSchema, noteSchema } from './common';
import { tagNamesSchema } from './tag';

export const createTransactionSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE'], { error: 'Tipe harus pemasukan atau pengeluaran' }),
  amount: amountSchema,
  walletId: idSchema,
  categoryId: idSchema,
  date: dateSchema,
  note: noteSchema,
  /** Nama tag (dibuat otomatis bila belum ada). Saat edit, daftar ini menggantikan tag lama. */
  tags: tagNamesSchema.optional(),
});
export type CreateTransactionInput = z.input<typeof createTransactionSchema>;

export const updateTransactionSchema = createTransactionSchema.partial();
export type UpdateTransactionInput = z.input<typeof updateTransactionSchema>;

export const createTransferSchema = z
  .object({
    fromWalletId: idSchema,
    toWalletId: idSchema,
    amount: amountSchema,
    date: dateSchema,
    note: noteSchema,
  })
  .refine((v) => v.fromWalletId !== v.toWalletId, {
    error: 'Dompet asal dan tujuan harus berbeda',
    path: ['toWalletId'],
  });
export type CreateTransferInput = z.input<typeof createTransferSchema>;

export const updateTransferSchema = z
  .object({
    fromWalletId: idSchema,
    toWalletId: idSchema,
    amount: amountSchema,
    date: dateSchema,
    note: noteSchema,
  })
  .partial();
export type UpdateTransferInput = z.input<typeof updateTransferSchema>;

export const listTransactionsQuery = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    categoryId: idSchema.optional(),
    walletId: idSchema.optional(),
    type: z.enum(TRANSACTION_TYPES).optional(),
    tagId: idSchema.optional(),
    q: z.string().trim().max(100).optional(),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    error: 'Tanggal awal harus sebelum tanggal akhir',
    path: ['to'],
  });
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuery>;

export const exportTransactionsQuery = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    categoryId: idSchema.optional(),
    walletId: idSchema.optional(),
    type: z.enum(TRANSACTION_TYPES).optional(),
    tagId: idSchema.optional(),
    q: z.string().trim().max(100).optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    error: 'Tanggal awal harus sebelum tanggal akhir',
    path: ['to'],
  });
export type ExportTransactionsQuery = z.infer<typeof exportTransactionsQuery>;
