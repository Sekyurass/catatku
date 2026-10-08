import {
  type CategoryDTO,
  DATE_REGEX,
  FEATURE_FLAGS,
  formatRupiah,
  MAX_AMOUNT,
  MAX_ATTACHMENTS_PER_TRANSACTION,
  MAX_TEMPLATES,
  type QuickTextResult,
  type QuickTextValues,
  type TransactionDTO,
  type TransactionTemplateDTO,
  type WalletDTO,
} from '@catatku/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Sparkles, Trash2, WalletMinimal } from 'lucide-react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { useBudgetWarning } from '../budgets/useBudgetWarning';
import { FormAlert } from '../../pages/auth/AuthLayout';
import { api, ApiError } from '../../lib/api';
import { compressAttachment, deleteAttachment, uploadAttachment } from '../../lib/attachments';
import {
  rememberCategory,
  suggestCategory,
  type CategorySuggestion,
} from '../../lib/categorySuggest';
import { cn } from '../../lib/cn';
import { useFeature } from '../../lib/features';
import { applyServerErrors } from '../../lib/forms';
import { today, yesterday } from '../../lib/format';
import { receiptNote, type ReceiptField, type ReceiptScanResult } from '../../lib/receipt';
import {
  pickDefaultWallet,
  queryKeys,
  useAttachments,
  useCategories,
  useInvalidateMoney,
  quickTextSharingQuery,
  useLearnedCategories,
  useQuickTextSharing,
  useTemplates,
  useWallets,
} from '../../lib/queries';
import { parsedSource, toSampleValues } from '../../lib/quickTextSample';
import { TemplateChips } from '../templates/TemplateChips';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { DatePicker } from '../ui/DatePicker';
import { Field, Textarea } from '../ui/Field';
import { RupiahInput } from '../ui/RupiahInput';
import { Segmented } from '../ui/Segmented';
import { ColorDot, Select, type SelectOption } from '../ui/Select';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';
import { useToast } from '../ui/Toast';
import { AttachmentField, type PendingPhoto } from './AttachmentField';
import { CategoryPicker } from './CategoryPicker';
import { QuickTextField } from './QuickTextField';
import { ReceiptScanner } from './ReceiptScanner';
import { TagInput } from './TagInput';
import { useDeleteTransaction } from './useDeleteTransaction';

export type TransactionKind = 'EXPENSE' | 'INCOME' | 'TRANSFER';

/** Isian awal dari sumber luar (mis. email bank); semuanya masih bisa diubah sebelum disimpan. */
export interface TransactionPrefill {
  kind: 'EXPENSE' | 'INCOME';
  amount: number;
  date: string;
  note: string;
  walletId: string | null;
}

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
  prefill,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing?: TransactionDTO;
  initialKind?: TransactionKind;
  template?: TransactionTemplateDTO;
  prefill?: TransactionPrefill;
  onSaved?: SavedHandler;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={editing ? 'Ubah transaksi' : 'Catat transaksi'}>
      <TransactionFormPanel
        onDone={onClose}
        editing={editing}
        initialKind={initialKind}
        template={template}
        prefill={prefill}
        onSaved={onSaved}
      />
    </Dialog>
  );
}

/** Dipanggil setelah transaksi pemasukan/pengeluaran baru tersimpan. */
export type SavedHandler = (transactionId: string) => Promise<unknown>;

