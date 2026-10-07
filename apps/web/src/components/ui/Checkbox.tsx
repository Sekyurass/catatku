import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  className,
  invalid,
  describedBy,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  className?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <label
      className={cn(
        'group flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-1 text-sm',
        'has-focus-visible:outline-2 has-focus-visible:outline-primary',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-md border-2 border-line text-on-primary transition-colors group-has-checked:border-primary group-has-checked:bg-primary',
          invalid && 'border-expense',
        )}
      >
        <Check className="size-3.5 opacity-0 group-has-checked:opacity-100" strokeWidth={3} />
      </span>
      <span>
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-muted">{description}</span>}
      </span>
    </label>
  );
}
