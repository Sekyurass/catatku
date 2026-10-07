import {
  type CategoryDTO,
  formatRupiah,
  MAX_AMOUNT,
  type TransactionTemplateDTO,
  type WalletDTO,
} from '@catatku/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2, WalletMinimal } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { FormAlert } from '../../pages/auth/AuthLayout';
import { api } from '../../lib/api';
import { applyServerErrors } from '../../lib/forms';
import {
  pickDefaultWallet,
  useCategories,
  useInvalidateMoney,
  useWallets,
} from '../../lib/queries';
import { CategoryPicker } from '../transactions/CategoryPicker';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Dialog } from '../ui/Dialog';
import { Field, Input } from '../ui/Field';
import { RupiahInput } from '../ui/RupiahInput';
import { Segmented } from '../ui/Segmented';
import { ColorDot, Select, type SelectOption } from '../ui/Select';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';
import { useToast } from '../ui/Toast';

const formSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: 'Nama wajib diisi' })
      .max(40, { error: 'Nama maksimal 40 karakter' }),
    type: z.enum(['EXPENSE', 'INCOME']),
    amount: z.number().nullable(),
    walletId: z.string(),
    categoryId: z.string(),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (v.amount !== null && v.amount <= 0) issue('amount', 'Masukkan nominal lebih dari 0');
    else if (v.amount !== null && v.amount > MAX_AMOUNT) issue('amount', 'Nominal terlalu besar');
    if (!v.walletId) issue('walletId', 'Pilih dompet');
    if (!v.categoryId) issue('categoryId', 'Pilih kategori');
  });
type FormValues = z.infer<typeof formSchema>;

const FIELD_NAMES: Array<keyof FormValues> = ['name', 'amount', 'walletId', 'categoryId'];

export function TemplateSheet({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: TransactionTemplateDTO;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={editing ? 'Ubah template' : 'Template baru'}>
      <TemplateFormPanel editing={editing} onDone={onClose} />
    </Dialog>
  );
}

function TemplateFormPanel({
  editing,
  onDone,
}: {
  editing?: TransactionTemplateDTO;
  onDone: () => void;
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
        description="Buat dompet dulu sebelum membuat template."
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
    <TemplateForm
      wallets={wallets.data}
      categories={categories.data}
      editing={editing}
      onDone={onDone}
    />
  );
}

function defaultValues(
  wallets: WalletDTO[],
  categories: CategoryDTO[],
  editing?: TransactionTemplateDTO,
): FormValues {
  if (editing) {
    const walletActive = wallets.some((w) => w.id === editing.walletId && !w.archivedAt);
    const categoryActive = categories.some((c) => c.id === editing.categoryId && !c.archivedAt);
    return {
      name: editing.name,
      type: editing.type,
      amount: editing.amount,
      walletId: walletActive ? editing.walletId : '',
      categoryId: categoryActive ? editing.categoryId : '',
    };
  }
  return {
    name: '',
    type: 'EXPENSE',
    amount: null,
    walletId: pickDefaultWallet(wallets)?.id ?? '',
    categoryId: '',
  };
}

function TemplateForm({
  wallets,
  categories,
  editing,
  onDone,
}: {
  wallets: WalletDTO[];
  categories: CategoryDTO[];
  editing?: TransactionTemplateDTO;
  onDone: () => void;
}) {
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
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
    defaultValues: defaultValues(wallets, categories, editing),
  });

  const type = watch('type');

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      if (editing) {
        const changed = Object.fromEntries(
          Object.entries(v).filter(([key]) => dirtyFields[key as keyof FormValues]),
        );
        await api(`/templates/${editing.id}`, { method: 'PATCH', body: changed });
      } else {
        await api('/templates', { method: 'POST', body: v });
      }
      void invalidate();
      toast({ message: editing ? 'Perubahan tersimpan' : 'Template dibuat' });
      onDone();
    } catch (err) {
      setFormError(applyServerErrors(err, setError, FIELD_NAMES));
    }
  });

  const onDelete = async () => {
    if (!editing) return;
    setDeleting(true);
    try {
      await api(`/templates/${editing.id}`, { method: 'DELETE' });
      void invalidate();
      toast({ message: 'Template dihapus', tone: 'info' });
      onDone();
    } catch (err) {
      setConfirmingDelete(false);
      setFormError(applyServerErrors(err, setError, FIELD_NAMES));
      setDeleting(false);
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

      {editing && !editing.usable && (
        <p className="rounded-control bg-surface-muted px-3 py-2 text-sm text-muted">
          Dompet atau kategori template ini sudah diarsipkan. Pilih yang masih aktif agar bisa
          dipakai lagi.
        </p>
      )}

      <Field label="Nama" error={errors.name?.message}>
        {(a) => (
          <Input
            {...a}
            placeholder="Mis. Kopi pagi, Parkir kantor"
            maxLength={40}
            enterKeyHint="next"
            data-autofocus
            {...register('name')}
          />
        )}
      </Field>

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

      <Field
        label="Nominal (opsional)"
        hint="Kosongkan untuk nominal yang berubah-ubah. Kamu akan diminta mengisinya saat dipakai."
        error={errors.amount?.message}
      >
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
                placeholder="Pilih dompet"
              />
            )}
          />
        )}
      </Field>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {editing && (
          <Button
            variant="ghost"
            className="text-expense-text"
            onClick={() => setConfirmingDelete(true)}
            icon={<Trash2 className="size-4" aria-hidden />}
          >
            Hapus
          </Button>
        )}
        <Button type="submit" size="lg" loading={isSubmitting} className="min-w-32 flex-1">
          Simpan
        </Button>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={onDelete}
        loading={deleting}
        title="Hapus template?"
        description="Transaksi yang pernah dicatat dari template ini tetap ada."
        confirmLabel="Hapus"
      />
    </form>
  );
}
