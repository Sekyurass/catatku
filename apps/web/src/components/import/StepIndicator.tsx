import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

export function StepIndicator({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="flex items-start gap-1" aria-label="Langkah impor">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={label}
            aria-current={active ? 'step' : undefined}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center"
          >
            <span className="flex w-full items-center">
              <span
                aria-hidden
                className={cn(
                  'h-0.5 flex-1',
                  i === 0 ? 'invisible' : done || active ? 'bg-primary' : 'bg-line',
                )}
              />
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                  done && 'bg-primary text-on-primary',
                  active && 'bg-primary-soft text-primary ring-2 ring-primary',
                  !done && !active && 'bg-surface-muted text-muted',
                )}
              >
                {done ? <Check className="size-4" strokeWidth={3} aria-hidden /> : i + 1}
                <span className="sr-only">{done ? ' (selesai)' : ''}</span>
              </span>
              <span
                aria-hidden
                className={cn(
                  'h-0.5 flex-1',
                  i === steps.length - 1 ? 'invisible' : done ? 'bg-primary' : 'bg-line',
                )}
              />
            </span>
            <span className={cn('text-xs', active ? 'font-semibold text-fg' : 'text-muted')}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
