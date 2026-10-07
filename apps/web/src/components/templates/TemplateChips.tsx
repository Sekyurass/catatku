import { formatRupiah, type TransactionTemplateDTO } from '@catatku/shared';
import { LoaderCircle } from 'lucide-react';
import { cn } from '../../lib/cn';
import { categoryIcon } from '../../lib/icons';
import { IconBadge } from '../IconBadge';

/** Deretan chip yang bisa digeser horizontal; satu chip = satu template. */
export function TemplateChips({
  templates,
  onPick,
  busyId,
  label = 'Cepat catat',
  className,
}: {
  templates: TransactionTemplateDTO[];
  onPick: (template: TransactionTemplateDTO) => void;
  busyId?: string | null;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        '-mx-1 flex snap-x gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none]',
        className,
      )}
    >
      {templates.map((t) => {
        const busy = busyId === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            disabled={busyId != null}
            aria-busy={busy || undefined}
            className={cn(
              'flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3.5 pl-1 text-sm transition-[transform,background-color] duration-150',
              'hover:bg-surface-muted active:scale-95 disabled:cursor-wait',
              busyId != null && !busy && 'opacity-60',
            )}
          >
            {busy ? (
              <span className="flex size-8 items-center justify-center" aria-hidden>
                <LoaderCircle className="size-4 animate-spin text-primary" />
              </span>
            ) : (
              <IconBadge icon={categoryIcon(t.category.icon)} color={t.category.color} size="sm" />
            )}
            <span className="font-medium whitespace-nowrap">{t.name}</span>
            <span
              className={cn(
                'tabular whitespace-nowrap',
                t.amount === null ? 'text-muted' : 'font-semibold',
                t.amount !== null &&
                  (t.type === 'EXPENSE' ? 'text-expense-text' : 'text-income-text'),
              )}
            >
              {t.amount === null ? 'isi nominal' : formatRupiah(t.amount)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
