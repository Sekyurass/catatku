import type { ImportBatchDTO, ImportParseOptions, ImportPreviewDTO } from '@catatku/shared';
import { useQueryClient } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImportHistory } from '../components/import/ImportHistory';
import { ImportMapStep } from '../components/import/ImportMapStep';
import { ImportResultStep } from '../components/import/ImportResultStep';
import { ImportReviewStep } from '../components/import/ImportReviewStep';
import { ImportUploadStep } from '../components/import/ImportUploadStep';
import { StepIndicator } from '../components/import/StepIndicator';
import { Card } from '../components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';
import { api } from '../lib/api';
import { useFeatures } from '../lib/features';
import { detectOptions, type ImportDraft } from '../lib/importFile';
import { invalidateMoney, pickDefaultWallet, queryKeys, useWallets } from '../lib/queries';

const STEPS = ['Unggah', 'Petakan', 'Periksa', 'Hasil'] as const;
type Step = 0 | 1 | 2 | 3;

const STEP_TITLES = ['Pilih file CSV', 'Cocokkan kolom', 'Periksa sebelum impor'];

export function ImportPage() {
  const features = useFeatures();
  const enabled = features.data?.csv_import ?? false;
  const unavailable = features.isSuccess && !enabled;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Impor CSV</h1>
      <p className="-mt-2 text-sm text-muted">
        Pindahkan catatan dari Excel, Google Sheets, atau aplikasi lain sekaligus. Bisa dibatalkan
        kapan saja dari riwayat impor.
      </p>
      {features.isError ? (
        <Card>
          <ErrorState message={features.error.message} onRetry={() => void features.refetch()} />
        </Card>
      ) : unavailable ? (
        <Card>
          <EmptyState
            icon={FileUp}
            title="Fitur belum tersedia"
            description="Impor CSV belum aktif untuk akunmu."
            action={
              <Link
                to="/"
                className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 text-sm font-semibold text-on-primary hover:bg-primary-hover"
              >
                Kembali ke Beranda
              </Link>
            }
          />
        </Card>
      ) : features.isPending ? (
        <div role="status" aria-busy="true" aria-label="Memuat halaman impor">
          <Skeleton className="h-64" />
        </div>
      ) : (
        <ImportWizard />
      )}
    </div>
  );
}

function ImportWizard() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const wallets = useWallets();
  const [step, setStep] = useState<Step>(0);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [options, setOptions] = useState<ImportParseOptions | null>(null);
  const [walletId, setWalletId] = useState('');
  const [preview, setPreview] = useState<ImportPreviewDTO | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [batch, setBatch] = useState<ImportBatchDTO | null>(null);
  const [busy, setBusy] = useState(false);
  // Satu kunci per hasil pemeriksaan: klik ganda / kirim ulang tidak mengimpor dua kali.
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  const selectedWallet = walletId || pickDefaultWallet(wallets.data ?? [])?.id || '';
  const walletName = wallets.data?.find((w) => w.id === selectedWallet)?.name ?? '';

  useEffect(() => {
    if (mounted.current && step < 3) headingRef.current?.focus();
    mounted.current = true;
  }, [step]);

  const restart = () => {
    setDraft(null);
    setOptions(null);
    setPreview(null);
    setBatch(null);
    setSkipDuplicates(true);
    setStep(0);
  };

  const changeOptions = (next: ImportParseOptions) => {
    // Judul kolom berubah arti saat baris pertama dianggap data (atau sebaliknya): tebak ulang.
    setOptions(
      draft && options && next.hasHeader !== options.hasHeader
        ? detectOptions(draft.rows, next.hasHeader)
        : next,
    );
  };

  const request = () => ({
    ...options!,
    filename: draft!.filename,
    walletId: selectedWallet,
    csv: draft!.csv,
  });

  const showError = (err: unknown, fallback: string) =>
    toast({ message: err instanceof Error ? err.message : fallback, tone: 'error' });

  const check = async () => {
    setBusy(true);
    try {
      const result = await api<ImportPreviewDTO>('/imports/preview', {
        method: 'POST',
        body: request(),
      });
      setPreview(result);
      setSkipDuplicates(true);
      setIdempotencyKey(crypto.randomUUID());
      setStep(2);
    } catch (err) {
      showError(err, 'Gagal memeriksa file.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const result = await api<ImportBatchDTO>('/imports', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: { ...request(), skipDuplicates },
      });
      setBatch(result);
      setStep(3);
      queryClient.setQueryData<ImportBatchDTO[]>(queryKeys.imports, (old) =>
        old ? [result, ...old.filter((b) => b.id !== result.id)] : old,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.imports });
      if (result.status === 'COMPLETED') void invalidateMoney(queryClient);
    } catch (err) {
      showError(err, 'Gagal mengimpor.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="flex flex-col gap-5">
        <StepIndicator steps={STEPS} current={step} />
        {step < 3 && (
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
            {STEP_TITLES[step]}
          </h2>
        )}
        {step === 0 && (
          <ImportUploadStep
            onLoaded={(d) => {
              setDraft(d);
              setOptions(d.options);
              setStep(1);
            }}
          />
        )}
        {step === 1 && draft && options && (
          <ImportMapStep
            draft={draft}
            options={options}
            onOptionsChange={changeOptions}
            walletId={selectedWallet}
            onWalletChange={setWalletId}
            onChangeFile={restart}
            onNext={() => void check()}
            checking={busy}
          />
        )}
        {step === 2 && preview && (
          <ImportReviewStep
            preview={preview}
            walletName={walletName}
            skipDuplicates={skipDuplicates}
            onSkipChange={setSkipDuplicates}
            onBack={() => setStep(1)}
            onSubmit={() => void submit()}
            submitting={busy}
          />
        )}
        {step === 3 && batch && <ImportResultStep batch={batch} onRestart={restart} />}
      </Card>
      {step === 0 && <ImportHistory />}
    </>
  );
}
