import { cn } from '../../lib/cn';

/** Bar progres; `ratio` boleh > 1 (ditampilkan penuh), nilainya tetap dibacakan apa adanya. */
export function ProgressBar({
  ratio,
  label,
  barClassName,
  className,
}: {
  ratio: number;
  label: string;
  barClassName?: string;
  className?: string;
}) {
  const percent = Math.round(ratio * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(percent, 100)}
      aria-valuetext={`${percent}%`}
      className={cn('h-2 overflow-hidden rounded-full bg-surface-muted', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500 ease-out', barClassName)}
        style={{ width: `${Math.min(Math.max(ratio, 0), 1) * 100}%` }}
      />
    </div>
  );
}
