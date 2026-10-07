import {
  type CategoryDTO,
  DATE_REGEX,
  FEATURE_FLAGS,
  formatRupiah,
  MAX_AMOUNT,
  MAX_TEMPLATES,
  type TransactionDTO,
  type TransactionTemplateDTO,
  type WalletDTO,
} from '@catatku/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Trash2, WalletMinimal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { useBudgetWarning } from '../budgets/useBudgetWarning';
import { FormAlert } from '../../pages/auth/AuthLayout';
import { api, ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useFeature } from '../../lib/features';
import { applyServerErrors } from '../../lib/forms';
import { today, yesterday } from '../../lib/format';
import type { ReceiptField, ReceiptScanResult } from '../../lib/receipt';
import {
  pickDefaultWallet,
  useCategories,
  useInvalidateMoney,
  useTemplates,
  useWallets,
} from '../../lib/queries';
import { TemplateChips } from '../templates/TemplateChips';
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
import { ReceiptScanner } from './ReceiptScanner';

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

/** Isian yang terakhir diisi dari struk, untuk petunjuk "Dari struk" selama nilainya belum diubah. */
interface ScannedValues {
  amount?: ReceiptField<number>;
  date?: ReceiptField<string>;
  note?: ReceiptField<string>;
}

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
  template,
}: {
  open: boolean;
  onClose: () => void;
  editing?: TransactionDTO;
  initialKind?: TransactionKind;
  template?: TransactionTemplateDTO;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={editing ? 'Ubah transaksi' : 'Catat transaksi'}>
      <TransactionFormPanel
        onDone={onClose}
        editing={editing}
        initialKind={initialKind}
        template={template}
      />
    </Dialog>
  );
}

/** Isi form transaksi tanpa dialog (dipakai juga di onboarding). `onDone` dipanggil setelah tersimpan. */
export function TransactionFormPanel({
  onDone,
  editing,
  initialKind,
  template,
  withTemplates = true,
}: {
  onDone: () => void;
  editing?: TransactionDTO;
  initialKind?: TransactionKind;
  template?: TransactionTemplateDTO;
  /** Chip template dan opsi "simpan sebagai template"; dimatikan di onboarding agar tetap ringkas. */
  withTemplates?: boolean;
}) {
  const wallets = useWallets();
  const categories = useCategories();

  if (wallets.isPending || categories.isPending) {
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-busy="true"
        aria-label="Memuat formulir"
      >
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
            className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 text-sm font-semibold text-on-primary hover:bg-primary-hover"
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
      template={template}
      withTemplates={withTemplates}
      onDone={onDone}
    />
  );
}

