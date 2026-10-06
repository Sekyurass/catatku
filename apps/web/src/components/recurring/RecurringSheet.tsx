import {
  type CategoryDTO,
  DATE_REGEX,
  describeRecurrence,
  formatRupiah,
  MAX_AMOUNT,
  RECURRENCE_FREQUENCIES,
  type RecurrenceFrequency,
  type RecurringRuleDTO,
  type WalletDTO,
} from '@catatku/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pause, Play, Trash2, WalletMinimal } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { FormAlert } from '../../pages/auth/AuthLayout';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { applyServerErrors } from '../../lib/forms';
import { formatShortDate, today } from '../../lib/format';
import {
  pickDefaultWallet,
  useCategories,
  useInvalidateMoney,
  useWallets,
} from '../../lib/queries';
import { CategoryPicker } from '../transactions/CategoryPicker';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { DatePicker } from '../ui/DatePicker';
import { Dialog } from '../ui/Dialog';
import { Field, Input } from '../ui/Field';
import { RupiahInput } from '../ui/RupiahInput';
import { Segmented } from '../ui/Segmented';
import { ColorDot, Select, type SelectOption } from '../ui/Select';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';
import { useToast } from '../ui/Toast';

const UNIT_LABELS: Record<RecurrenceFrequency, string> = {
  DAILY: 'hari',
  WEEKLY: 'minggu',
  MONTHLY: 'bulan',
  YEARLY: 'tahun',
};

const formSchema = z
  .object({
    type: z.enum(['EXPENSE', 'INCOME']),
    amount: z.number().nullable(),
    walletId: z.string(),
    categoryId: z.string(),
    note: z.string().max(200, { error: 'Catatan maksimal 200 karakter' }),
    frequency: z.enum(RECURRENCE_FREQUENCIES),
    interval: z
      .number({ error: 'Isi angka 1–99' })
      .int({ error: 'Isi angka 1–99' })
      .min(1, { error: 'Isi angka 1–99' })
      .max(99, { error: 'Isi angka 1–99' }),
    startDate: z.string(),
    endDate: z.string(),
    autoPost: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (!v.amount || v.amount <= 0) issue('amount', 'Masukkan nominal lebih dari 0');
    else if (v.amount > MAX_AMOUNT) issue('amount', 'Nominal terlalu besar');
    if (!v.walletId) issue('walletId', 'Pilih dompet');
    if (!v.categoryId) issue('categoryId', 'Pilih kategori');
    if (!DATE_REGEX.test(v.startDate)) issue('startDate', 'Pilih tanggal mulai');
    else if (v.endDate && v.endDate < v.startDate) {
      issue('endDate', 'Tanggal berakhir tidak boleh sebelum tanggal mulai');
    }
  });
type FormValues = z.infer<typeof formSchema>;

const FIELD_NAMES: Array<keyof FormValues> = [
  'amount',
  'walletId',
  'categoryId',
  'note',
  'frequency',
  'interval',
  'startDate',
  'endDate',
];

export function RecurringSheet({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: RecurringRuleDTO;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? 'Ubah transaksi berulang' : 'Transaksi berulang baru'}
    >
      <RecurringFormPanel editing={editing} onDone={onClose} />
    </Dialog>
  );
}

function RecurringFormPanel({
  editing,
  onDone,
}: {
  editing?: RecurringRuleDTO;
  onDone: () => void;
}) {
  const wallets = useWallets();
  const categories = useCategories();

  if (wallets.isPending || categories.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Memuat formulir">
        <Skeleton className="h-12" />
        <Skeleton className="h-14" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (wallets.isError || categories.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void wallets.refetch();
          void categories.refetch();
        }}
      />
    );
  }
  if (wallets.data.length === 0) {
    return (
      <EmptyState
        icon={WalletMinimal}
        title="Belum ada dompet"
        description="Buat dompet dulu sebelum mengatur transaksi berulang."
        action={
          <Link
            to="/dompet"
            onClick={onDone}
            className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover"
          >
            Buat dompet
          </Link>
        }
      />
    );
  }
  return (
    <RecurringForm
      wallets={wallets.data}
      categories={categories.data}
      editing={editing}
      onDone={onDone}
    />
  );
}

