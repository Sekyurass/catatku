import {
  BANK_EMAIL_MAX_BYTES,
  type BankEmailInboxDTO,
  type BankEmailPendingDTO,
  type BankEmailResult,
  type BankEmailUploadDTO,
  FEATURE_FLAGS,
  formatRupiah,
} from '@catatku/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, FileUp, Inbox, KeyRound, Loader2, Mail, MailCheck, RefreshCw } from 'lucide-react';
import { type ChangeEvent, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuickAdd } from '../components/transactions/QuickAdd';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Field } from '../components/ui/Field';
import { ColorDot, Select } from '../components/ui/Select';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { Switch } from '../components/ui/Switch';
import { useToast } from '../components/ui/Toast';
import { api, ApiError } from '../lib/api';
import { cn } from '../lib/cn';
import { useFeatures } from '../lib/features';
import { formatShortDate } from '../lib/format';
import { formatNotificationTime } from '../lib/notifications';
import { queryKeys, useBankEmail, useBankEmailPending, useWallets } from '../lib/queries';
import { FormAlert } from './auth/AuthLayout';

const RESULT_LABEL: Record<BankEmailResult, string> = {
  parsed: 'Terbaca, menunggu konfirmasi',
  duplicate: 'Sudah pernah masuk',
  unrecognized: 'Bukan email transaksi atau formatnya belum dikenali',
  rejected_signature: 'Ditolak: tanda tangan pengirim tidak valid',
  rejected_recipient: 'Ditolak: email itu bukan dikirim ke emailmu',
  forwarding_code: 'Kode konfirmasi Gmail diterima',
};

const UPLOAD_TOAST: Record<BankEmailResult, { message: string; tone?: 'warning' | 'error' }> = {
  parsed: { message: 'Email terbaca. Cek dan catat di bawah.' },
  duplicate: { message: 'Email ini sudah pernah masuk.', tone: 'warning' },
  unrecognized: {
    message: 'Bukan email transaksi, atau format bank ini belum dikenali.',
    tone: 'warning',
  },
  rejected_signature: {
    message: 'Ditolak: tanda tangan pengirim tidak valid. Unduh ulang email aslinya.',
    tone: 'error',
  },
  rejected_recipient: {
    message: 'Ditolak: email itu bukan dikirim ke email akunmu.',
    tone: 'error',
  },
  forwarding_code: { message: 'Kode konfirmasi Gmail tersimpan.' },
};

export function BankEmailPage() {
  const features = useFeatures();
  const enabled = features.data?.[FEATURE_FLAGS.BANK_EMAIL] ?? false;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Catat dari email bank</h1>
      {features.isError ? (
        <Card>
          <ErrorState message={features.error.message} onRetry={() => void features.refetch()} />
        </Card>
      ) : features.isPending ? (
        <Skeleton className="h-64" />
      ) : !enabled ? (
        <Card>
          <EmptyState
            icon={Mail}
            title="Fitur belum tersedia"
            description="Catat dari email bank belum aktif untuk akunmu."
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
      ) : (
        <BankEmailContent />
      )}
    </div>
  );
}

function BankEmailContent() {
  const inbox = useBankEmail();
  if (inbox.isPending) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Memuat">
        <Skeleton className="h-56" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (inbox.isError) {
    return (
      <Card>
        <ErrorState message={inbox.error.message} onRetry={() => void inbox.refetch()} />
      </Card>
    );
  }
  return (
    <>
      <PendingCard />
      <SetupCard inbox={inbox.data} />
      <UploadCard />
    </>
  );
}

function useRefreshBankEmail() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.bankEmail });
}

