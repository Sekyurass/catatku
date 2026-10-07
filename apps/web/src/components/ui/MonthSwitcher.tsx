import { currentMonth, shiftMonth } from '@catatku/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatMonthLabel } from '../../lib/format';

export function MonthSwitcher({
  month,
  onChange,
}: {
  month: string;
  onChange: (m: string) => void;
}) {
  const isCurrent = month === currentMonth();
  return (
    <div className="flex items-center gap-1 rounded-control border border-line bg-surface p-1">
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, -1))}
        className="flex size-11 items-center justify-center rounded-control text-muted hover:bg-surface-muted hover:text-fg"
        aria-label="Bulan sebelumnya"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onChange(currentMonth())}
        disabled={isCurrent}
        className="min-h-11 min-w-36 rounded-control px-3 text-sm font-semibold enabled:hover:bg-surface-muted"
        title={isCurrent ? undefined : 'Kembali ke bulan ini'}
        aria-live="polite"
      >
        {formatMonthLabel(month)}
      </button>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, 1))}
        className="flex size-11 items-center justify-center rounded-control text-muted hover:bg-surface-muted hover:text-fg"
        aria-label="Bulan berikutnya"
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>
    </div>
  );
}
