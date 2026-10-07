import { currentMonth, shiftMonth } from '@catatku/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatMonthLabel, formatMonthShort } from '../../lib/format';

/** `compact`: label "Okt 2026" supaya muat sebaris dengan judul halaman di HP sempit. */
export function MonthSwitcher({
  month,
  onChange,
  compact = false,
}: {
  month: string;
  onChange: (m: string) => void;
  compact?: boolean;
}) {
  const isCurrent = month === currentMonth();
  const arrow =
    'flex size-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-surface-muted hover:text-fg';
  return (
    <div
      className={cn(
        'flex shrink-0 items-center rounded-control border border-line bg-surface p-1',
        compact ? 'gap-0.5' : 'gap-1',
      )}
    >
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, -1))}
        className={arrow}
        aria-label="Bulan sebelumnya"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onChange(currentMonth())}
        disabled={isCurrent}
        className={cn(
          'min-h-11 rounded-control text-sm font-semibold whitespace-nowrap enabled:hover:bg-surface-muted',
          compact ? 'min-w-20 px-1.5' : 'min-w-36 px-3',
        )}
        title={isCurrent ? undefined : 'Kembali ke bulan ini'}
        aria-live="polite"
      >
        {compact ? (
          <>
            <span aria-hidden>
              {formatMonthShort(month)} {month.slice(0, 4)}
            </span>
            <span className="sr-only">{formatMonthLabel(month)}</span>
          </>
        ) : (
          formatMonthLabel(month)
        )}
      </button>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, 1))}
        className={arrow}
        aria-label="Bulan berikutnya"
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>
    </div>
  );
}
