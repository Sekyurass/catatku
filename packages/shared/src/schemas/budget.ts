import { z } from 'zod';
import { MAX_AMOUNT } from '../constants';
import { idSchema, monthSchema } from './common';

export const budgetMonthQuery = z.object({
  month: monthSchema.optional(),
});

export const BUDGET_SCOPES = ['onward', 'month'] as const;
export type BudgetScope = (typeof BUDGET_SCOPES)[number];

export const putBudgetsSchema = z.object({
  month: monthSchema,
  /**
   * limitAmount 0 = hentikan anggaran kategori tersebut.
   * scope "onward" (default): berlaku mulai bulan itu dan seterusnya.
   * scope "month": hanya bulan itu; bulan berikutnya tetap memakai pengaturan sebelumnya.
   */
  items: z
    .array(
      z.object({
        categoryId: idSchema,
        limitAmount: z
          .number()
          .int({ error: 'Batas anggaran harus bilangan bulat Rupiah' })
          .min(0, { error: 'Batas anggaran tidak boleh negatif' })
          .max(MAX_AMOUNT),
        scope: z.enum(BUDGET_SCOPES).default('onward'),
      }),
    )
    .max(100),
});
export type PutBudgetsInput = z.infer<typeof putBudgetsSchema>;
