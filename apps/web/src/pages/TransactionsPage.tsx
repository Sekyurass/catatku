import { formatRupiah, type TransactionDTO, type TransactionType } from '@catatku/shared';
import { ListFilter, Plus, ReceiptText, Search, SearchX, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExportButton } from '../components/ExportButton';
import { useQuickAdd } from '../components/transactions/QuickAdd';
import { TransactionRow } from '../components/transactions/TransactionRow';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { IconBadge } from '../components/IconBadge';
import { DatePicker } from '../components/ui/DatePicker';
import { Field, Input } from '../components/ui/Field';
import { ColorDot, Select } from '../components/ui/Select';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { cn } from '../lib/cn';
import { formatDayLabel } from '../lib/format';
import { categoryIcon } from '../lib/icons';
import {
  type TransactionFilters,
  useCategories,
  useTransactions,
  useWallets,
} from '../lib/queries';

const FILTER_KEYS = ['q', 'type', 'walletId', 'categoryId', 'from', 'to'] as const;

const TYPE_LABELS: Record<TransactionType, string> = {
  EXPENSE: 'Pengeluaran',
  INCOME: 'Pemasukan',
  TRANSFER: 'Transfer',
};

function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    for (const key of FILTER_KEYS) {
      const value = params.get(key);
      if (value) f[key] = value;
    }
    return f as TransactionFilters;
  }, [params]);

  const update = (patch: Partial<Record<(typeof FILTER_KEYS)[number], string>>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  };
  const reset = () => setParams({}, { replace: true });
  return { filters, update, reset };
}

function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text, value, onChange]);

  return (
    <div className="relative flex-1">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted"
        aria-hidden
      />
      <Input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Cari catatan atau kategori"
        aria-label="Cari transaksi"
        className="pl-10"
      />
    </div>
  );
}

