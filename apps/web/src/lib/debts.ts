import { type DebtDTO, type DebtProgress, debtProgress, formatRupiah } from '@catatku/shared';
import { formatShortDate, today } from './format';

export const DEBT_COLOR = '#B45309';

export function debtProgressOf(debt: DebtDTO): DebtProgress {
  return debtProgress({
    total: debt.total,
    installments: debt.installments,
    firstDueDate: debt.firstDueDate,
    dueDate: debt.dueDate,
    paid: debt.paid,
    today: today(),
  });
}

export const directionLabel = (debt: Pick<DebtDTO, 'direction'>) =>
  debt.direction === 'PAYABLE' ? 'Utang' : 'Piutang';

/** "Utang ke Budi" / "Piutang dari Sari". */
export const debtTitle = (debt: Pick<DebtDTO, 'direction' | 'counterparty'>) =>
  debt.direction === 'PAYABLE'
    ? `Utang ke ${debt.counterparty}`
    : `Piutang dari ${debt.counterparty}`;

/** Baris status singkat untuk kartu: angsuran berikutnya, tunggakan, atau lunas. */
export function nextDueLine(debt: DebtDTO, p: DebtProgress): { text: string; overdue: boolean } {
  if (p.settled) return { text: 'Lunas', overdue: false };
  const n = debt.installments ?? 1;
  const next = p.next;
  if (!next) return { text: 'Lunas', overdue: false };
  const which = n > 1 ? `Cicilan ${next.index + 1}/${n}` : 'Sisa';
  const amount = formatRupiah(next.amount - next.paid);
  if (!next.dueDate) return { text: `${which} ${amount}, tanpa jatuh tempo`, overdue: false };
  if (next.overdue) {
    return {
      text: `${which} ${amount} lewat jatuh tempo ${formatShortDate(next.dueDate)}`,
      overdue: true,
    };
  }
  return {
    text: `${which} ${amount} jatuh tempo ${formatShortDate(next.dueDate)}`,
    overdue: false,
  };
}
