import {
  CATEGORY_ICONS,
  type CategoryDTO,
  type CategoryIcon as IconName,
  type CategoryType,
} from '@catatku/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Lock, Plus, Tags, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { IconBadge } from '../components/IconBadge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ChoiceGrid } from '../components/ui/ChoiceGrid';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Dialog } from '../components/ui/Dialog';
import { Field, Input } from '../components/ui/Field';
import { Segmented } from '../components/ui/Segmented';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';
import { api } from '../lib/api';
import { applyServerErrors } from '../lib/forms';
import {
  CATEGORY_ICON_COMPONENTS,
  CATEGORY_ICON_LABELS,
  categoryIcon,
  swatchesWith,
} from '../lib/icons';
import { queryKeys, useCategories } from '../lib/queries';
import { FormAlert } from './auth/AuthLayout';

const TYPE_OPTIONS: { value: CategoryType; label: string }[] = [
  { value: 'EXPENSE', label: 'Pengeluaran' },
  { value: 'INCOME', label: 'Pemasukan' },
];

const ICON_OPTIONS = CATEGORY_ICONS.map((value) => ({ value, label: CATEGORY_ICON_LABELS[value] }));

const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Nama kategori wajib diisi' })
    .max(30, { error: 'Nama kategori maksimal 30 karakter' }),
  icon: z.enum(CATEGORY_ICONS),
  color: z.string(),
});
type CategoryForm = z.infer<typeof categoryFormSchema>;

export function CategoriesPage() {
  const [type, setType] = useState<CategoryType>('EXPENSE');
  const categories = useCategories(type);
  const [editing, setEditing] = useState<CategoryDTO | 'new' | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Kategori</h1>
        <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
          Tambah kategori
        </Button>
      </header>

      <Segmented label="Jenis kategori" value={type} onChange={setType} options={TYPE_OPTIONS} />

      {categories.isPending ? (
        <div
          className="flex flex-col gap-2"
          role="status"
          aria-busy="true"
          aria-label="Memuat kategori"
        >
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : categories.isError ? (
        <Card>
          <ErrorState
            message={categories.error.message}
            onRetry={() => void categories.refetch()}
          />
        </Card>
      ) : categories.data.length === 0 ? (
        <Card>
          <EmptyState icon={Tags} title="Belum ada kategori" />
        </Card>
      ) : (
        <Card className="p-1">
          <ul>
            {categories.data.map((c) => (
              <li key={c.id}>
                {c.isDefault ? (
                  <div className="flex min-h-14 items-center gap-3 px-2 py-2">
                    <IconBadge icon={categoryIcon(c.icon)} color={c.color} />
                    <span className="flex-1 font-medium">{c.name}</span>
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <Lock className="size-3.5" aria-hidden />
                      Bawaan
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(c)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-surface-muted"
                  >
                    <IconBadge icon={categoryIcon(c.icon)} color={c.color} />
                    <span className="flex-1 font-medium">{c.name}</span>
                    <span className="text-sm text-primary">Ubah</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Tambah kategori' : 'Ubah kategori'}
        description={
          editing === 'new'
            ? `Kategori ${type === 'EXPENSE' ? 'pengeluaran' : 'pemasukan'} baru`
            : undefined
        }
      >
        {editing !== null && (
          <CategoryFormBody
            category={editing === 'new' ? undefined : editing}
            type={type}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function CategoryFormBody({
  category,
  type,
  onDone,
}: {
  category?: CategoryDTO;
  type: CategoryType;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CategoryForm>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: category?.name ?? '',
      icon: (category?.icon as IconName | undefined) ?? 'circle-ellipsis',
      color: category?.color ?? '#64748B',
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.categories });
    void qc.invalidateQueries({ queryKey: ['transactions'] });
    void qc.invalidateQueries({ queryKey: ['reports'] });
  };

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      if (category) await api(`/categories/${category.id}`, { method: 'PATCH', body: v });
      else await api('/categories', { method: 'POST', body: { ...v, type } });
      refresh();
      toast({ message: category ? 'Kategori diperbarui' : 'Kategori ditambahkan' });
      onDone();
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ['name', 'icon', 'color']));
    }
  });

  const onDelete = async () => {
    setDeleting(true);
    try {
      await api(`/categories/${category!.id}`, { method: 'DELETE' });
      refresh();
      toast({ message: 'Kategori dihapus' });
      onDone();
    } catch (err) {
      setFormError(applyServerErrors(err, setError, []));
      setDeleting(false);
      setConfirming(false);
    }
  };

  const icon = watch('icon');
  const color = watch('color');

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormAlert message={formError} />
      <div className="flex items-end gap-3">
        <IconBadge icon={CATEGORY_ICON_COMPONENTS[icon]} color={color} className="mb-0.5 size-11" />
        <Field label="Nama kategori" error={errors.name?.message} className="flex-1">
          {(a) => <Input {...a} placeholder="Mis. Kopi" data-autofocus {...register('name')} />}
        </Field>
      </div>
      <ChoiceGrid
        legend="Ikon"
        options={ICON_OPTIONS}
        value={icon}
        onChange={(v) => setValue('icon', v, { shouldDirty: true })}
        render={(v, selected) => {
          const Icon = CATEGORY_ICON_COMPONENTS[v];
          return (
            <Icon className="size-5" style={{ color: selected ? color : undefined }} aria-hidden />
          );
        }}
      />
      <ChoiceGrid
        legend="Warna"
        options={swatchesWith(color)}
        value={color}
        onChange={(c) => setValue('color', c, { shouldDirty: true })}
        render={(c) => <span className="size-7 rounded-full" style={{ backgroundColor: c }} />}
      />
      <div className="flex items-center gap-2 pt-1">
        {category && (
          <Button
            variant="ghost"
            className="text-expense-text"
            onClick={() => setConfirming(true)}
            icon={<Trash2 className="size-4" aria-hidden />}
          >
            Hapus
          </Button>
        )}
        <Button type="submit" size="lg" loading={isSubmitting} className="flex-1">
          Simpan
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={`Hapus kategori "${category?.name ?? ''}"?`}
        description="Kategori tidak bisa dipilih lagi untuk transaksi baru. Transaksi lama tetap menampilkan kategori ini."
        confirmLabel="Hapus"
        loading={deleting}
        onConfirm={onDelete}
        onClose={() => setConfirming(false)}
      />
    </form>
  );
}
