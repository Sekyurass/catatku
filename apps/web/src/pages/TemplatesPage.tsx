import { formatRupiah, MAX_TEMPLATES, type TransactionTemplateDTO } from '@catatku/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Plus, Zap } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconBadge } from '../components/IconBadge';
import { TemplateSheet } from '../components/templates/TemplateSheet';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useFeatures } from '../lib/features';
import { categoryIcon } from '../lib/icons';
import { queryKeys, useTemplates } from '../lib/queries';

export function TemplatesPage() {
  const features = useFeatures();
  const enabled = features.data?.templates ?? false;
  const templates = useTemplates(enabled);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<TransactionTemplateDTO | 'new' | null>(null);
  const items = templates.data ?? [];
  const full = items.length >= MAX_TEMPLATES;

  const unavailable = features.isSuccess && !enabled;

  const move = async (index: number, offset: -1 | 1) => {
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(index + offset, 0, moved!);
    queryClient.setQueryData(queryKeys.templates, next);
    try {
      const res = await api<{ items: TransactionTemplateDTO[] }>('/templates/order', {
        method: 'PUT',
        body: { ids: next.map((t) => t.id) },
      });
      queryClient.setQueryData(queryKeys.templates, res.items);
    } catch (err) {
      toast({
        message: err instanceof Error ? err.message : 'Gagal mengubah urutan.',
        tone: 'error',
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.templates });
    }
  };

  const addButton = (label: string) => (
    <Button
      icon={<Plus className="size-4" aria-hidden />}
      onClick={() => setEditing('new')}
      disabled={full}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Template</h1>
        {enabled && templates.isSuccess && addButton('Tambah')}
      </header>
      <p className="-mt-2 text-sm text-muted">
        Transaksi yang sering kamu catat, seperti kopi pagi atau parkir. Tap di Beranda untuk
        langsung mencatatnya.
      </p>

      {features.isError ? (
        <Card>
          <ErrorState message={features.error.message} onRetry={() => void features.refetch()} />
        </Card>
      ) : unavailable ? (
        <Card>
          <EmptyState
            icon={Zap}
            title="Fitur belum tersedia"
            description="Template belum aktif untuk akunmu."
            action={
              <Link
                to="/"
                className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover"
              >
                Kembali ke Beranda
              </Link>
            }
          />
        </Card>
      ) : templates.isPending ? (
        <div
          className="flex flex-col gap-3"
          role="status"
          aria-busy="true"
          aria-label="Memuat template"
        >
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : templates.isError ? (
        <Card>
          <ErrorState message={templates.error.message} onRetry={() => void templates.refetch()} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Zap}
            title="Belum ada template"
            description="Buat di sini, atau centang “Simpan juga sebagai template” saat mencatat transaksi."
            action={addButton('Buat template')}
          />
        </Card>
      ) : (
        <>
          <Card className="p-1">
            <ul>
              {items.map((t, i) => (
                <li key={t.id} className="flex items-center gap-1">
                  <TemplateRow template={t} onSelect={() => setEditing(t)} />
                  {items.length > 1 && (
                    <div className="flex shrink-0 flex-col">
                      <ReorderButton
                        label={`Naikkan ${t.name}`}
                        disabled={i === 0}
                        onClick={() => void move(i, -1)}
                      >
                        <ChevronUp className="size-4" aria-hidden />
                      </ReorderButton>
                      <ReorderButton
                        label={`Turunkan ${t.name}`}
                        disabled={i === items.length - 1}
                        onClick={() => void move(i, 1)}
                      >
                        <ChevronDown className="size-4" aria-hidden />
                      </ReorderButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-center text-sm text-muted">
            {items.length} dari {MAX_TEMPLATES} template
            {full && '. Hapus yang jarang dipakai untuk menambah yang baru.'}
          </p>
        </>
      )}

      <TemplateSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        editing={editing === 'new' || editing === null ? undefined : editing}
      />
    </div>
  );
}

function ReorderButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-control text-muted hover:bg-surface-muted hover:text-fg disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function TemplateRow({
  template: t,
  onSelect,
}: {
  template: TransactionTemplateDTO;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-surface-muted"
    >
      <span className={cn(!t.usable && 'opacity-50')}>
        <IconBadge icon={categoryIcon(t.category.icon)} color={t.category.color} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{t.name}</span>
        <span className="block truncate text-sm text-muted">
          {t.category.name} · {t.wallet.name}
        </span>
        {!t.usable && (
          <span className="mt-0.5 inline-block rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
            Dompet/kategori diarsipkan
          </span>
        )}
      </span>
      {t.amount === null ? (
        <span className="shrink-0 text-right text-sm text-muted">
          Nominal diisi
          <br />
          saat dipakai
        </span>
      ) : (
        <span
          className={cn(
            'tabular shrink-0 font-semibold',
            t.type === 'EXPENSE' ? 'text-expense-text' : 'text-income-text',
          )}
        >
          {formatRupiah(t.type === 'EXPENSE' ? -t.amount : t.amount, { signed: true })}
        </span>
      )}
    </button>
  );
}
