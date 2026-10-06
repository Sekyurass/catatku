import { z } from 'zod';
import { MAX_AMOUNT } from '../constants';
import { DATE_REGEX, MONTH_REGEX } from '../month';

export const idSchema = z.string().min(1).max(64);

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, { error: 'Warna harus format hex, mis. #0F766E' });

/** Nominal positif dalam Rupiah utuh. Tanda (+/−) diberikan oleh server. */
export const amountSchema = z
  .number({ error: 'Jumlah wajib diisi' })
  .int({ error: 'Jumlah harus bilangan bulat Rupiah' })
  .positive({ error: 'Jumlah harus lebih dari 0' })
  .max(MAX_AMOUNT, { error: 'Jumlah terlalu besar' });

export const dateSchema = z.string().regex(DATE_REGEX, { error: 'Format tanggal YYYY-MM-DD' });

export const monthSchema = z.string().regex(MONTH_REGEX, { error: 'Format bulan YYYY-MM' });

export const noteSchema = z
  .string()
  .trim()
  .max(200, { error: 'Catatan maksimal 200 karakter' })
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();
