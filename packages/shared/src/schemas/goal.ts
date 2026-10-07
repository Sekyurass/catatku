import { z } from 'zod';
import { CATEGORY_ICONS, GOAL_CONTRIBUTION_TYPES, GOAL_NAME_MAX } from '../constants';
import { amountSchema, dateSchema, hexColorSchema, idSchema, noteSchema } from './common';

const goalFields = z.object({
  name: z
    .string({ error: 'Nama target wajib diisi' })
    .trim()
    .min(1, { error: 'Nama target wajib diisi' })
    .max(GOAL_NAME_MAX, { error: `Nama maksimal ${GOAL_NAME_MAX} karakter` }),
  targetAmount: amountSchema,
  /** null = tanpa tenggat; saran setoran per bulan tidak dihitung. */
  deadline: dateSchema.nullable(),
  icon: z.enum(CATEGORY_ICONS, { error: 'Ikon tidak tersedia' }),
  color: hexColorSchema,
  /**
   * Dompet tabungan; setor/tarik selalu dicatat sebagai transfer ke/dari dompet ini.
   * null = server membuatkan dompet baru "Tabungan {nama}".
   */
  walletId: idSchema.nullable(),
});

export const createGoalSchema = goalFields.extend({
  deadline: goalFields.shape.deadline.default(null),
  icon: goalFields.shape.icon.default('piggy-bank'),
  color: goalFields.shape.color.default('#0F766E'),
  walletId: goalFields.shape.walletId.default(null),
});
export type CreateGoalInput = z.input<typeof createGoalSchema>;

export const updateGoalSchema = goalFields.partial();
export type UpdateGoalInput = z.input<typeof updateGoalSchema>;

/** `walletId` = dompet asal (setor) atau dompet tujuan (tarik); server mewajibkannya. */
export const createContributionSchema = z.object({
  type: z.enum(GOAL_CONTRIBUTION_TYPES, { error: 'Pilih setor atau tarik' }),
  amount: amountSchema,
  date: dateSchema,
  note: noteSchema,
  walletId: idSchema.optional(),
});
export type CreateContributionInput = z.input<typeof createContributionSchema>;
