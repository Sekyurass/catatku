import { formatRupiah, type WalletDTO, type WalletType } from '@catatku/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, ChevronDown, Plus, Trash2, WalletMinimal } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { IconBadge } from '../components/IconBadge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ChoiceGrid } from '../components/ui/ChoiceGrid';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Dialog } from '../components/ui/Dialog';
import { Field, Input } from '../components/ui/Field';
import { RupiahInput } from '../components/ui/RupiahInput';
import { Segmented } from '../components/ui/Segmented';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { applyServerErrors } from '../lib/forms';
import { swatchesWith, WALLET_ICONS, WALLET_TYPE_LABELS } from '../lib/icons';
import { invalidateMoney, useWallets } from '../lib/queries';
import { FormAlert } from './auth/AuthLayout';

const walletFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Nama dompet wajib diisi' })
    .max(40, { error: 'Nama dompet maksimal 40 karakter' }),
  type: z.enum(['CASH', 'BANK', 'EWALLET']),
  initialBalance: z.number().nullable(),
  color: z.string(),
});
type WalletForm = z.infer<typeof walletFormSchema>;

export function WalletsPage() {
  const wallets = useWallets(true);
  const [editing, setEditing] = useState<WalletDTO | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = wallets.data?.filter((w) => !w.archivedAt) ?? [];
  const archived = wallets.data?.filter((w) => w.archivedAt) ?? [];
  const total = active.reduce((sum, w) => sum + w.balance, 0);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Dompet</h1>
        <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
          Tambah dompet
        </Button>
      </header>

      {wallets.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat dompet">
          <Skeleton className="h-24" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : wallets.isError ? (
        <Card>
          <ErrorState message={wallets.error.message} onRetry={() => void wallets.refetch()} />
        </Card>
      ) : active.length === 0 && archived.length === 0 ? (
        <Card>
          <EmptyState
            icon={WalletMinimal}
            title="Belum ada dompet"
            description="Tambahkan tempat uangmu berada: uang tunai, rekening bank, atau dompet digital."
            action={
              <Button
                icon={<Plus className="size-4" aria-hidden />}
                onClick={() => setEditing('new')}
              >
                Tambah dompet
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Card className="border-none bg-brand text-white">
            <p className="text-sm text-white/90">Total saldo</p>
            <p className="tabular text-3xl font-bold">{formatRupiah(total)}</p>
            <p className="mt-1 text-sm text-white/90">dari {active.length} dompet aktif</p>
          </Card>

          <Card className="p-1">
            <ul>
              {active.map((w) => (
                <li key={w.id}>
                  <WalletRow wallet={w} onSelect={() => setEditing(w)} />
                </li>
              ))}
            </ul>
          </Card>

          {archived.length > 0 && (
            <div>
              <Button
                variant="ghost"
                onClick={() => setShowArchived((s) => !s)}
                aria-expanded={showArchived}
                icon={
                  <ChevronDown
                    className={cn('size-4 transition-transform', showArchived && 'rotate-180')}
                    aria-hidden
                  />
                }
              >
                Dompet diarsipkan ({archived.length})
              </Button>
              {showArchived && (
                <Card className="mt-2 p-1">
                  <ul>
                    {archived.map((w) => (
                      <li key={w.id}>
                        <WalletRow wallet={w} onSelect={() => setEditing(w)} />
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Tambah dompet' : 'Ubah dompet'}
      >
        {editing !== null && (
          <WalletFormBody
            wallet={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function WalletRow({ wallet, onSelect }: { wallet: WalletDTO; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex min-h-14 w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-surface-muted"
    >
      <IconBadge icon={WALLET_ICONS[wallet.type]} color={wallet.color} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{wallet.name}</span>
        <span className="block text-sm text-muted">
          {WALLET_TYPE_LABELS[wallet.type]}
          {wallet.archivedAt && ' · diarsipkan'}
        </span>
      </span>
      <span
        className={cn(
          'tabular shrink-0 font-semibold',
          wallet.balance < 0 ? 'text-expense-text' : 'text-fg',
        )}
      >
        {formatRupiah(wallet.balance)}
      </span>
    </button>
  );
}

function WalletFormBody({ wallet, onDone }: { wallet?: WalletDTO; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    setError,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<WalletForm>({
    resolver: zodResolver(walletFormSchema),
    defaultValues: {
      name: wallet?.name ?? '',
      type: wallet?.type ?? 'CASH',
      initialBalance: wallet?.initialBalance ?? null,
      color: wallet?.color ?? '#0F766E',
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    const body = { ...v, initialBalance: v.initialBalance ?? 0 };
    try {
      if (wallet) await api(`/wallets/${wallet.id}`, { method: 'PATCH', body });
      else await api('/wallets', { method: 'POST', body });
      void invalidateMoney(qc);
      toast({ message: wallet ? 'Dompet diperbarui' : 'Dompet ditambahkan' });
      onDone();
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ['name', 'type', 'initialBalance', 'color']));
    }
  });

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setFormError(null);
    try {
      const message = await action();
      void invalidateMoney(qc);
      toast({ message });
      onDone();
    } catch (err) {
      setFormError(applyServerErrors(err, setError, []));
      setBusy(false);
      setConfirming(false);
    }
  };

  const onDelete = () =>
    run(async () => {
      const res = await api<{ result: 'deleted' | 'archived' }>(`/wallets/${wallet!.id}`, {
        method: 'DELETE',
      });
      return res.result === 'deleted'
        ? 'Dompet dihapus'
        : 'Dompet diarsipkan karena sudah punya riwayat transaksi';
    });

  const onUnarchive = () =>
    run(async () => {
      await api(`/wallets/${wallet!.id}`, { method: 'PATCH', body: { archived: false } });
      return 'Dompet diaktifkan lagi';
    });

  const color = watch('color');

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormAlert message={formError} />
      <Field label="Nama dompet" error={errors.name?.message}>
        {(a) => (
          <Input {...a} placeholder="Mis. BCA, GoPay, Tunai" data-autofocus {...register('name')} />
        )}
      </Field>
      <Segmented<WalletType>
        label="Jenis dompet"
        value={watch('type')}
        onChange={(t) => setValue('type', t, { shouldDirty: true })}
        options={[
          { value: 'CASH', label: 'Tunai' },
          { value: 'BANK', label: 'Bank' },
          { value: 'EWALLET', label: 'E-wallet' },
        ]}
      />
      <Field
        label="Saldo awal"
        error={errors.initialBalance?.message}
        hint="Saldo saat kamu mulai mencatat. Saldo berjalan dihitung otomatis dari transaksi."
      >
        {(a) => (
          <Controller
            control={control}
            name="initialBalance"
            render={({ field }) => (
              <RupiahInput
                {...a}
                ref={field.ref}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder="0"
              />
            )}
          />
        )}
      </Field>
      <ChoiceGrid
        legend="Warna"
        options={swatchesWith(color)}
        value={color}
        onChange={(c) => setValue('color', c, { shouldDirty: true })}
        render={(c) => <span className="size-7 rounded-full" style={{ backgroundColor: c }} />}
      />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {wallet?.archivedAt ? (
          <Button
            variant="secondary"
            onClick={onUnarchive}
            loading={busy}
            icon={<ArchiveRestore className="size-4" aria-hidden />}
          >
            Aktifkan lagi
          </Button>
        ) : (
          wallet && (
            <Button
              variant="ghost"
              className="text-expense-text"
              onClick={() => setConfirming(true)}
              icon={<Trash2 className="size-4" aria-hidden />}
            >
              Hapus
            </Button>
          )
        )}
        <Button type="submit" size="lg" loading={isSubmitting} className="flex-1">
          Simpan
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Hapus dompet "${wallet?.name ?? ''}"?`}
        description="Dompet tanpa transaksi akan dihapus. Dompet yang sudah punya transaksi akan diarsipkan agar riwayat dan laporan tetap utuh."
        confirmLabel="Hapus"
        loading={busy}
        onConfirm={onDelete}
        onClose={() => setConfirming(false)}
      />
    </form>
  );
}
