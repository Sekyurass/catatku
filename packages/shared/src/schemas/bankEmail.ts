import { z } from 'zod';
import { idSchema } from './common';

export const updateBankEmailSchema = z
  .object({
    enabled: z.boolean().optional(),
    walletId: idSchema.nullable().optional(),
  })
  .refine((v) => v.enabled !== undefined || v.walletId !== undefined, {
    error: 'Tidak ada yang diubah',
  });
export type UpdateBankEmailInput = z.input<typeof updateBankEmailSchema>;

/** Transaksi yang sudah dibuat dari form (pengguna boleh mengubah isinya dulu). */
export const confirmBankEmailSchema = z.object({ transactionId: idSchema });
export type ConfirmBankEmailInput = z.input<typeof confirmBankEmailSchema>;