/** Isi form transaksi tanpa dialog (dipakai juga di onboarding). `onDone` dipanggil setelah tersimpan. */
export function TransactionFormPanel({
  onDone,
  editing,
  initialKind,
  template,
  prefill,
  onSaved,
  withTemplates = true,
}: {
  onDone: () => void;
  editing?: TransactionDTO;
  initialKind?: TransactionKind;
  template?: TransactionTemplateDTO;
  prefill?: TransactionPrefill;
  onSaved?: SavedHandler;
  /** Pintasan (chip template, simpan sebagai template, ketik cepat); dimatikan di onboarding agar tetap ringkas. */
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
      prefill={prefill}
      onSaved={onSaved}
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
  prefill?: TransactionPrefill,
): FormValues {
  if (prefill) {
    const walletActive = wallets.some((w) => w.id === prefill.walletId && !w.archivedAt);
    return {
      kind: prefill.kind,
      amount: prefill.amount,
      walletId: walletActive ? prefill.walletId! : (pickDefaultWallet(wallets)?.id ?? ''),
      toWalletId: '',
      categoryId: '',
      date: prefill.date,
      note: prefill.note.slice(0, 200),
    };
  }
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
    // Transaksi DEBT tidak bisa dibuka di form ini (tombol Ubah disembunyikan di detail).
    kind: editing.type === 'DEBT' ? 'EXPENSE' : editing.type,
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
  prefill,
  onSaved,
  withTemplates,
  onDone,
}: {
  wallets: WalletDTO[];
  categories: CategoryDTO[];
  editing?: TransactionDTO;
  initialKind?: TransactionKind;
  template?: TransactionTemplateDTO;
  prefill?: TransactionPrefill;
  onSaved?: SavedHandler;
  withTemplates: boolean;
  onDone: () => void;
}) {
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const deleteTransaction = useDeleteTransaction();
  const warnBudget = useBudgetWarning();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const ocrOn = useFeature(FEATURE_FLAGS.RECEIPT_OCR);
  const [scanned, setScanned] = useState<ScannedValues>({});
  const templatesOn = useFeature(FEATURE_FLAGS.TEMPLATES) && withTemplates && !editing;
  const templates = useTemplates(templatesOn);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const queryClient = useQueryClient();
  const autoCategoryOn = useFeature(FEATURE_FLAGS.AUTO_CATEGORY);
  const learned = useLearnedCategories(autoCategoryOn);
  /** Kategori yang dipilih otomatis; selama belum diganti pengguna, saran baru boleh menggantinya. */
  const [autoPicked, setAutoPicked] = useState<string | null>(null);
  const quickTextOn = useFeature(FEATURE_FLAGS.NATURAL_INPUT) && withTemplates && !editing;
  /** Isian terakhir dari ketik cepat, untuk mengukur apakah disimpan tanpa diubah. */
  const [quickFilled, setQuickFilled] = useState<{
    values: FormValues;
    fields: number;
    text: string;
    parsed: QuickTextValues;
  } | null>(null);
  useQuickTextSharing(quickTextOn);
  const formRef = useRef<HTMLFormElement>(null);
  const tagsOn = useFeature(FEATURE_FLAGS.TAGS);
  const [tags, setTags] = useState<string[]>(() => editing?.tags.map((t) => t.name) ?? []);
  const attachOn = useFeature(FEATURE_FLAGS.ATTACHMENTS) && editing?.type !== 'TRANSFER';
  const attachments = useAttachments(editing?.id, attachOn);
  /** Lampiran baru dan yang akan dihapus baru diterapkan setelah transaksi tersimpan. */
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [receiptPhoto, setReceiptPhoto] = useState<File | null>(null);
  const [attachReceipt, setAttachReceipt] = useState(true);
  const previewUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = previewUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

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
    defaultValues: defaultValues(wallets, editing, initialKind, template, prefill),
  });

  // Form baru muncul setelah dompet & kategori termuat, jadi fokus awal dialog belum mengenai nominal.
  useEffect(() => setFocus('amount'), [setFocus]);

  const kind = watch('kind');
  const date = watch('date');
  const walletId = watch('walletId');
  const amount = watch('amount');
  const note = watch('note');
  const isTransfer = kind === 'TRANSFER';
  const categoryId = watch('categoryId');

  const suggestFor = (text: string, forKind: TransactionKind) =>
    autoCategoryOn && forKind !== 'TRANSFER'
      ? suggestCategory(text, forKind, learned.data ?? [], categories)
      : null;
  const suggestion = suggestFor(note, kind);

  // Dipanggil dari event (ketik catatan, pindai struk, ganti jenis), bukan efek, agar pilihan
  // manual pengguna tidak pernah ditimpa.
  const autoPick = (text: string, forKind: TransactionKind = getValues('kind')) => {
    const next = suggestFor(text, forKind);
    const current = getValues('categoryId');
    if (!next || (current !== '' && current !== autoPicked)) return;
    setValue('categoryId', next.categoryId, { shouldDirty: true, shouldValidate: !!current });
    setAutoPicked(next.categoryId);
  };

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
    const note = receiptNote(result.merchant?.value ?? null, result.items);
    if (note && (!current.note.trim() || current.note === scanned.note?.value)) {
      setValue('note', note, opts);
      next.note = { value: note, confidence: result.merchant?.confidence ?? 'low' };
      autoPick(note);
    }
    setScanned(next);
  };

  // Tindakan eksplisit (Enter / "Isi form"), jadi boleh menimpa isian; yang tidak terbaca dibiarkan.
  const applyQuickText = (r: QuickTextResult, text: string) => {
    const opts = { shouldDirty: true };
    const kindChanged = r.type !== getValues('kind');
    setValue('kind', r.type, opts);
    if (r.amount !== null) setValue('amount', r.amount, opts);
    if (r.date) setValue('date', r.date, opts);
    if (r.walletId) setValue('walletId', r.walletId, opts);
    if (r.type === 'TRANSFER') {
      setValue('toWalletId', r.toWalletId ?? '', opts);
    } else if (r.categoryId || kindChanged) {
      setValue('categoryId', r.categoryId ?? '', opts);
      setAutoPicked(r.categoryId);
    }
    if (r.note) setValue('note', r.note, opts);
    const filled = getValues();
    setQuickFilled({
      values: filled,
      fields: Math.min(r.found.length, 6),
      text,
      parsed: toSampleValues(parsedSource(r), { today: today(), wallets, categories }),
    });
    // Lengkap → fokus ke Simpan agar Enter berikutnya menyimpan; kurang → ke isian yang kosong.
    if (r.amount === null) setFocus('amount');
    else if (r.type === 'TRANSFER' && !filled.toWalletId) setFocus('toWalletId');
    else if (r.type === 'TRANSFER' || filled.categoryId) {
      formRef.current?.querySelector<HTMLElement>('button[type="submit"]')?.focus();
    }
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

  const existingAttachments = (attachments.data ?? []).filter((a) => !removed.includes(a.id));
  const receiptAttached = attachOn && !!receiptPhoto && attachReceipt;
  const attachmentCapacity =
    MAX_ATTACHMENTS_PER_TRANSACTION -
    existingAttachments.length -
    pending.length -
    (receiptAttached ? 1 : 0);

  /** Unggah foto baru & hapus yang ditandai. Mengembalikan jumlah yang gagal. */
  const syncAttachments = async (transactionId: string) => {
    const uploads: Array<() => Promise<Blob>> = [
      ...(receiptAttached ? [() => compressAttachment(receiptPhoto!)] : []),
      ...pending.map((p) => () => Promise.resolve(p.blob)),
    ];
    if (uploads.length === 0 && removed.length === 0) return 0;
    let failed = 0;
    for (const id of removed) await deleteAttachment(id).catch(() => failed++);
    for (const load of uploads) {
      await load()
        .then((blob) => uploadAttachment(transactionId, blob))
        .catch(() => failed++);
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.attachments(transactionId) });
    return failed;
  };

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    const amount = v.amount!;
    const withTags = tagsOn && v.kind !== 'TRANSFER';
    let savedId = editing?.id;
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
            ...(withTags && { tags }),
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
        const created = await api<TransactionDTO>('/transactions', {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: {
            type: v.kind,
            amount,
            walletId: v.walletId,
            categoryId: v.categoryId,
            date: v.date,
            note: v.note,
            ...(withTags && { tags }),
          },
        });
        savedId = created.id;
      }
      if (autoCategoryOn && v.kind !== 'TRANSFER') {
        const shown = suggestFor(v.note, v.kind);
        if (shown && !editing) {
          void api('/events', {
            method: 'POST',
            body: {
              name: 'category_suggestion',
              source: shown.source,
              accepted: shown.categoryId === v.categoryId,
            },
          }).catch(() => undefined);
        }
        rememberCategory(queryClient, v.note, v.kind, v.categoryId);
      }
      if (quickFilled) {
        const keys: Array<keyof FormValues> =
          v.kind === 'TRANSFER'
            ? ['kind', 'amount', 'walletId', 'toWalletId', 'date', 'note']
            : ['kind', 'amount', 'walletId', 'categoryId', 'date', 'note'];
        const accepted = keys.every((k) => v[k] === quickFilled.values[k]);
        void api('/events', {
          method: 'POST',
          body: { name: 'quick_text_used', fields: quickFilled.fields, accepted },
        }).catch(() => undefined);
        if (!accepted) {
          const sample = { text: quickFilled.text, parsed: quickFilled.parsed };
          const final = toSampleValues(
            {
              type: v.kind,
              amount,
              date: v.date,
              walletId: v.walletId,
              toWalletId: v.toWalletId,
              categoryId: v.categoryId,
              note: v.note,
            },
            { today: today(), wallets, categories },
          );
          void queryClient
            .ensureQueryData(quickTextSharingQuery)
            .then((enabled) =>
              enabled
                ? api('/quick-text/samples', { method: 'POST', body: { ...sample, final } })
                : undefined,
            )
            .catch(() => undefined);
        }
      }
      const templateSaved =
        saveAsTemplate && canSaveTemplate && v.kind !== 'TRANSFER'
          ? await createTemplateFrom(v)
          : null;
      const attachFailed =
        attachOn && v.kind !== 'TRANSFER' && savedId ? await syncAttachments(savedId) : 0;
      const linkFailed =
        onSaved && !editing && savedId
          ? await onSaved(savedId).then(
              () => false,
              () => true,
            )
          : false;
      void invalidate();
      if (linkFailed) {
        toast({
          message:
            'Transaksi tersimpan, tapi daftar email bank gagal diperbarui. Abaikan item itu agar tidak tercatat dua kali.',
          tone: 'warning',
        });
      } else if (attachFailed > 0) {
        toast({
          message: `Transaksi tersimpan, tapi ${attachFailed} foto gagal diproses. Coba lampirkan lagi.`,
          tone: 'warning',
        });
      } else if (templateSaved === false) {
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
      await deleteTransaction(editing.id);
      onDone();
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
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormAlert message={formError} />

      {quickTextOn && (
        <QuickTextField
          wallets={wallets}
          categories={categories}
          suggestCategory={
            autoCategoryOn
              ? (text, type) => suggestCategory(text, type, learned.data ?? [], categories)
              : undefined
          }
          onApply={applyQuickText}
        />
      )}

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
          setAutoPicked(null);
          autoPick(getValues('note'), next);
        }}
      />

      {templatesOn && !isTransfer && kindTemplates.length > 0 && (
        <TemplateChips templates={kindTemplates} onPick={applyTemplate} label="Isi dari template" />
      )}

      {ocrOn && !editing && kind === 'EXPENSE' && (
        <ReceiptScanner
          today={today()}
          onScanned={applyScan}
          onCleared={() => setScanned({})}
          onPhoto={setReceiptPhoto}
          attach={attachOn ? { checked: attachReceipt, onChange: setAttachReceipt } : undefined}
        />
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
          {suggestion && (
            <CategorySuggestionNote
              suggestion={suggestion}
              category={categories.find((c) => c.id === suggestion.categoryId)}
              picked={categoryId === suggestion.categoryId}
              onApply={() => {
                setValue('categoryId', suggestion.categoryId, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                setAutoPicked(suggestion.categoryId);
              }}
            />
          )}
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
          <Textarea
            {...a}
            placeholder={isTransfer ? 'Mis. tarik tunai' : 'Mis. makan siang'}
            maxLength={200}
            enterKeyHint="done"
            onKeyDown={(e) => {
              // Catatan satu paragraf: Enter tetap menyimpan seperti input biasa.
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }}
            {...register('note', {
              onChange: (e: ChangeEvent<HTMLTextAreaElement>) => autoPick(e.target.value),
            })}
          />
        )}
      </Field>

      {tagsOn && !isTransfer && <TagInput value={tags} onChange={setTags} />}

      {attachOn && !isTransfer && (
        <AttachmentField
          existing={existingAttachments}
          pending={pending}
          capacity={attachmentCapacity}
          onAdd={(photo) => {
            previewUrls.current.add(photo.url);
            setPending((list) => [...list, photo]);
          }}
          onRemovePending={(id) => {
            const photo = pending.find((p) => p.id === id);
            if (photo) {
              URL.revokeObjectURL(photo.url);
              previewUrls.current.delete(photo.url);
            }
            setPending((list) => list.filter((p) => p.id !== id));
          }}
          onRemoveExisting={(id) => setRemoved((list) => [...list, id])}
        />
      )}

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

/** Saran selalu bisa diabaikan: bila sudah terpilih cukup diberi keterangan, bila belum jadi tombol satu tap. */
function CategorySuggestionNote({
  suggestion,
  category,
  picked,
  onApply,
}: {
  suggestion: CategorySuggestion;
  category: CategoryDTO | undefined;
  picked: boolean;
  onApply: () => void;
}) {
  if (!category) return null;
  if (picked) {
    return (
      <p className="-mt-2 flex items-center gap-1.5 text-xs text-muted">
        <Sparkles className="size-3.5 shrink-0" aria-hidden />
        {suggestion.source === 'history'
          ? `${category.name} sesuai pilihanmu sebelumnya.`
          : `${category.name} ditebak dari catatan.`}{' '}
        Ketuk kategori lain untuk mengganti.
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onApply}
      className="-mt-2 inline-flex min-h-11 items-center gap-2 self-start rounded-full border border-primary/40 bg-primary-soft px-3 text-sm font-medium text-primary hover:border-primary"
    >
      <Sparkles className="size-4" aria-hidden />
      Saran: {category.name}
    </button>
  );
}
