import { z } from 'zod';
import { MAX_AMOUNT, WALLET_TYPES } from '../constants';

/** Sampel dataset ketikan cepat dihapus otomatis setelah sekian hari. */
export const QUICK_TEXT_SAMPLE_RETENTION_DAYS = 90;

const MASKS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]'],
  // Nomor HP Indonesia, boleh dengan spasi/strip: 0812-3456-7890, +62 812 3456 7890.
  [/(?:\+62|62|0)\s?8\d{1,3}(?:[\s-]?\d{3,4}){2}\d{0,3}(?!\d)/g, '[nomor]'],
  // Nomor rekening dengan strip: 123-456-7890.
  [/\d{2,}(?:-\d{2,}){2,}/g, '[nomor]'],
  // Deret angka panjang (rekening, NIK, kartu). Nominal ≥ 10 digit tanpa titik ikut tersamar.
  [/\d{10,}/g, '[nomor]'],
];

/** Samarkan email, nomor HP, dan nomor rekening/kartu dari teks bebas. */
export function maskSensitive(text: string): string {
  return MASKS.reduce((t, [re, label]) => t.replace(re, label), text);
}

const name = z.string().trim().max(60);
const walletRef = z.object({ name, type: z.enum(WALLET_TYPES) }).nullable();

/** Isian transaksi dalam bentuk yang tidak terikat akun (nama, bukan id; tanggal relatif). */
export const quickTextValuesSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  amount: z.number().int().positive().max(MAX_AMOUNT).nullable(),
  /** Selisih hari terhadap hari input (0 = hari ini, -1 = kemarin). */
  dateOffset: z.number().int().min(-400).max(400),
  wallet: walletRef,
  toWallet: walletRef,
  category: name.nullable(),
  note: z.string().trim().max(200),
});
export type QuickTextValues = z.infer<typeof quickTextValuesSchema>;

export const QUICK_TEXT_VALUE_FIELDS = [
  'type',
  'amount',
  'dateOffset',
  'wallet',
  'toWallet',
  'category',
  'note',
] as const satisfies ReadonlyArray<keyof QuickTextValues>;
export type QuickTextValueField = (typeof QUICK_TEXT_VALUE_FIELDS)[number];

export const quickTextSampleSchema = z.object({
  text: z.string().trim().min(1).max(200),
  parsed: quickTextValuesSchema,
  final: quickTextValuesSchema,
});
export type QuickTextSampleInput = z.infer<typeof quickTextSampleSchema>;

export const quickTextSharingSchema = z.object({ enabled: z.boolean() });

/** Isian yang berbeda antara hasil parser dan yang disimpan pengguna. */
export function correctedFields(parsed: QuickTextValues, final: QuickTextValues) {
  return QUICK_TEXT_VALUE_FIELDS.filter(
    (f) => JSON.stringify(parsed[f]) !== JSON.stringify(final[f]),
  );
}
