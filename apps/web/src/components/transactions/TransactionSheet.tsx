import {
  type CategoryDTO,
  DATE_REGEX,
  formatRupiah,
  MAX_AMOUNT,
  type TransactionDTO,
  type WalletDTO,
} from '@catatku/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2, WalletMinimal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { useBudgetWarning } from '../budgets/useBudgetWarning';
import { FormAlert } from '../../pages/auth/AuthLayout';
import { api, ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { applyServerErrors } from '../../lib/forms';
import { today, yesterday } from '../../lib/format';
import {
  pickDefaultWallet,
  useCategories,
  useInvalidateMoney,
  useWallets,
} from '../../lib/queries';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { DatePicker } from '../ui/DatePicker';
import { Field, Input } from '../ui/Field';
import { RupiahInput } from '../ui/RupiahInput';
import { Segmented } from '../ui/Segmented';
import { ColorDot, Select, type SelectOption } from '../ui/Select';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';
import { useToast } from '../ui/Toast';
import { CategoryPicker } from './CategoryPicker';

export type TransactionKind = 'EXPENSE' | 'INCOME' | 'TRANSFER';

const KIND_OPTIONS: { value: TransactionKind; label: string }[] = [
  { value: 'EXPENSE', label: 'Keluar' },
  { value: 'INCOME', label: 'Masuk' },
  { value: 'TRANSFER', label: 'Transfer' },
];

const formSchema = z
  .object({
    kind: z.enum(['EXPENSE', 'INCOME', 'TRANSFER']),
    amount: z.number().nullable(),
    walletId: z.string(),
    toWalletId: z.string(),
    categoryId: z.string(),
    date: z.string(),
    note: z.string().max(200, { error: 'Catatan maksimal 200 karakter' }),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (!v.amount || v.amount <= 0) issue('amount', 'Masukkan nominal lebih dari 0');
    else if (v.amount > MAX_AMOUNT) issue('amount', 'Nominal terlalu besar');
    if (!v.walletId) issue('walletId', 'Pilih dompet');
    if (v.kind === 'TRANSFER') {
      if (!v.toWalletId) issue('toWalletId', 'Pilih dompet tujuan');
      else if (v.toWalletId === v.walletId) issue('toWalletId', 'Dompet tujuan harus berbeda');
    } else if (!v.categoryId) {
      issue('categoryId', 'Pilih kategori');
    }
    if (!DATE_REGEX.test(v.date)) issue('date', 'Tanggal tidak valid');
  });
type FormValues = z.infer<typeof formSchema>;

const FIELD_NAMES: Array<keyof FormValues> = [
  'amount',
  'walletId',
  'toWalletId',
  'categoryId',
  'date',
  'note',
];

export function TransactionSheet({
  open,
  onClose,
  editing,
  initialKind,
}: {
  open: boolean;
  onClose: () => void;
  editing?: TransactionDTO;
  initialKind?: TransactionKind;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={editing ? 'Ubah transaksi' : 'Catat transaksi'}>
      <TransactionFormPanel onDone={onClose} editing={editing} initialKind={initialKind} />
    </Dialog>
  );
}

/** Isi form transaksi tanpa dialog (dipakai juga di onboarding). `onDone` dipanggil setelah tersimpan. */
export function TransactionFormPanel({
  onDone,
  editing,
  initialKind,
}: {
  onDone: () => void;
  editing?: TransactionDTO;
  initialKind?: TransactionKind;
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
        description="Buat dompet dulu, misalnya Tunai atau rekening bank, sebelum mencatat transaksi."
        action={
          <Link
            to="/dompet"
            onClick={onDone}
            className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            Buat dompet
          </Link>
        }
      />
    );
  }
  return (
    <TransactionForm
      wallets={wallets.data}
      categories={categories.data}
      editing={editing}
      initialKind={initialKind}
      onDone={onDone}
    />
  );
}

