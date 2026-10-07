import {
  type CategoryType,
  currentMonth,
  formatRupiah,
  type TagDTO,
  TAG_NAME_MAX,
} from '@catatku/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Hash, Pencil, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Dialog } from '../components/ui/Dialog';
import { Field, Input } from '../components/ui/Field';
import { MonthSwitcher } from '../components/ui/MonthSwitcher';
import { Segmented } from '../components/ui/Segmented';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';
import { api, ApiError } from '../lib/api';
import { useFeatures } from '../lib/features';
import { formatMonthLabel } from '../lib/format';
import { queryKeys, useByTag, useTags } from '../lib/queries';

const TYPE_OPTIONS: { value: CategoryType; label: string }[] = [
  { value: 'EXPENSE', label: 'Pengeluaran' },
  { value: 'INCOME', label: 'Pemasukan' },
];

export function TagsPage() {
  const features = useFeatures();
  const enabled = features.data?.tags ?? false;
  const [month, setMonth] = useState(currentMonth);
  const [type, setType] = useState<CategoryType>('EXPENSE');
  const tags = useTags(enabled);
  const report = useByTag(month, type, enabled);
  const [renaming, setRenaming] = useState<TagDTO | null>(null);
  const [deleting, setDeleting] = useState<TagDTO | null>(null);

  const totals = new Map((report.data?.items ?? []).map((i) => [i.tagId, i]));
  const items = [...(tags.data ?? [])].sort(
    (a, b) =>
      (totals.get(b.id)?.total ?? 0) - (totals.get(a.id)?.total ?? 0) ||
      a.name.localeCompare(b.name, 'id'),
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Tag</h1>
      <p className="-mt-2 text-sm text-muted">
        Kelompokkan transaksi lintas kategori, misalnya semua biaya liburan atau proyek kantor.
        Tambahkan tag saat mencatat transaksi.
      </p>

      {features.isError ? (
        <Card>
          <ErrorState message={features.error.message} onRetry={() => void features.refetch()} />
        </Card>
      ) : features.isSuccess && !enabled ? (
        <Card>
          <EmptyState
            icon={Hash}
            title="Fitur belum tersedia"
            description="Tag belum aktif untuk akunmu."
          />
        </Card>
      ) : tags.isPending ? (
        <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-label="Memuat tag">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : tags.isError ? (
        <Card>
          <ErrorState message={tags.error.message} onRetry={() => void tags.refetch()} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Hash}
            title="Belum ada tag"
            description="Isi kolom Tag saat mencatat transaksi, mis. “liburan” atau “kantor”."
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <MonthSwitcher month={month} onChange={setMonth} />
            <Segmented
              label="Jenis laporan"
              value={type}
              options={TYPE_OPTIONS}
              onChange={setType}
            />
          </div>
          <Card className="p-1">
            <ul aria-label={`Tag, total ${formatMonthLabel(month)}`}>
              {items.map((t) => (
                <TagRow
                  key={t.id}
                  tag={t}
                  monthTotal={totals.get(t.id)}
                  type={type}
                  onRename={() => setRenaming(t)}
                  onDelete={() => setDeleting(t)}
                />
              ))}
            </ul>
          </Card>
          <p className="text-center text-xs text-muted">
            Satu transaksi bisa punya beberapa tag, jadi totalnya bisa terhitung di lebih dari satu
            tag.
          </p>
        </>
      )}

      <RenameDialog tag={renaming} onClose={() => setRenaming(null)} />
      <DeleteDialog tag={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function TagRow({
  tag,
  monthTotal,
  type,
  onRename,
  onDelete,
}: {
  tag: TagDTO;
  monthTotal: { total: number; count: number } | undefined;
  type: CategoryType;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-1">
      <Link
        to={`/transaksi?tagId=${encodeURIComponent(tag.id)}`}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-control px-2 py-2 hover:bg-surface-muted"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Hash className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{tag.name}</span>
          <span className="block text-sm text-muted">{tag.count} transaksi</span>
        </span>
        <span className="shrink-0 text-right">
          <span
            className={
              monthTotal
                ? `tabular block font-semibold ${type === 'EXPENSE' ? 'text-expense-text' : 'text-income-text'}`
                : 'block text-sm text-muted'
            }
          >
            {monthTotal ? formatRupiah(monthTotal.total) : 'Rp 0'}
          </span>
          {monthTotal && (
            <span className="block text-xs text-muted">{monthTotal.count} bulan ini</span>
          )}
        </span>
      </Link>
      <button
        type="button"
        onClick={onRename}
        aria-label={`Ganti nama tag ${tag.name}`}
        className="flex size-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-surface-muted hover:text-fg"
      >
        <Pencil className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Hapus tag ${tag.name}`}
        className="flex size-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-surface-muted hover:text-expense-text"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </li>
  );
}

function useRefreshTags() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [queryKeys.tags, ['transactions'], ['reports']].map((queryKey) =>
        qc.invalidateQueries({ queryKey }),
      ),
    );
}

function RenameDialog({ tag, onClose }: { tag: TagDTO | null; onClose: () => void }) {
  return (
    <Dialog open={!!tag} onClose={onClose} title="Ganti nama tag">
      {tag && <RenameForm tag={tag} onClose={onClose} />}
    </Dialog>
  );
}

function RenameForm({ tag, onClose }: { tag: TagDTO; onClose: () => void }) {
  const [name, setName] = useState(tag.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useRefreshTags();
  const toast = useToast();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/tags/${tag.id}`, { method: 'PATCH', body: { name } });
      void refresh();
      toast({ message: 'Nama tag diganti' });
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.fields?.name ?? err.message) : 'Gagal menyimpan. Coba lagi.',
      );
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
      <Field label="Nama tag" error={error ?? undefined}>
        {(a) => (
          <Input
            {...a}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={TAG_NAME_MAX}
            data-autofocus
          />
        )}
      </Field>
      <Button type="submit" size="lg" loading={busy} disabled={!name.trim()}>
        Simpan
      </Button>
    </form>
  );
}

function DeleteDialog({ tag, onClose }: { tag: TagDTO | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const refresh = useRefreshTags();
  const toast = useToast();
  return (
    <ConfirmDialog
      open={!!tag}
      title={tag ? `Hapus tag #${tag.name}?` : 'Hapus tag?'}
      description={
        tag ? `Tag dilepas dari ${tag.count} transaksi. Transaksinya sendiri tidak terhapus.` : ''
      }
      confirmLabel="Hapus tag"
      loading={busy}
      onClose={onClose}
      onConfirm={async () => {
        if (!tag) return;
        setBusy(true);
        try {
          await api(`/tags/${tag.id}`, { method: 'DELETE' });
          void refresh();
          toast({ message: 'Tag dihapus', tone: 'info' });
          onClose();
        } catch {
          toast({ message: 'Gagal menghapus tag. Coba lagi.', tone: 'error' });
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
