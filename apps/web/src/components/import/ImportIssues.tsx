import { IMPORT_MAX_ISSUES, type ImportIssue } from '@catatku/shared';
import { AlertTriangle, Copy } from 'lucide-react';
import { cn } from '../../lib/cn';

/** Daftar baris yang tidak diimpor beserta alasannya. */
export function ImportIssues({
  issues,
  totalIssues,
  className,
}: {
  issues: ImportIssue[];
  /** Jumlah sebenarnya; daftar dari server dipotong di IMPORT_MAX_ISSUES. */
  totalIssues: number;
  className?: string;
}) {
  if (issues.length === 0) return null;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <ul className="max-h-64 overflow-y-auto rounded-control border border-line text-sm">
        {issues.map((issue) => (
          <li
            key={`${issue.kind}-${issue.line}`}
            className="flex items-start gap-2 border-b border-line px-3 py-2 last:border-b-0"
          >
            {issue.kind === 'DUPLICATE' ? (
              <Copy className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-expense-text" aria-hidden />
            )}
            <span>
              <span className="font-medium tabular">Baris {issue.line}</span>
              <span className="text-muted"> · {issue.message}</span>
            </span>
          </li>
        ))}
      </ul>
      {totalIssues > issues.length && (
        <p className="text-xs text-muted">
          Menampilkan {IMPORT_MAX_ISSUES} baris pertama dari {totalIssues} baris bermasalah.
        </p>
      )}
    </div>
  );
}
