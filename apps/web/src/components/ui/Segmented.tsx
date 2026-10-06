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
  const n = options.length;
  const index = options.findIndex((opt) => opt.value === value);
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className="sr-only">{label}</legend>
      <div
        className="relative grid gap-1 rounded-control bg-surface-muted p-1"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {index >= 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-1 left-1 rounded-[10px] bg-surface shadow-card transition-transform duration-300 ease-out"
            style={{
              width: `calc((100% - 0.5rem - ${(n - 1) * 0.25}rem) / ${n})`,
              transform: `translateX(calc(${index} * (100% + 0.25rem)))`,
            }}
          />
        )}
        {options.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              'relative flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] px-2 text-sm font-semibold text-muted transition-colors duration-300',
              'has-checked:text-fg',
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