export function TransactionsPage() {
  const { filters, update, reset } = useFilters();
  const { openNew, openEdit } = useQuickAdd();
  const wallets = useWallets(true);
  const categories = useCategories();
  const query = useTransactions(filters);
  const activeCount = FILTER_KEYS.filter((k) => k !== 'q' && filters[k]).length;
  const [showFilters, setShowFilters] = useState(activeCount > 0);
  const hasAnyFilter = activeCount > 0 || Boolean(filters.q);

  const groups = useMemo(() => {
    const items = query.data?.pages.flatMap((p) => p.items) ?? [];
    // Tanpa filter dompet, satu transfer cukup tampil sekali (sisi keluarnya).
    const visible = filters.walletId
      ? items
      : items.filter((t) => !(t.type === 'TRANSFER' && t.amount > 0));
    const out: { date: string; items: TransactionDTO[]; net: number }[] = [];
    for (const tx of visible) {
      let group = out[out.length - 1];
      if (!group || group.date !== tx.date) {
        group = { date: tx.date, items: [], net: 0 };
        out.push(group);
      }
      group.items.push(tx);
      if (tx.type !== 'TRANSFER') group.net += tx.amount;
    }
    return out;
  }, [query.data, filters.walletId]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Transaksi</h1>
        <div className="flex gap-2">
          <ExportButton filters={filters} />
          <Button
            className="hidden md:inline-flex"
            icon={<Plus className="size-4" aria-hidden />}
            onClick={() => openNew()}
          >
            Catat transaksi
          </Button>
        </div>
      </header>

      <div className="flex gap-2">
        <SearchBox value={filters.q ?? ''} onChange={(q) => update({ q })} />
        <Button
          variant="secondary"
          onClick={() => setShowFilters((s) => !s)}
          aria-expanded={showFilters}
          aria-controls="panel-filter"
          icon={<ListFilter className="size-4" aria-hidden />}
        >
          Filter
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-xs text-white">{activeCount}</span>
          )}
        </Button>
      </div>

      {showFilters && (
        <Card id="panel-filter" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Jenis">
            {(a) => (
              <Select
                {...a}
                value={filters.type ?? ''}
                onChange={(type) => update({ type })}
                options={[
                  { value: '', label: 'Semua jenis' },
                  ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
                ]}
              />
            )}
          </Field>
          <Field label="Dompet">
            {(a) => (
              <Select
                {...a}
                value={filters.walletId ?? ''}
                onChange={(walletId) => update({ walletId })}
                options={[
                  { value: '', label: 'Semua dompet' },
                  ...(wallets.data ?? []).map((w) => ({
                    value: w.id,
                    label: w.name,
                    detail: w.archivedAt ? 'diarsipkan' : undefined,
                    leading: <ColorDot color={w.color} />,
                  })),
                ]}
              />
            )}
          </Field>
          <Field label="Kategori">
            {(a) => (
              <Select
                {...a}
                value={filters.categoryId ?? ''}
                onChange={(categoryId) => update({ categoryId })}
                options={[
                  { value: '', label: 'Semua kategori' },
                  ...(['EXPENSE', 'INCOME'] as const).flatMap((type) =>
                    (categories.data ?? [])
                      .filter((c) => c.type === type)
                      .map((c) => ({
                        value: c.id,
                        label: c.name,
                        group: TYPE_LABELS[type],
                        leading: (
                          <IconBadge
                            icon={categoryIcon(c.icon)}
                            color={c.color}
                            size="sm"
                            className="size-7"
                          />
                        ),
                      })),
                  ),
                ]}
              />
            )}
          </Field>
          <Field label="Dari tanggal">
            {(a) => (
              <DatePicker
                {...a}
                value={filters.from ?? ''}
                max={filters.to}
                clearable
                placeholder="Semua tanggal"
                onChange={(from) => update({ from })}
              />
            )}
          </Field>
          <Field label="Sampai tanggal">
            {(a) => (
              <DatePicker
                {...a}
                value={filters.to ?? ''}
                min={filters.from}
                clearable
                placeholder="Semua tanggal"
                onChange={(to) => update({ to })}
              />
            )}
          </Field>
          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={reset}
              disabled={!hasAnyFilter}
              icon={<X className="size-4" aria-hidden />}
            >
              Hapus filter
            </Button>
          </div>
        </Card>
      )}

      {query.isPending ? (
        <Card className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat transaksi">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </Card>
      ) : query.isError ? (
        <Card>
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          {hasAnyFilter ? (
            <EmptyState
              icon={SearchX}
              title="Tidak ada transaksi yang cocok"
              description="Coba ubah kata kunci atau filter."
              action={
                <Button variant="secondary" onClick={reset}>
                  Hapus filter
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={ReceiptText}
              title="Belum ada transaksi"
              description="Catat pengeluaran atau pemasukan pertamamu. Cuma butuh beberapa detik."
              action={
                <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => openNew()}>
                  Catat transaksi
                </Button>
              }
            />
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section key={group.date} aria-labelledby={`hari-${group.date}`}>
              <div className="mb-1 flex items-baseline justify-between px-2">
                <h2 id={`hari-${group.date}`} className="text-sm font-semibold text-muted">
                  {formatDayLabel(group.date)}
                </h2>
                {group.net !== 0 && (
                  <span
                    className={cn(
                      'tabular text-sm font-medium',
                      group.net > 0 ? 'text-income-text' : 'text-muted',
                    )}
                  >
                    {formatRupiah(group.net, { signed: true })}
                  </span>
                )}
              </div>
              <Card className="p-1">
                <ul>
                  {group.items.map((tx) => (
                    <li key={tx.id}>
                      <TransactionRow
                        tx={tx}
                        onSelect={openEdit}
                        showTransferSign={Boolean(filters.walletId)}
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}

          {query.hasNextPage && (
            <Button
              variant="secondary"
              className="self-center"
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Muat lebih banyak
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
