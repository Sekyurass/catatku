import { z } from 'zod';
import {
  DEBT_COUNTERPARTY_MAX,
  DEBT_DIRECTIONS,
  DEBT_MAX_INSTALLMENTS,
  MAX_AMOUNT,
} from '../constants';
import { amountSchema, dateSchema, idSchema, noteSchema } from './common';

const debtFields = z.object({
  direction: z.enum(DEBT_DIRECTIONS, { error: 'Pilih utang atau piutang' }),
  counterparty: z
    .string({ error: 'Nama pihak wajib diisi' })
    .trim()
    .min(1, { error: 'Nama pihak wajib diisi' })
    .max(DEBT_COUNTERPARTY_MAX, { error: `Nama maksimal ${DEBT_COUNTERPARTY_MAX} karakter` }),
  principal: amountSchema,
  /** Total bunga/biaya selama pinjaman; dibagi rata ke setiap angsuran. */
  interest: z
    .number({ error: 'Bunga harus angka' })
    .int({ error: 'Bunga harus bilangan bulat Rupiah' })
    .min(0, { error: 'Bunga tidak boleh negatif' })
    .max(MAX_AMOUNT, { error: 'Bunga terlalu besar' }),
  startDate: dateSchema,
  /** Untuk sekali bayar; diabaikan bila memakai cicilan. */
  dueDate: dateSchema.nullable(),
  /** null = sekali bayar. */
  installments: z
    .number({ error: 'Tenor harus angka' })
    .int({ error: 'Tenor harus bilangan bulat' })
    .min(1, { error: 'Tenor minimal 1 bulan' })
    .max(DEBT_MAX_INSTALLMENTS, { error: `Tenor maksimal ${DEBT_MAX_INSTALLMENTS} bulan` })
    .nullable(),
  firstDueDate: dateSchema.nullable(),
  note: noteSchema,
  /**
   * Dompet tempat uang pinjaman masuk (utang) / keluar (piutang). null = tidak mengubah saldo,
   * mis. utang lama yang uangnya sudah terpakai.
   */
  walletId: idSchema.nullable(),
});

type DebtDates = {
  startDate?: string;
  dueDate?: string | null;
  installments?: number | null;
  firstDueDate?: string | null;
};

const checkDates = (v: DebtDates, ctx: z.RefinementCtx) => {
  if (v.installments && !v.firstDueDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['firstDueDate'],
      message: 'Isi tanggal angsuran pertama',
    });
  }
  if (!v.startDate) return;
  for (const key of ['dueDate', 'firstDueDate'] as const) {
    const d = v[key];
    if (d && d < v.startDate) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: 'Jatuh tempo tidak boleh sebelum tanggal pinjam',
      });
    }
  }
};

export const createDebtSchema = debtFields
  .extend({
    interest: debtFields.shape.interest.default(0),
    dueDate: debtFields.shape.dueDate.default(null),
    installments: debtFields.shape.installments.default(null),
    firstDueDate: debtFields.shape.firstDueDate.default(null),
    walletId: debtFields.shape.walletId.default(null),
  })
  .superRefine(checkDates);
export type CreateDebtInput = z.input<typeof createDebtSchema>;

/** Arah dan dompet tidak bisa diubah; hapus lalu buat ulang bila salah. */
export const updateDebtSchema = debtFields
  .omit({ direction: true, walletId: true })
  .partial()
  .superRefine(checkDates);
export type UpdateDebtInput = z.input<typeof updateDebtSchema>;

/** `walletId` null = pembayaran tidak mengubah saldo dompet mana pun. */
export const createDebtPaymentSchema = z.object({
  amount: amountSchema,
  date: dateSchema,
  note: noteSchema,
  walletId: idSchema.nullable().default(null),
});
export type CreateDebtPaymentInput = z.input<typeof createDebtPaymentSchema>;
