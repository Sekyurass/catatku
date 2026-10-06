import { useId } from 'react';
import { cn } from '../../lib/cn';

interface Option<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

/** Pilihan tunggal bergaya tab, memakai radio native (panah kiri/kanan untuk berpindah). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const name = useId();
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className="sr-only">{label}</legend>
      <div
        className="grid gap-1 rounded-control bg-surface-muted p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              'flex min-h-10 cursor-pointer items-center justify-center rounded-[10px] px-2 text-sm font-semibold text-muted',
              'has-checked:bg-surface has-checked:text-fg has-checked:shadow-card',
              'has-focus-visible:outline-2 has-focus-visible:outline-primary',
              'has-disabled:cursor-not-allowed has-disabled:opacity-50',
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              disabled={opt.disabled}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
