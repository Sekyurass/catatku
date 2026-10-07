import type {
  CategoryDTO,
  QuickTextResult,
  QuickTextValues,
  TransactionType,
  WalletDTO,
} from '@catatku/shared';

export interface SampleSource {
  type: TransactionType;
  amount: number | null;
  date: string | null;
  walletId: string | null;
  toWalletId: string | null;
  categoryId: string | null;
  note: string;
}

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/** Bentuk sampel dataset: nama (bukan id) dan tanggal relatif, supaya tidak terikat akun. */
export function toSampleValues(
  v: SampleSource,
  ctx: { today: string; wallets: WalletDTO[]; categories: CategoryDTO[] },
): QuickTextValues {
  const wallet = (id: string | null) => {
    const w = id ? ctx.wallets.find((x) => x.id === id) : undefined;
    return w ? { name: w.name, type: w.type } : null;
  };
  const transfer = v.type === 'TRANSFER';
  return {
    type: v.type,
    amount: v.amount && v.amount > 0 ? v.amount : null,
    dateOffset: v.date ? dayNumber(v.date) - dayNumber(ctx.today) : 0,
    wallet: wallet(v.walletId),
    toWallet: transfer ? wallet(v.toWalletId) : null,
    category: transfer ? null : (ctx.categories.find((c) => c.id === v.categoryId)?.name ?? null),
    note: v.note.trim(),
  };
}

export function parsedSource(r: QuickTextResult): SampleSource {
  return {
    type: r.type,
    amount: r.amount,
    date: r.date,
    walletId: r.walletId,
    toWalletId: r.toWalletId,
    categoryId: r.categoryId,
    note: r.note,
  };
}
