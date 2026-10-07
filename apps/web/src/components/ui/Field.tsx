import { Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes, type ReactNode, useId, useState } from 'react';
import { cn } from '../../lib/cn';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: (props: {
    id: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
  className?: string;
}

/** Label + pesan error/petunjuk yang terhubung ke input lewat aria. */
export function Field({ label, error, hint, children, className }: FieldProps) {
  const id = useId();
  const descId = error || hint ? `${id}-desc` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': descId })}
      {error ? (
        <p id={descId} className="text-sm text-expense-text" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={descId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  'min-h-11 w-full rounded-control border border-line bg-surface px-3 text-base text-fg placeholder:text-muted/70 ' +
  'aria-[invalid=true]:border-expense focus-visible:border-primary';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Ikon dekoratif di kiri input. */
  icon?: LucideIcon;
};

function LeadingIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <Icon
      className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted"
      aria-hidden
    />
  );
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, icon, ...props },
  ref,
) {
  const input = (
    <input ref={ref} className={cn(inputClass, icon && 'pl-11', className)} {...props} />
  );
  if (!icon) return input;
  return (
    <div className="relative">
      <LeadingIcon icon={icon} />
      {input}
    </div>
  );
});

export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(function PasswordInput(
  { className, icon, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      {icon && <LeadingIcon icon={icon} />}
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={cn(inputClass, 'pr-12', icon && 'pl-11', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute top-1/2 right-0.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-control text-muted hover:text-fg"
        aria-label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
      >
        {visible ? (
          <EyeOff className="size-5" aria-hidden />
        ) : (
          <Eye className="size-5" aria-hidden />
        )}
      </button>
    </div>
  );
});
