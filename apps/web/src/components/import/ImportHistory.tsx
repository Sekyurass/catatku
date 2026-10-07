import type { ImportBatchDTO, ImportStatus } from '@catatku/shared';
import { FileText } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useImports } from '../../lib/queries';
import { Card } from '../ui/Card';
import { ErrorState, Skeleton } from '../ui/States';
import { RollbackImportButton } from './RollbackImportButton';

const STATUS: Record<ImportStatus, { label: string; className: string }> = {
  PROCESSING: { label: 'Diproses', className: 'bg-primary-soft text-primary' },
  COMPLETED: { label: 'Selesai', className: 'bg-surface-muted text-income-text' },
  FAILED: { label: 'Gagal', className: 'bg-expense-soft text-expense-text' },
  ROLLED_BACK: { label: 'Dibatalkan', className: 'bg-surface-muted text-muted' },
};

const dateTime = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function ImportHistory() {
  const imports = useImports();

  return (
    <section aria-labelledby="riwayat-impor" className="flex flex-col gap-2">
      <h2 id="riwayat-impor" className="font-semibold">
        Riwayat impor
      </h2>
      {imports.isPending ? (
        <div role="status" aria-busy="true" aria-label="Memuat riwayat impor">
          <Skeleton className="h-20" />
        </div>
      ) : imports.isError ? (
        <Card>
          <ErrorState message={imports.error.message} onRetry={() => void imports.refetch()} />
        </Card>
      ) : imports.data.length === 0 ? (
        <p className="text-sm text-muted">Belum pernah mengimpor.</p>
      ) : (
        <Card className="p-1">
          <ul>
            {imports.data.map((batch) => (
              <HistoryRow key={batch.id} batch={batch} />
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function HistoryRow({ batch }: { batch: ImportBatchDTO }) {
  const status = STATUS[batch.status];
  const { stats } = batch;
  return (
    <li className="flex flex-col gap-2 border-b border-line px-2 py-3 last:border-b-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <FileText className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="truncate font-medium">{batch.filename}</span>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                status.className,
              )}
            >
              {status.label}
            </span>
          </p>
          <p className="text-sm text-muted">
            {dateTime.format(new Date(batch.createdAt))} · {batch.wallet.name}
          </p>
          {(batch.status === 'COMPLETED' || batch.status === 'ROLLED_BACK') && (
            <p className="text-sm text-muted tabular">
              {stats.imported.toLocaleString('id-ID')} berhasil
              {stats.skipped > 0 && ` · ${stats.skipped.toLocaleString('id-ID')} dilewati`}
              {stats.failed > 0 && ` · ${stats.failed.toLocaleString('id-ID')} gagal`}
            </p>
          )}
        </div>
      </div>
      {batch.status === 'COMPLETED' && (
        <RollbackImportButton batch={batch} className="self-end sm:self-center" />
      )}
    </li>
  );
}
