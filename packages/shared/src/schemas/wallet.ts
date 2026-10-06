import { z } from 'zod';
import { MAX_AMOUNT, WALLET_TYPES } from '../constants';
import { hexColorSchema } from './common';

const walletName = z
  .string({ error: 'Nama dompet wajib diisi' })
  .trim()
  .min(1, { error: 'Nama dompet wajib diisi' })
  .max(40, { error: 'Nama dompet maksimal 40 karakter' });

const initialBalance = z
  .number()
  .int({ error: 'Saldo awal harus bilangan bulat Rupiah' })
  .min(-MAX_AMOUNT)
  .max(MAX_AMOUNT);

export const createWalletSchema = z.object({
  name: walletName,
  type: z.enum(WALLET_TYPES, { error: 'Jenis dompet tidak valid' }),
  initialBalance: initialBalance.default(0),
  color: hexColorSchema.default('#0F766E'),
});
export type CreateWalletInput = z.input<typeof createWalletSchema>;

export const updateWalletSchema = z
  .object({
    name: walletName,
    type: z.enum(WALLET_TYPES),
    initialBalance,
    color: hexColorSchema,
    archived: z.boolean(),
  })
  .partial();
export type UpdateWalletInput = z.infer<typeof updateWalletSchema>;
