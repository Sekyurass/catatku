import { z } from 'zod';
import { MAX_AMOUNT } from '../constants';
import { idSchema, monthSchema } from './common';

export const budgetMonthQuery = z.object({
  month: monthSchema.optional(),
});

export const putBudgetsSchema = z.object({
  month: monthSchema,
  /** limitAmount 0 = hapus anggaran kategori tersebut di bulan itu. */
  items: z
    .array(
      z.object({
        categoryId: idSchema,
        limitAmount: z
          .number()
          .int({ error: 'Batas anggaran harus bilangan bulat Rupiah' })
          .min(0, { error: 'Batas anggaran tidak boleh negatif' })
          .max(MAX_AMOUNT),
      }),
    )
    .max(100),
});
export type PutBudgetsInput = z.infer<typeof putBudgetsSchema>;
