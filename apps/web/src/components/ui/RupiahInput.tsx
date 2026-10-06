import { parseRupiahInput } from '@catatku/shared';
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { inputClass } from './Field';

const grouped = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> & {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  size?: 'md' | 'lg';
};

/** Input nominal Rupiah: hanya angka, ditampilkan dengan pemisah ribuan ("25.000"). */
export const RupiahInput = forwardRef<HTMLInputElement, Props>(function RupiahInput(
  { value, onChange, size = 'md', className, ...props },
  ref,
) {
  return (
    <div className="relative">
      <span
        className={cn(
          'pointer-events-none absolute inset-y-0 left-3 flex items-center font-semibold text-muted',
          size === 'lg' ? 'text-xl' : 'text-base',
        )}
        aria-hidden
      >
        Rp
      </span>
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value === null || value === undefined ? '' : grouped.format(value)}
        onChange={(e) => onChange(parseRupiahInput(e.target.value))}
        className={cn(
          inputClass,
          'tabular',
          size === 'lg' ? 'min-h-14 pl-12 text-3xl font-bold' : 'pl-10',
          className,
        )}
        {...props}
      />
    </div>
  );
});
