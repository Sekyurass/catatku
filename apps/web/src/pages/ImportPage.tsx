import type {
  ImportBatchDTO,
  ImportParseOptions,
  ImportPreviewDTO,
  StatementPreviewDTO,
} from '@catatku/shared';
import { useQueryClient } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImportHistory } from '../components/import/ImportHistory';
import { ImportMapStep } from '../components/import/ImportMapStep';
import { ImportResultStep } from '../components/import/ImportResultStep';
import { ImportReviewStep } from '../components/import/ImportReviewStep';
import { ImportUploadStep } from '../components/import/ImportUploadStep';
import {
  initialChoices,
  type StatementChoices,
  StatementReviewStep,
} from '../components/import/StatementReviewStep';
import { StatementWalletStep } from '../components/import/StatementWalletStep';
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
const STATEMENT_STEPS = ['Unggah', 'Dompet', 'Rekonsiliasi', 'Hasil'] as const;
const STATEMENT_STEP_TITLES = ['Pilih file CSV', 'Pilih dompet', 'Cocokkan dengan catatanmu'];

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
  const [statementPreview, setStatementPreview] = useState<StatementPreviewDTO | null>(null);
  const [choices, setChoices] = useState<StatementChoices>({});
  const [batch, setBatch] = useState<ImportBatchDTO | null>(null);
  const [busy, setBusy] = useState(false);
  // Satu kunci per hasil pemeriksaan: klik ganda / kirim ulang tidak mengimpor dua kali.
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  const bankWallet = draft?.statement
    ? wallets.data?.find((w) => w.type === 'BANK' && !w.archivedAt)
    : undefined;
  const selectedWallet =
    walletId || bankWallet?.id || pickDefaultWallet(wallets.data ?? [])?.id || '';
  const walletName = wallets.data?.find((w) => w.id === selectedWallet)?.name ?? '';

  useEffect(() => {
    if (mounted.current && step < 3) headingRef.current?.focus();
    mounted.current = true;
  }, [step]);

  const restart = () => {
    setDraft(null);
    setOptions(null);
    setPreview(null);
    setStatementPreview(null);
    setBatch(null);
    setSkipDuplicates(true);
    setStep(0);
  };
  const statement = draft?.statement ?? null;

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

  const statementRequest = () => ({
    filename: draft!.filename,
    walletId: selectedWallet,
    content: draft!.csv,
  });

  const checkStatement = async () => {
    setBusy(true);
    try {
      const result = await api<StatementPreviewDTO>('/imports/statements/preview', {
        method: 'POST',
        body: statementRequest(),
      });
      setStatementPreview(result);
      setChoices(initialChoices(result));
      setIdempotencyKey(crypto.randomUUID());
      setStep(2);
    } catch (err) {
      showError(err, 'Gagal mencocokkan mutasi.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const result = statement
        ? await api<ImportBatchDTO>('/imports/statements', {
            method: 'POST',
            headers: { 'Idempotency-Key': idempotencyKey },
            body: {
              ...statementRequest(),
              rows: Object.entries(choices).map(([line, c]) => ({
                line: Number(line),
                import: c.import,
                ...(c.import && { categoryId: c.categoryId }),
              })),
            },
          })
        : await api<ImportBatchDTO>('/imports', {
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
        <StepIndicator steps={statement ? STATEMENT_STEPS : STEPS} current={step} />
        {step < 3 && (
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
            {(statement ? STATEMENT_STEP_TITLES : STEP_TITLES)[step]}
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
        {step === 1 && draft && statement && (
          <StatementWalletStep
            draft={draft}
            walletId={selectedWallet}
            onWalletChange={setWalletId}
            onChangeFile={restart}
            onNext={() => void checkStatement()}
            checking={busy}
          />
        )}
        {step === 2 && statement && statementPreview && (
          <StatementReviewStep
            preview={statementPreview}
            walletName={walletName}
            choices={choices}
            onChoicesChange={setChoices}
            onBack={() => setStep(1)}
            onSubmit={() => void submit()}
            submitting={busy}
          />
        )}
        {step === 1 && draft && !statement && options && (
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
        {step === 2 && !statement && preview && (
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