function defaultValues(
  wallets: WalletDTO[],
  editing?: TransactionDTO,
  initialKind: TransactionKind = 'EXPENSE',
): FormValues {
  if (!editing) {
    return {
      kind: initialKind,
      amount: null,
      walletId: pickDefaultWallet(wallets)?.id ?? '',
      toWalletId: '',
      categoryId: '',
      date: today(),
      note: '',
    };
  }
  const isOutLeg = editing.amount < 0;
  const counterpartId = editing.counterpartWallet?.id ?? '';
  return {
    kind: editing.type,
    amount: Math.abs(editing.amount),
    walletId: editing.type === 'TRANSFER' && !isOutLeg ? counterpartId : editing.walletId,
    toWalletId: editing.type === 'TRANSFER' ? (isOutLeg ? counterpartId : editing.walletId) : '',
    categoryId: editing.categoryId ?? '',
    date: editing.date,
    note: editing.note ?? '',
  };
}

function TransactionForm({
  wallets,
  categories,
  editing,
  initialKind,
  onDone,
}: {
  wallets: WalletDTO[];
  categories: CategoryDTO[];
  editing?: TransactionDTO;
  initialKind?: TransactionKind;
  onDone: () => void;
}) {
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const warnBudget = useBudgetWarning();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    setFocus,
    watch,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(wallets, editing, initialKind),
  });

  // Form baru muncul setelah dompet & kategori termuat, jadi fokus awal dialog belum mengenai nominal.
  useEffect(() => setFocus('amount'), [setFocus]);

  const kind = watch('kind');
  const date = watch('date');
  const walletId = watch('walletId');
  const isTransfer = kind === 'TRANSFER';

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    const amount = v.amount!;
    try {
      if (editing?.type === 'TRANSFER') {
        await api(`/transactions/${editing.id}`, {
          method: 'PATCH',
          body: {
            fromWalletId: v.walletId,
            toWalletId: v.toWalletId,
            amount,
            date: v.date,
            note: v.note,
          },
        });
      } else if (editing) {
        const retyped = dirtyFields.kind || dirtyFields.categoryId;
        await api(`/transactions/${editing.id}`, {
          method: 'PATCH',
          body: {
            amount,
            walletId: v.walletId,
            date: v.date,
            note: v.note,
            ...(retyped && { type: v.kind, categoryId: v.categoryId }),
          },
        });
      } else if (v.kind === 'TRANSFER') {
        await api('/transactions/transfer', {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: {
            fromWalletId: v.walletId,
            toWalletId: v.toWalletId,
            amount,
            date: v.date,
            note: v.note,
          },
        });
      } else {
        await api('/transactions', {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: {
            type: v.kind,
            amount,
            walletId: v.walletId,
            categoryId: v.categoryId,
            date: v.date,
            note: v.note,
          },
        });
      }
      void invalidate();
      toast({ message: editing ? 'Perubahan tersimpan' : 'Transaksi tersimpan' });
      if (!editing && v.kind === 'EXPENSE') void warnBudget(v.categoryId, v.date);
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.fields?.fromWalletId) {
        err.fields.walletId = err.fields.fromWalletId;
      }
      setFormError(applyServerErrors(err, setError, FIELD_NAMES));
    }
  });

  const onDelete = async () => {
    if (!editing) return;
    setDeleting(true);
    setFormError(null);
    try {
      await api(`/transactions/${editing.id}`, { method: 'DELETE' });
      void invalidate();
      onDone();
      toast({
        message: 'Transaksi dihapus',
        tone: 'info',
        duration: 5000,
        action: {
          label: 'Urungkan',
          onClick: async () => {
            try {
              await api(`/transactions/${editing.id}/restore`, { method: 'POST' });
              void invalidate();
              toast({ message: 'Transaksi dikembalikan' });
            } catch {
              toast({ message: 'Gagal mengurungkan. Coba lagi.', tone: 'error' });
            }
          },
        },
      });
    } catch (err) {
      setFormError(applyServerErrors(err, setError, FIELD_NAMES));
      setDeleting(false);
    }
  };

  const activeWallets = wallets.filter((w) => !w.archivedAt);
  const walletOptions = (exclude?: string): SelectOption[] =>
    activeWallets
      .filter((w) => w.id !== exclude)
      .map((w) => ({
        value: w.id,
        label: w.name,
        detail: formatRupiah(w.balance),
        leading: <ColorDot color={w.color} />,
      }));
  const walletSelect = (
    name: 'walletId' | 'toWalletId',
    a: { id: string },
    options: SelectOption[],
    placeholder?: string,
  ) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Select
          {...a}
          ref={field.ref}
          value={field.value}
          onChange={(v) => field.onChange(v)}
          options={options}
          placeholder={placeholder}
        />
      )}
    />
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormAlert message={formError} />

      <Segmented
        label="Jenis transaksi"
        value={kind}
        options={KIND_OPTIONS.map((o) => ({
          ...o,
          // Transfer dan non-transfer punya struktur data berbeda; ubah jenis lintas keduanya = hapus lalu catat ulang.
          disabled: editing ? (editing.type === 'TRANSFER') !== (o.value === 'TRANSFER') : false,
        }))}
        onChange={(next) => {
          setValue('kind', next, { shouldDirty: true });
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
                className={cn(
                  kind === 'EXPENSE' && 'text-expense-text',
                  kind === 'INCOME' && 'text-income-text',
                )}
              />
            )}
          />
        )}
      </Field>

      {isTransfer ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dari dompet" error={errors.walletId?.message}>
            {(a) => walletSelect('walletId', a, walletOptions())}
          </Field>
          <Field label="Ke dompet" error={errors.toWalletId?.message}>
            {(a) => walletSelect('toWalletId', a, walletOptions(walletId), 'Pilih dompet tujuan')}
          </Field>
        </div>
      ) : (
        <>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <CategoryPicker
                categories={categories.filter((c) => c.type === kind)}
                value={field.value}
                onChange={field.onChange}
                error={errors.categoryId?.message}
              />
            )}
          />
          <Field label="Dompet" error={errors.walletId?.message}>
            {(a) => walletSelect('walletId', a, walletOptions())}
          </Field>
        </>
      )}

      <Field label="Tanggal" error={errors.date?.message}>
        {(a) => (
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Hari ini', value: today() },
              { label: 'Kemarin', value: yesterday() },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                aria-pressed={date === preset.value}
                onClick={() => setValue('date', preset.value, { shouldDirty: true })}
                className={cn(
                  'min-h-11 rounded-control border px-3 text-sm font-medium',
                  date === preset.value
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-line text-fg hover:bg-surface-muted',
                )}
              >
                {preset.label}
              </button>
            ))}
            <DatePicker
              {...a}
              value={date}
              onChange={(v) => setValue('date', v, { shouldDirty: true, shouldValidate: true })}
              className="min-w-44 flex-1"
            />
          </div>
        )}
      </Field>

      <Field label="Catatan (opsional)" error={errors.note?.message}>
        {(a) => (
          <Input
            {...a}
            placeholder={isTransfer ? 'Mis. tarik tunai' : 'Mis. makan siang'}
            maxLength={200}
            enterKeyHint="done"
            {...register('note')}
          />
        )}
      </Field>

      <div className="flex items-center gap-2 pt-1">
        {editing && (
          <Button
            variant="ghost"
            className="text-expense-text"
            onClick={onDelete}
            loading={deleting}
            icon={<Trash2 className="size-4" aria-hidden />}
          >
            Hapus
          </Button>
        )}
        <Button type="submit" size="lg" loading={isSubmitting} className="flex-1">
          Simpan
        </Button>
      </div>
    </form>
  );
}
