import { z } from 'zod';
import { RECURRENCE_FREQUENCIES } from '../constants';
import { amountSchema, dateSchema, idSchema, noteSchema } from './common';

const recurringFields = z.object({
  type: z.enum(['INCOME', 'EXPENSE'], { error: 'Tipe harus pemasukan atau pengeluaran' }),
  amount: amountSchema,
  walletId: idSchema,
  categoryId: idSchema,
  note: noteSchema,
  frequency: z.enum(RECURRENCE_FREQUENCIES, { error: 'Pilih frekuensi' }),
  interval: z
    .number({ error: 'Isi angka' })
    .int({ error: 'Harus bilangan bulat' })
    .min(1, { error: 'Minimal 1' })
    .max(99, { error: 'Maksimal 99' }),
  startDate: dateSchema,
  endDate: dateSchema.nullable(),
  /** true = langsung dicatat saat jatuh tempo; false = menunggu konfirmasi pengguna. */
  autoPost: z.boolean(),
});

const endAfterStart = (v: { startDate?: string; endDate?: string | null }) =>
  !v.startDate || !v.endDate || v.endDate >= v.startDate;
const endAfterStartIssue = {
  error: 'Tanggal berakhir tidak boleh sebelum tanggal mulai',
  path: ['endDate'],
};

export const createRecurringSchema = recurringFields
  .extend({
    interval: recurringFields.shape.interval.default(1),
    endDate: recurringFields.shape.endDate.default(null),
    autoPost: recurringFields.shape.autoPost.default(true),
  })
  .refine(endAfterStart, endAfterStartIssue);
export type CreateRecurringInput = z.input<typeof createRecurringSchema>;

export const updateRecurringSchema = recurringFields
  .partial()
  .extend({ paused: z.boolean().optional() })
  .refine(endAfterStart, endAfterStartIssue);
export type UpdateRecurringInput = z.input<typeof updateRecurringSchema>;

/** Nominal boleh disesuaikan saat konfirmasi (mis. tagihan listrik yang berubah tiap bulan). */
export const confirmOccurrenceSchema = z.object({ amount: amountSchema.optional() });
export type ConfirmOccurrenceInput = z.input<typeof confirmOccurrenceSchema>;
