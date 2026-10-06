import type { ReactNode } from 'react';
import { useId } from 'react';
import { cn } from '../../lib/cn';

/** Grid pilihan tunggal (radio native) untuk warna atau ikon; tiap opsi wajib punya label teks. */
export function ChoiceGrid<T extends string>({
  legend,
  options,
  value,
  onChange,
  render,
  className,
}: {
  legend: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  render: (value: T, selected: boolean) => ReactNode;
  className?: string;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-fg">{legend}</legend>
      <div className={cn('flex flex-wrap gap-2', className)}>
        {options.map((opt) => (
          <label
            key={opt.value}
            title={opt.label}
            className={cn(
              'flex size-11 cursor-pointer items-center justify-center rounded-control border-2 border-transparent',
              'has-checked:border-fg has-focus-visible:outline-2 has-focus-visible:outline-primary',
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            <span className="sr-only">{opt.label}</span>
            {render(opt.value, value === opt.value)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
