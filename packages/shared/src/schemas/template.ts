import { z } from 'zod';
import { MAX_TEMPLATES } from '../constants';
import { amountSchema, dateSchema, idSchema } from './common';

const templateFields = z.object({
  /** Juga dipakai sebagai catatan transaksi yang dibuat dari template. */
  name: z
    .string()
    .trim()
    .min(1, { error: 'Nama wajib diisi' })
    .max(40, { error: 'Nama maksimal 40 karakter' }),
  type: z.enum(['INCOME', 'EXPENSE'], { error: 'Tipe harus pemasukan atau pengeluaran' }),
  /** null = nominal diisi setiap kali dipakai (mis. bensin). */
  amount: amountSchema.nullable(),
  walletId: idSchema,
  categoryId: idSchema,
});

export const createTemplateSchema = templateFields.extend({
  amount: templateFields.shape.amount.default(null),
});
export type CreateTemplateInput = z.input<typeof createTemplateSchema>;

export const updateTemplateSchema = templateFields.partial();
export type UpdateTemplateInput = z.input<typeof updateTemplateSchema>;

/** Urutan baru: seluruh id template milik pengguna, dari kiri ke kanan. */
export const reorderTemplatesSchema = z.object({
  ids: z.array(idSchema).min(1).max(MAX_TEMPLATES),
});
export type ReorderTemplatesInput = z.input<typeof reorderTemplatesSchema>;

/** `amount` menimpa nominal template; wajib bila template tanpa nominal. */
export const recordTemplateSchema = z.object({
  amount: amountSchema.optional(),
  date: dateSchema,
});
export type RecordTemplateInput = z.input<typeof recordTemplateSchema>;
