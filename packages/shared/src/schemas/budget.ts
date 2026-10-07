import { z } from 'zod';
import { CATEGORY_ICONS, MAX_AMOUNT } from '../constants';
import { hexColorSchema, idSchema, monthSchema } from './common';

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

/** Anggaran dengan nama sendiri: membuat kategori pengeluaran baru sekaligus batasnya. */
export const createCustomBudgetSchema = z.object({
  month: monthSchema,
  name: z
    .string({ error: 'Nama anggaran wajib diisi' })
    .trim()
    .min(1, { error: 'Nama anggaran wajib diisi' })
    .max(30, { error: 'Nama anggaran maksimal 30 karakter' }),
  icon: z.enum(CATEGORY_ICONS, { error: 'Ikon tidak tersedia' }).default('circle-ellipsis'),
  color: hexColorSchema.default('#64748B'),
  limitAmount: z
    .number({ error: 'Masukkan batas anggaran' })
    .int({ error: 'Batas anggaran harus bilangan bulat Rupiah' })
    .min(1, { error: 'Masukkan batas lebih dari 0' })
    .max(MAX_AMOUNT),
  scope: z.enum(BUDGET_SCOPES).default('onward'),
});
export type CreateCustomBudgetInput = z.input<typeof createCustomBudgetSchema>;
