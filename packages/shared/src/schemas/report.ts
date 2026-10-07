import { z } from 'zod';
import { CATEGORY_TYPES } from '../constants';
import { monthSchema } from './common';

export const reportMonthQuery = z.object({
  month: monthSchema.optional(),
});

export const reportByCategoryQuery = z.object({
  month: monthSchema.optional(),
  type: z.enum(CATEGORY_TYPES).default('EXPENSE'),
});

export const reportTrendQuery = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});

export const reportCompareQuery = z.object({
  /** Bulan pembanding. */
  from: monthSchema,
  /** Bulan yang dilihat. */
  to: monthSchema,
  type: z.enum(CATEGORY_TYPES).default('EXPENSE'),
});

export const reportYearlyQuery = z.object({
  year: z.coerce
    .number({ error: 'Tahun tidak valid' })
    .int({ error: 'Tahun tidak valid' })
    .min(2000, { error: 'Tahun tidak valid' })
    .max(2100, { error: 'Tahun tidak valid' }),
});