function SetupCard({ inbox }: { inbox: BankEmailInboxDTO }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const switchId = useId();
  const wallets = useWallets();
  const [busy, setBusy] = useState<'toggle' | 'wallet' | 'rotate' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const save = async (body: Record<string, unknown>, kind: 'toggle' | 'wallet' | 'rotate') => {
    setBusy(kind);
    setError(null);
    try {
      const next =
        kind === 'rotate'
          ? await api<BankEmailInboxDTO>('/bank-email/address', { method: 'POST' })
          : await api<BankEmailInboxDTO>('/bank-email', { method: 'PUT', body });
      queryClient.setQueryData(queryKeys.bankEmail, next);
      return next;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan. Coba lagi.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!inbox.address) return;
    try {
      await navigator.clipboard.writeText(inbox.address);
      toast({ message: 'Alamat disalin' });
    } catch {
      toast({ message: 'Gagal menyalin. Salin manual alamatnya.', tone: 'error' });
    }
  };

  const walletOptions = [
    { value: '', label: 'Pilih saat mencatat' },
    ...(wallets.data ?? [])
      .filter((w) => !w.archivedAt)
      .map((w) => ({ value: w.id, label: w.name, leading: <ColorDot color={w.color} /> })),
  ];

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={switchId} className="block font-semibold">
            Terima email bank otomatis
          </label>
          <p className="text-sm text-muted">
            Teruskan notifikasi transaksi dari Gmail ke alamat khusus milikmu. Catatku hanya membaca
            nominal, tanggal, dan penerima; isi email tidak disimpan.
          </p>
        </div>
        <Switch
          id={switchId}
          checked={inbox.enabled}
          disabled={busy === 'toggle'}
          onChange={(enabled) => void save({ enabled }, 'toggle')}
        />
      </div>

      <FormAlert message={error} />

      {inbox.enabled && !inbox.receiving && (
        <p className="rounded-control bg-surface-muted p-3 text-sm text-muted">
          Penerimaan otomatis belum disiapkan di server ini. Kamu tetap bisa mengunggah file email
          (.eml) di bawah.
        </p>
      )}

      {inbox.enabled && inbox.address && (
        <>
          <div>
            <p className="mb-1.5 text-sm font-medium">Alamat penerusan kamu</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 rounded-control bg-surface-muted px-3 py-2.5 text-sm break-all">
                {inbox.address}
              </code>
              <Button
                variant="secondary"
                onClick={copy}
                icon={<Copy className="size-4" aria-hidden />}
              >
                Salin
              </Button>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2">
              <p className="text-xs text-muted">
                Rahasiakan alamat ini. Bila tersebar, ganti dengan yang baru.
              </p>
              <Button
                variant="ghost"
                onClick={() => setConfirmRotate(true)}
                icon={<RefreshCw className="size-4" aria-hidden />}
              >
                Ganti alamat
              </Button>
            </div>
          </div>

          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
            <li>
              Di Gmail (versi web): <strong>Setelan</strong> â†’{' '}
              <strong>Penerusan dan POP/IMAP</strong> â†’{' '}
              <strong>Tambahkan alamat penerusan</strong>, lalu tempel alamat di atas.
            </li>
            <li>
              Tekan <strong>Saya sudah menambahkan alamat</strong> di bawah. Kode konfirmasi dari
              Gmail muncul di halaman ini; masukkan kode itu di Gmail.
            </li>
            <li>
              Buat filter: <strong>Dari</strong> berisi alamat bank (mis. <code>bca.co.id</code>)
              â†’ <strong>Teruskan ke</strong> alamat di atas. Email lain tidak ikut terkirim.
            </li>
          </ol>

          {inbox.receiving && <ForwardingCheck inbox={inbox} />}

          {inbox.forwardingCode && (
            <div className="flex items-start gap-3 rounded-control border border-primary/40 bg-primary-soft p-3">
              <KeyRound className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="text-sm font-medium">Kode konfirmasi penerusan Gmail</p>
                <p className="text-2xl font-bold tracking-wider tabular-nums">
                  {inbox.forwardingCode}
                </p>
                <p className="text-xs text-muted">
                  {inbox.sourceEmail && `Untuk ${inbox.sourceEmail}. `}
                  {inbox.forwardingCodeAt && formatNotificationTime(inbox.forwardingCodeAt)}
                </p>
              </div>
            </div>
          )}

          <Field label="Dompet bawaan" hint="Dipakai saat mencatat; tetap bisa diganti.">
            {(a) => (
              <Select
                {...a}
                value={inbox.walletId ?? ''}
                onChange={(v) => void save({ walletId: v || null }, 'wallet')}
                options={walletOptions}
              />
            )}
          </Field>

          {inbox.lastReceivedAt && (
            <p className="text-sm text-muted">
              Email terakhir {formatNotificationTime(inbox.lastReceivedAt).toLowerCase()}
              {inbox.lastResult && `: ${RESULT_LABEL[inbox.lastResult]}`}
            </p>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmRotate}
        title="Ganti alamat penerusan?"
        description="Alamat lama berhenti menerima email. Kamu perlu menambahkan alamat baru di Gmail dan mengubah filternya."
        confirmLabel="Ganti alamat"
        loading={busy === 'rotate'}
        onClose={() => setConfirmRotate(false)}
        onConfirm={async () => {
          const next = await save({}, 'rotate');
          setConfirmRotate(false);
          if (next) toast({ message: 'Alamat baru siap. Perbarui penerusan di Gmail.' });
        }}
      />
    </Card>
  );
}

const CHECK_EVERY_MS = 5000;
const CHECK_FOR_MS = 3 * 60 * 1000;

/** Periksa kotak masuk berkala sampai kode konfirmasi penerusan Gmail yang baru masuk. */
function ForwardingCheck({ inbox }: { inbox: BankEmailInboxDTO }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [waiting, setWaiting] = useState<{ baseline: string | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!waiting) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const tick = async () => {
      try {
        const next = await api<BankEmailInboxDTO>('/bank-email/check', { method: 'POST' });
        if (cancelled) return;
        queryClient.setQueryData(queryKeys.bankEmail, next);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 429) {
          setWaiting(null);
          setNotice(err.message);
          return;
        }
      }
      if (Date.now() - startedAt >= CHECK_FOR_MS) {
        setWaiting(null);
        setNotice(
          'Kode belum datang. Pastikan alamat sudah ditambahkan di Gmail dan tekan Lanjutkan di sana, lalu coba lagi.',
        );
        return;
      }
      timer = setTimeout(() => void tick(), CHECK_EVERY_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [waiting, queryClient]);

  useEffect(() => {
    if (waiting && inbox.forwardingCodeAt !== waiting.baseline) {
      setWaiting(null);
      toast({ message: 'Kode konfirmasi Gmail sudah masuk.' });
    }
  }, [waiting, inbox.forwardingCodeAt, toast]);

  if (waiting) {
    return (
      <div
        role="status"
        className="flex flex-wrap items-center gap-3 rounded-control bg-surface-muted p-3 text-sm"
      >
        <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-hidden />
        <p className="min-w-0 flex-1">
          Menunggu kode dari Gmail… Biasanya kurang dari satu menit setelah kamu menambahkan alamat.
        </p>
        <Button variant="ghost" onClick={() => setWaiting(null)}>
          Berhenti
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant="secondary"
        className="w-fit"
        icon={<MailCheck className="size-4" aria-hidden />}
        onClick={() => {
          setNotice(null);
          setWaiting({ baseline: inbox.forwardingCodeAt });
        }}
      >
        Saya sudah menambahkan alamat
      </Button>
      {notice && <p className="text-sm text-muted">{notice}</p>}
    </div>
  );
}

function UploadCard() {
  const toast = useToast();
  const refresh = useRefreshBankEmail();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > BANK_EMAIL_MAX_BYTES) {
      toast({ message: 'File terlalu besar (maks. 1 MB).', tone: 'error' });
      return;
    }
    setBusy(true);
    try {
      const res = await api<BankEmailUploadDTO>('/bank-email/upload', {
        method: 'POST',
        body: new Blob([file], { type: 'message/rfc822' }),
      });
      const t = UPLOAD_TOAST[res.result];
      toast({ message: t.message, tone: t.tone });
      void refresh();
    } catch (err) {
      toast({
        message: err instanceof ApiError ? err.message : 'Gagal mengunggah. Coba lagi.',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <FileUp className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div>
          <h2 className="font-semibold">Unggah file email (.eml)</h2>
          <p className="text-sm text-muted">
            Tanpa penerusan: buka email notifikasi di Gmail â†’ menu â‹® â†’{' '}
            <strong>Download message</strong>, lalu unggah filenya di sini.
          </p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".eml,message/rfc822"
        onChange={onFile}
        className="sr-only"
        tabIndex={-1}
        aria-label="File email"
      />
      <Button
        variant="secondary"
        className="w-fit"
        loading={busy}
        onClick={() => inputRef.current?.click()}
        icon={<FileUp className="size-4" aria-hidden />}
      >
        Pilih file .eml
      </Button>
    </Card>
  );
}

function PendingCard() {
  const pending = useBankEmailPending();
  const items = pending.data ?? [];
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Menunggu konfirmasi</h2>
        <Button
          variant="ghost"

          onClick={() => void pending.refetch()}
          loading={pending.isFetching && !pending.isPending}
          icon={<RefreshCw className="size-4" aria-hidden />}
        >
          Muat ulang
        </Button>
      </div>
      {pending.isPending ? (
        <Skeleton className="h-20" />
      ) : pending.isError ? (
        <ErrorState message={pending.error.message} onRetry={() => void pending.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Belum ada transaksi baru"
          description="Transaksi dari email bank muncul di sini untuk kamu cek dulu sebelum tercatat."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {items.map((item) => (
            <PendingItem key={item.id} item={item} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function PendingItem({ item }: { item: BankEmailPendingDTO }) {
  const quickAdd = useQuickAdd();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [dismissing, setDismissing] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.bankEmail });

  const record = () =>
    quickAdd.openPrefilled(
      {
        kind: item.type,
        amount: item.amount,
        date: item.date,
        note: item.note,
        walletId: item.walletId,
      },
      (transactionId) =>
        api(`/bank-email/pending/${item.id}/confirm`, {
          method: 'POST',
          body: { transactionId },
        }).finally(() => void refresh()),
    );

  const dismiss = async () => {
    setDismissing(true);
    try {
      await api(`/bank-email/pending/${item.id}/dismiss`, { method: 'POST' });
      toast({ message: 'Diabaikan', tone: 'info' });
    } catch (err) {
      toast({
        message: err instanceof ApiError ? err.message : 'Gagal. Coba lagi.',
        tone: 'error',
      });
    } finally {
      setDismissing(false);
      void refresh();
    }
  };

  const income = item.type === 'INCOME';
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.note}</p>
          <p className="text-sm text-muted">
            {formatShortDate(item.date)}
            {item.time && `, ${item.time}`} Â· {item.source === 'bca' ? 'BCA' : item.source}
            {item.accountHint && ` Â· ${item.accountHint}`}
          </p>
          {item.fee > 0 && (
            <p className="text-xs text-muted">Termasuk biaya {formatRupiah(item.fee)}</p>
          )}
          {!item.confident && (
            <p className="mt-1 inline-flex rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-text">
              Kurang yakin, cek lagi
            </p>
          )}
        </div>
        <p
          className={cn(
            'shrink-0 font-semibold tabular-nums',
            income ? 'text-income-text' : 'text-expense-text',
          )}
        >
          {income ? '+' : 'âˆ’'}
          {formatRupiah(item.amount)}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={record}>Catat</Button>
        <Button variant="ghost" onClick={dismiss} loading={dismissing}>
          Abaikan
        </Button>
      </div>
    </li>
  );
}
