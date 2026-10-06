import { BUDGET_WARNING_RATIO } from './constants';
import type { BudgetDTO } from './dto';

/** Hijau < 80%, kuning 80–99%, merah ≥ 100%. Tanpa batas (limit 0) dianggap aman. */
export function budgetStatus(spent: number, limit: number): BudgetDTO['status'] {
  if (limit <= 0) return 'ok';
  const ratio = spent / limit;
  if (ratio >= 1) return 'over';
  if (ratio >= BUDGET_WARNING_RATIO) return 'warning';
  return 'ok';
}