function defaultValues(wallets: WalletDTO[], editing?: RecurringRuleDTO): FormValues {
  if (editing) {
    return {
      type: editing.type,
      amount: editing.amount,
      walletId: editing.walletId,
      categoryId: editing.categoryId,
      note: editing.note ?? '',
      frequency: editing.frequency,
      interval: editing.interval,
      startDate: editing.startDate,
      endDate: editing.endDate ?? '',
      autoPost: editing.autoPost,
    };
  }
  return {
    type: 'EXPENSE',
    amount: null,
    walletId: pickDefaultWallet(wallets)?.id ?? '',
    categoryId: '',
    note: '',
    frequency: 'MONTHLY',
    interval: 1,
    startDate: today(),
    endDate: '',
    autoPost: true,
  };
}

function RecurringForm({
  wallets,
  categories,
  editing,
  onDone,
}: {
  wallets: WalletDTO[];
  categories: CategoryDTO[];
  editing?: RecurringRuleDTO;
  onDone: () => void;
}) {
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pause' | 'delete' | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(wallets, editing),
  });

  const type = watch('type');
  const frequency = watch('frequency');
  const interval = watch('interval');
  const startDate = watch('startDate');
  const endDate = watch('endDate');
  const autoPost = watch('autoPost');

  const preview =
    DATE_REGEX.test(startDate) && Number.isInteger(interval) && interval >= 1 && interval <= 99
      ? describeRecurrence({ startDate, frequency, interval })
      : null;

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    const body = {
      type: v.type,
      amount: v.amount!,
      walletId: v.walletId,
      categoryId: v.categoryId,
      note: v.note,
      frequency: v.frequency,
      interval: v.interval,
      startDate: v.startDate,
      endDate: v.endDate || null,
      autoPost: v.autoPost,
    };
    try {
      if (editing) {
        const changed = Object.fromEntries(
          Object.entries(body).filter(([key]) => dirtyFields[key as keyof FormValues]),
        );
        await api(`/recurring/${editing.id}`, { method: 'PATCH', body: changed });
      } else {
        await api('/recurring', { method: 'POST', body });
      }
      void invalidate();
      toast({ message: editing ? 'Perubahan tersimpan' : 'Transaksi berulang dibuat' });
      onDone();
    } catch (err) {
      setFormError(applyServerErrors(err, setError, FIELD_NAMES));
    }
  });

  const togglePause = async () => {
    if (!editing) return;
    setBusy('pause');
    setFormError(null);
    try {
      await api(`/recurring/${editing.id}`, { method: 'PATCH', body: { paused: !editing.paused } });
      void invalidate();
      toast({ message: editing.paused ? 'Dilanjutkan' : 'Dijeda', tone: 'info' });
      onDone();
    } catch (err) {
      setFormError(applyServerErrors(err, setError, FIELD_NAMES));
      setBusy(null);
    }
  };

  const onDelete = async () => {
    if (!editing) return;
    setBusy('delete');
    try {
      await api(`/recurring/${editing.id}`, { method: 'DELETE' });
      void invalidate();
      toast({ message: 'Transaksi berulang dihapus', tone: 'info' });
      onDone();
    } catch (err) {
      setConfirmingDelete(false);
      setFormError(applyServerErrors(err, setError, FIELD_NAMES));
      setBusy(null);
    }
  };

  const walletOptions: SelectOption[] = wallets
    .filter((w) => !w.archivedAt)
    .map((w) => ({
      value: w.id,
      label: w.name,
      detail: formatRupiah(w.balance),
      leading: <ColorDot color={w.color} />,
    }));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormAlert message={formError} />

      {editing?.paused && (
        <p className="rounded-control bg-surface-muted px-3 py-2 text-sm text-muted">
          Sedang dijeda. Tidak ada transaksi yang dicatat sampai kamu melanjutkannya.
        </p>
      )}

      <Segmented
        label="Jenis transaksi"
        value={type}
        options={[
          { value: 'EXPENSE', label: 'Keluar' },
          { value: 'INCOME', label: 'Masuk' },
        ]}
        onChange={(next) => {
          setValue('type', next, { shouldDirty: true });
          setValue('categoryId', '', { shouldDirty: true });
        }}
      />

      <Field label="Nominal" error={errors.amount?.message}>
        {(a) => (
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <RupiahInput
                {...a}
                ref={field.ref}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                size="lg"
                placeholder="0"
                enterKeyHint="done"
                data-autofocus
                className={type === 'EXPENSE' ? 'text-expense-text' : 'text-income-text'}
              />
            )}
          />
        )}
      </Field>

      <Controller
        control={control}
        name="categoryId"
        render={({ field }) => (
          <CategoryPicker
            categories={categories.filter((c) => c.type === type && !c.archivedAt)}
            value={field.value}
            onChange={field.onChange}
            error={errors.categoryId?.message}
          />
        )}
      />

      <Field label="Dompet" error={errors.walletId?.message}>
        {(a) => (
          <Controller
            control={control}
            name="walletId"
            render={({ field }) => (
              <Select
                {...a}
                ref={field.ref}
                value={field.value}
                onChange={field.onChange}
                options={walletOptions}
              />
            )}
          />
        )}
      </Field>

      <Field label="Catatan (opsional)" error={errors.note?.message}>
        {(a) => (
          <Input
            {...a}
            placeholder={type === 'EXPENSE' ? 'Mis. sewa kos, langganan internet' : 'Mis. gaji'}
            maxLength={200}
            enterKeyHint="done"
            {...register('note')}
          />
        )}
      </Field>

      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
          <Field label="Ulangi setiap" error={errors.interval?.message}>
            {(a) => (
              <Input
                {...a}
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                {...register('interval', { valueAsNumber: true })}
              />
            )}
          </Field>
          <Field label="Satuan">
            {(a) => (
              <Controller
                control={control}
                name="frequency"
                render={({ field }) => (
                  <Select
                    {...a}
                    ref={field.ref}
                    value={field.value}
                    onChange={(v) => field.onChange(v as RecurrenceFrequency)}
                    options={RECURRENCE_FREQUENCIES.map((f) => ({
                      value: f,
                      label: UNIT_LABELS[f],
                    }))}
                  />
                )}
              />
            )}
          </Field>
        </div>
        {preview && (
          <p className="text-sm font-medium text-primary" aria-live="polite">
            {preview}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mulai" error={errors.startDate?.message}>
          {(a) => (
            <DatePicker
              {...a}
              value={startDate}
              onChange={(v) =>
                setValue('startDate', v, { shouldDirty: true, shouldValidate: true })
              }
            />
          )}
        </Field>
        <Field label="Berakhir (opsional)" error={errors.endDate?.message}>
          {(a) => (
            <DatePicker
              {...a}
              value={endDate}
              min={startDate}
              clearable
              placeholder="Tidak berakhir"
              onChange={(v) => setValue('endDate', v, { shouldDirty: true, shouldValidate: true })}
            />
          )}
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium text-fg">Saat jatuh tempo</legend>
        {[
          {
            value: true,
            title: 'Catat otomatis',
            description: 'Transaksi langsung tercatat di tanggalnya.',
          },
          {
            value: false,
            title: 'Minta konfirmasi dulu',
            description:
              'Muncul di Beranda untuk dicatat atau dilewati. Cocok untuk tagihan yang nominalnya berubah.',
          },
        ].map((opt) => (
          <label
            key={opt.title}
            className={cn(
              'group flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-line p-3',
              'hover:bg-surface-muted has-checked:border-primary has-checked:bg-primary-soft',
              'has-focus-visible:outline-2 has-focus-visible:outline-primary',
            )}
          >
            <input
              type="radio"
              name="autoPost"
              checked={autoPost === opt.value}
              onChange={() => setValue('autoPost', opt.value, { shouldDirty: true })}
              className="sr-only"
            />
            <span
              aria-hidden
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-line group-has-checked:border-primary"
            >
              <span className="size-2.5 rounded-full bg-primary opacity-0 group-has-checked:opacity-100" />
            </span>
            <span>
              <span className="block text-sm font-semibold">{opt.title}</span>
              <span className="block text-sm text-muted">{opt.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {editing && (
        <p className="text-sm text-muted">
          Perubahan berlaku mulai kejadian berikutnya
          {editing.nextRunAt ? ` (${formatShortDate(editing.nextRunAt)})` : ''}. Transaksi yang
          sudah tercatat tidak ikut berubah.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {editing && (
          <>
            <Button
              variant="ghost"
              className="text-expense-text"
              onClick={() => setConfirmingDelete(true)}
              icon={<Trash2 className="size-4" aria-hidden />}
            >
              Hapus
            </Button>
            <Button
              variant="secondary"
              onClick={togglePause}
              loading={busy === 'pause'}
              icon={
                editing.paused ? (
                  <Play className="size-4" aria-hidden />
                ) : (
                  <Pause className="size-4" aria-hidden />
                )
              }
            >
              {editing.paused ? 'Lanjutkan' : 'Jeda'}
            </Button>
          </>
        )}
        <Button type="submit" size="lg" loading={isSubmitting} className="min-w-32 flex-1">
          Simpan
        </Button>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={onDelete}
        loading={busy === 'delete'}
        title="Hapus transaksi berulang?"
        description="Tidak akan ada transaksi baru dari jadwal ini. Transaksi yang sudah tercatat tetap ada."
        confirmLabel="Hapus"
      />
    </form>
  );
}
