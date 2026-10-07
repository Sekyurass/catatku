import type { ImportBatchDTO } from '@catatku/shared';
import { AlertCircle, CheckCircle2, Loader2, Undo2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useImportBatch, useInvalidateMoney } from '../../lib/queries';
import { Button } from '../ui/Button';
import { ImportIssues } from './ImportIssues';
import { ImportStat } from './ImportStat';
import { RollbackImportButton } from './RollbackImportButton';

const linkClass =
  'inline-flex min-h-12 items-center justify-center rounded-control bg-primary px-6 text-base font-semibold text-on-primary hover:bg-primary-hover';

export function ImportResultStep({
  batch: initial,
  onRestart,
}: {
  batch: ImportBatchDTO;
  onRestart: () => void;
}) {
  const query = useImportBatch(initial);
  const batch = query.data;
  const invalidate = useInvalidateMoney();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wasProcessing = useRef(initial.status === 'PROCESSING');

  useEffect(() => {
    if (wasProcessing.current && batch.status !== 'PROCESSING') {
      wasProcessing.current = false;
      if (batch.status === 'COMPLETED') void invalidate();
    }
    headingRef.current?.focus();
  }, [batch.status, invalidate]);

  const restart = (
    <Button variant="secondary" size="lg" onClick={onRestart}>
      Impor file lain
    </Button>
  );

  if (batch.status === 'PROCESSING') {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
        <h2 ref={headingRef} tabIndex={-1} className="font-semibold outline-none">
          Sedang mengimpor {batch.filename}…
        </h2>
        <p className="max-w-sm text-sm text-muted">
          File besar diproses di latar belakang. Boleh tinggalkan halaman ini; hasilnya tetap muncul
          di riwayat impor.
        </p>
      </div>
    );
  }

  if (batch.status === 'FAILED') {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="alert">
        <AlertCircle className="size-10 text-expense" aria-hidden />
        <h2 ref={headingRef} tabIndex={-1} className="font-semibold outline-none">
          Impor gagal
        </h2>
        <p className="max-w-sm text-sm text-muted">
          Tidak ada transaksi yang tersimpan. Periksa koneksi lalu coba impor lagi.
        </p>
        <Button size="lg" onClick={onRestart}>
          Coba lagi
        </Button>
      </div>
    );
  }

  const { stats } = batch;
  const rolledBack = batch.status === 'ROLLED_BACK';
  const totalIssues = stats.skipped + stats.failed;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 text-center">
        {rolledBack ? (
          <Undo2 className="size-10 text-muted" aria-hidden />
        ) : (
          <CheckCircle2 className="size-10 text-income" aria-hidden />
        )}
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
          {rolledBack ? 'Impor dibatalkan' : 'Impor selesai'}
        </h2>
        <p className="text-sm text-muted">
          {rolledBack
            ? `Transaksi dari ${batch.filename} sudah dihapus.`
            : `${stats.imported.toLocaleString('id-ID')} transaksi masuk ke dompet ${batch.wallet.name}.`}
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <ImportStat label="Berhasil" value={stats.imported} tone="ok" />
        <ImportStat label="Dilewati" value={stats.skipped} />
        <ImportStat label="Gagal" value={stats.failed} tone={stats.failed ? 'bad' : undefined} />
      </dl>

      {totalIssues > 0 && (
        <section aria-labelledby="hasil-bermasalah" className="flex flex-col gap-2">
          <h3 id="hasil-bermasalah" className="text-sm font-semibold">
            Baris yang tidak diimpor
          </h3>
          <ImportIssues issues={batch.issues} totalIssues={totalIssues} />
        </section>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {!rolledBack && <RollbackImportButton batch={batch} className="min-h-12" />}
        {restart}
        {!rolledBack && (
          <Link to="/transaksi" className={linkClass}>
            Lihat transaksi
          </Link>
        )}
      </div>
    </div>
  );
}
