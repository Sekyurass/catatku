import { Eye, EyeOff } from 'lucide-react';
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

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(inputClass, className)} {...props} />;
  },
);

export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn(inputClass, 'pr-12', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-fg"
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
  },
);