function defaultValues(
  wallets: WalletDTO[],
  editing?: TransactionDTO,
  initialKind: TransactionKind = 'EXPENSE',
  template?: TransactionTemplateDTO,
): FormValues {
  if (template) {
    const walletActive = wallets.some((w) => w.id === template.walletId && !w.archivedAt);
    return {
      kind: template.type,
      amount: template.amount,
      walletId: walletActive ? template.walletId : (pickDefaultWallet(wallets)?.id ?? ''),
      toWalletId: '',
      categoryId: template.categoryId,
      date: today(),
      note: template.name,
    };
  }
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
  template,
  withTemplates,
  onDone,
}: {
  wallets: WalletDTO[];
  categories: CategoryDTO[];
  editing?: TransactionDTO;
  initialKind?: TransactionKind;
  template?: TransactionTemplateDTO;
  withTemplates: boolean;
  onDone: () => void;
}) {
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const warnBudget = useBudgetWarning();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const ocrOn = useFeature(FEATURE_FLAGS.RECEIPT_OCR);
  const [scanned, setScanned] = useState<ScannedValues>({});
  const templatesOn = useFeature(FEATURE_FLAGS.TEMPLATES) && withTemplates && !editing;
  const templates = useTemplates(templatesOn);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    setFocus,
    getValues,
    watch,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(wallets, editing, initialKind, template),
  });

  // Form baru muncul setelah dompet & kategori termuat, jadi fokus awal dialog belum mengenai nominal.
  useEffect(() => setFocus('amount'), [setFocus]);

  const kind = watch('kind');
  const date = watch('date');
  const walletId = watch('walletId');
  const amount = watch('amount');
  const note = watch('note');
  const isTransfer = kind === 'TRANSFER';

  // Hanya isi yang masih kosong/bawaan atau yang sebelumnya juga dari struk: ketikan pengguna tidak ditimpa.
  const applyScan = (result: ReceiptScanResult) => {
    const current = getValues();
    const next: ScannedValues = {};
    const opts = { shouldDirty: true, shouldValidate: true };
    if (result.total && (current.amount === null || current.amount === scanned.amount?.value)) {
      setValue('amount', result.total.value, opts);
      next.amount = result.total;
    }
    if (result.date && (current.date === today() || current.date === scanned.date?.value)) {
      setValue('date', result.date.value, opts);
      next.date = result.date;
    }
    if (result.merchant && (!current.note.trim() || current.note === scanned.note?.value)) {
      setValue('note', result.merchant.value, opts);
      next.note = result.merchant;
    }
    setScanned(next);
  };

  const scanHint = (field: ReceiptField<unknown> | undefined, value: unknown) => {
    if (!field || field.value !== value) return undefined;
    return field.confidence === 'low' ? 'Dari struk, kurang yakin. Cek lagi.' : 'Dari struk';
  };

  // Mengisi form, bukan langsung menyimpan: di sini pengguna masih bisa mengubah nominal.
  const applyTemplate = (t: TransactionTemplateDTO) => {
    const opts = { shouldDirty: true, shouldValidate: true };
    if (t.amount !== null) setValue('amount', t.amount, opts);
    setValue('categoryId', t.categoryId, opts);
    if (wallets.some((w) => w.id === t.walletId && !w.archivedAt)) {
      setValue('walletId', t.walletId, opts);
    }
    setValue('note', t.name, opts);
    setSaveAsTemplate(false);
    setFocus('amount');
  };
  const templateItems = templates.data ?? [];
  const kindTemplates = templateItems.filter((t) => t.usable && t.type === kind);
  const canSaveTemplate =
    templatesOn && templates.isSuccess && templateItems.length < MAX_TEMPLATES;

  const createTemplateFrom = async (v: FormValues) => {
    const categoryName = categories.find((c) => c.id === v.categoryId)?.name ?? 'Template';
    try {
      await api('/templates', {
        method: 'POST',
        body: {
          name: (v.note.trim() || categoryName).slice(0, 40),
          type: v.kind,
          amount: v.amount,
          walletId: v.walletId,
          categoryId: v.categoryId,
        },
      });
      return true;
    } catch {
      return false;
    }
  };

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
      const templateSaved =
        saveAsTemplate && canSaveTemplate && v.kind !== 'TRANSFER'
          ? await createTemplateFrom(v)
          : null;
      void invalidate();
      if (templateSaved === false) {
        toast({ message: 'Transaksi tersimpan, tapi template gagal dibuat.', tone: 'warning' });
      } else {
        toast({
          message: editing
            ? 'Perubahan tersimpan'
            : templateSaved
              ? 'Transaksi & template tersimpan'
              : 'Transaksi tersimpan',
        });
      }
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

      {templatesOn && !isTransfer && kindTemplates.length > 0 && (
        <TemplateChips templates={kindTemplates} onPick={applyTemplate} label="Isi dari template" />
      )}

      {ocrOn && !editing && kind === 'EXPENSE' && (
        <ReceiptScanner today={today()} onScanned={applyScan} onCleared={() => setScanned({})} />
      )}

      <Field label="Nominal" error={errors.amount?.message} hint={scanHint(scanned.amount, amount)}>
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

      <Field label="Tanggal" error={errors.date?.message} hint={scanHint(scanned.date, date)}>
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

      <Field
        label="Catatan (opsional)"
        error={errors.note?.message}
        hint={scanHint(scanned.note, note)}
      >
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

      {canSaveTemplate && !isTransfer && (
        <label
          className={cn(
            'group flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-1 text-sm',
            'has-focus-visible:outline-2 has-focus-visible:outline-primary',
          )}
        >
          <input
            type="checkbox"
            checked={saveAsTemplate}
            onChange={(e) => setSaveAsTemplate(e.target.checked)}
            className="sr-only"
          />
          <span
            aria-hidden
            className="flex size-5 shrink-0 items-center justify-center rounded-md border-2 border-line text-on-primary transition-colors group-has-checked:border-primary group-has-checked:bg-primary"
          >
            <Check className="size-3.5 opacity-0 group-has-checked:opacity-100" strokeWidth={3} />
          </span>
          <span>
            <span className="block font-medium">Simpan juga sebagai template</span>
            <span className="block text-muted">Lain kali cukup satu tap dari Beranda.</span>
          </span>
        </label>
      )}

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
