import { z } from 'zod';
import { CATEGORY_ICONS, CATEGORY_TYPES } from '../constants';
import { hexColorSchema } from './common';

const categoryName = z
  .string({ error: 'Nama kategori wajib diisi' })
  .trim()
  .min(1, { error: 'Nama kategori wajib diisi' })
  .max(30, { error: 'Nama kategori maksimal 30 karakter' });

export const createCategorySchema = z.object({
  name: categoryName,
  type: z.enum(CATEGORY_TYPES, { error: 'Tipe kategori tidak valid' }),
  icon: z.enum(CATEGORY_ICONS, { error: 'Ikon tidak tersedia' }).default('circle-ellipsis'),
  color: hexColorSchema.default('#64748B'),
});
export type CreateCategoryInput = z.input<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object({
    name: categoryName,
    icon: z.enum(CATEGORY_ICONS),
    color: hexColorSchema,
  })
  .partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const listCategoriesQuery = z.object({
  type: z.enum(CATEGORY_TYPES).optional(),
});
