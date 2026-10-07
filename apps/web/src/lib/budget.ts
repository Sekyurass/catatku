import { type BudgetDTO, formatRupiah } from '@catatku/shared';
import { CircleCheck, type LucideIcon, OctagonAlert, TriangleAlert } from 'lucide-react';

type Status = BudgetDTO['status'];

/** Warna selalu disertai ikon + teks agar status tidak hanya dibedakan lewat warna. */
export const BUDGET_STATUS: Record<
  Status,
  { label: string; icon: LucideIcon; bar: string; text: string; badge: string }
> = {
  ok: {
    label: 'Aman',
    icon: CircleCheck,
    bar: 'bg-income',
    text: 'text-income-text',
    badge: 'bg-income/10 text-income-badge',
  },
  warning: {
    label: 'Hampir habis',
    icon: TriangleAlert,
    bar: 'bg-warning',
    text: 'text-warning-text',
    badge: 'bg-warning/15 text-warning-badge',
  },
  over: {
    label: 'Terlampaui',
    icon: OctagonAlert,
    bar: 'bg-expense',
    text: 'text-expense-text',
    badge: 'bg-expense/10 text-expense-badge',
  },
};

/** "Sisa Rp 150.000" atau "Lewat Rp 60.000". */
export function remainingLabel(remaining: number): string {
  return remaining >= 0 ? `Sisa ${formatRupiah(remaining)}` : `Lewat ${formatRupiah(-remaining)}`;
}

/** Persen dibulatkan ke bawah agar 99,9% tidak tampil sebagai 100%. */
export function budgetPercent(ratio: number): number {
  return Math.floor(ratio * 100);
}

/** Kalimat peringatan netral, mis. "Anggaran Makan sudah 85%, sisa Rp 150.000." */
export function budgetMessage(item: Pick<BudgetDTO, 'category' | 'ratio' | 'remaining'>): string {
  const name = item.category.name;
  if (item.remaining < 0) return `Anggaran ${name} terlampaui ${formatRupiah(-item.remaining)}.`;
  if (item.remaining === 0) return `Anggaran ${name} sudah habis.`;
  return `Anggaran ${name} sudah ${budgetPercent(item.ratio)}%, sisa ${formatRupiah(item.remaining)}.`;
}
