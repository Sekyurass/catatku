import { cn } from '../../lib/cn';

export function Switch({
  id,
  checked,
  onChange,
  disabled,
  describedBy,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <span className="relative inline-flex h-11 w-14 shrink-0 items-center justify-center">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 cursor-pointer opacity-0 disabled:cursor-wait"
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none flex h-7 w-12 items-center rounded-full p-0.5 transition-colors',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary',
          'peer-disabled:opacity-60',
          checked ? 'bg-primary' : 'bg-line',
        )}
      >
        <span
          className={cn(
            'size-6 rounded-full bg-surface shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </span>
  );
}
