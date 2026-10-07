import { cn } from '../../lib/cn';

/** Satu angka ringkasan impor; dipakai di dalam `<dl>`. */
export function ImportStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'ok' | 'bad';
}) {
  return (
    <div className="flex flex-col-reverse rounded-control bg-surface-muted px-2 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={cn(
          'text-xl font-bold tabular',
          tone === 'ok' && 'text-income-text',
          tone === 'bad' && 'text-expense-text',
        )}
      >
        {value.toLocaleString('id-ID')}
      </dd>
    </div>
  );
}
