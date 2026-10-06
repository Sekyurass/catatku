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
