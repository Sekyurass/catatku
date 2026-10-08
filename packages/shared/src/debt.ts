import { DEBT_REMIND_DAYS } from './constants';
import { occurrenceDate } from './recurrence';

export type DebtItemStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

export interface DebtScheduleItem {
  /** 0-based; tampilkan sebagai `index + 1`. */
  index: number;
  amount: number;
  /** null = tanpa jatuh tempo. */
  dueDate: string | null;
  /** Bagian dari `amount` yang sudah tertutup pembayaran. */
  paid: number;
  status: DebtItemStatus;
  overdue: boolean;
}

export interface DebtProgressInput {
  /** Pokok + bunga/biaya total. */
  total: number;
  /** null = sekali bayar (jatuh tempo `dueDate`). */
  installments: number | null;
  firstDueDate: string | null;
  dueDate: string | null;
  paid: number;
  today: string;
}

export interface DebtProgress {
  remaining: number;
  /** 0–1, untuk lebar bilah progres. */
  ratio: number;
  settled: boolean;
  schedule: DebtScheduleItem[];
  /** Angsuran pertama yang belum lunas; null bila sudah lunas semua. */
  next: DebtScheduleItem | null;
  /** Sisa tagihan dari angsuran yang sudah lewat jatuh tempo. */
  overdueAmount: number;
}

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/**
 * Jadwal angsuran: total dibagi rata per bulan sejak `firstDueDate`, sisa pembagian ditanggung
 * angsuran terakhir. Pembayaran dialokasikan berurutan dari angsuran pertama, jadi bayar lebih
 * awal/lebih banyak langsung menutup angsuran berikutnya.
 */
export function debtSchedule(
  total: number,
  installments: number | null,
  firstDueDate: string | null,
  dueDate: string | null,
): { index: number; amount: number; dueDate: string | null }[] {
  if (!installments || installments <= 1 || !firstDueDate) {
    return [{ index: 0, amount: total, dueDate: installments === 1 ? firstDueDate : dueDate }];
  }
  const base = Math.floor(total / installments);
  return Array.from({ length: installments }, (_, i) => ({
    index: i,
    amount: i === installments - 1 ? total - base * (installments - 1) : base,
    dueDate: occurrenceDate({ startDate: firstDueDate, frequency: 'MONTHLY', interval: 1 }, i),
  }));
}

export function debtProgress(input: DebtProgressInput): DebtProgress {
  const { total, today } = input;
  const paidTotal = Math.max(0, input.paid);
  let left = paidTotal;
  let overdueAmount = 0;
  const schedule = debtSchedule(total, input.installments, input.firstDueDate, input.dueDate).map(
    (item): DebtScheduleItem => {
      const paid = Math.min(item.amount, left);
      left -= paid;
      const status: DebtItemStatus = paid >= item.amount ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
      const overdue = status !== 'PAID' && item.dueDate !== null && item.dueDate < today;
      if (overdue) overdueAmount += item.amount - paid;
      return { ...item, paid, status, overdue };
    },
  );
  const remaining = Math.max(0, total - paidTotal);
  return {
    remaining,
    ratio: total > 0 ? Math.min(1, paidTotal / total) : 1,
    settled: remaining === 0,
    schedule,
    next: schedule.find((s) => s.status !== 'PAID') ?? null,
    overdueAmount,
  };
}

export interface DebtReminder {
  index: number;
  kind: 'soon' | 'overdue';
  dueDate: string;
  /** Sisa tagihan angsuran itu. */
  amount: number;
}

/**
 * Pengingat untuk angsuran berikutnya: "soon" bila jatuh tempo dalam `DEBT_REMIND_DAYS` hari
 * (termasuk hari ini), "overdue" bila sudah lewat. Masing-masing dikirim sekali per angsuran.
 */
export function debtReminder(progress: DebtProgress, today: string): DebtReminder | null {
  const next = progress.next;
  if (!next || next.dueDate === null) return null;
  const days = daysBetween(today, next.dueDate);
  if (days > DEBT_REMIND_DAYS) return null;
  return {
    index: next.index,
    kind: days < 0 ? 'overdue' : 'soon',
    dueDate: next.dueDate,
    amount: next.amount - next.paid,
  };
}
