import type { ImportPreviewDTO } from '@catatku/shared';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { ImportIssues } from './ImportIssues';
import { ImportStat } from './ImportStat';

export function ImportReviewStep({
  preview,
  walletName,
  skipDuplicates,
  onSkipChange,
  onBack,
  onSubmit,
  submitting,
}: {
  preview: ImportPreviewDTO;
  walletName: string;
  skipDuplicates: boolean;
  onSkipChange: (skip: boolean) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const { stats } = preview;
  const count = stats.ready + (skipDuplicates ? 0 : stats.duplicates);
  const issues = skipDuplicates
    ? preview.issues
    : preview.issues.filter((i) => i.kind !== 'DUPLICATE');
  const totalIssues = stats.failed + (skipDuplicates ? stats.duplicates : 0);

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <ImportStat label="Siap diimpor" value={stats.ready} tone="ok" />
        <ImportStat label="Duplikat" value={stats.duplicates} />
        <ImportStat label="Gagal" value={stats.failed} tone={stats.failed ? 'bad' : undefined} />
      </dl>

      {stats.duplicates > 0 && (
        <Checkbox
          checked={skipDuplicates}
          onChange={onSkipChange}
          label={`Lewati ${stats.duplicates} baris duplikat (disarankan)`}
          description="Tanggal, jumlah, dan catatannya sama dengan transaksi yang sudah ada di dompet ini."
        />
      )}

      {totalIssues > 0 && (
        <section aria-labelledby="baris-bermasalah" className="flex flex-col gap-2">
          <h3 id="baris-bermasalah" className="text-sm font-semibold">
            Baris yang tidak diimpor
          </h3>
          <ImportIssues issues={issues} totalIssues={totalIssues} />
        </section>
      )}

      <p className="text-sm text-muted">
        {count > 0
          ? `${count.toLocaleString('id-ID')} transaksi akan dicatat ke dompet ${walletName}. Bisa dibatalkan sekaligus setelahnya.`
          : 'Tidak ada baris yang bisa diimpor. Periksa lagi pemetaan kolom dan formatnya.'}
      </p>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" size="lg" onClick={onBack} disabled={submitting}>
          Kembali
        </Button>
        <Button size="lg" onClick={onSubmit} loading={submitting} disabled={count === 0}>
          Impor {count.toLocaleString('id-ID')} transaksi
        </Button>
      </div>
    </div>
  );
}
