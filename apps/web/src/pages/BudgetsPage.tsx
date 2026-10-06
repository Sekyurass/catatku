import {
  type BudgetDTO,
  type BudgetMonthDTO,
  type BudgetScope,
  budgetStatus,
  currentMonth,
  formatRupiah,
  MONTH_REGEX,
  shiftMonth,
} from '@catatku/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, PiggyBank, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IconBadge } from '../components/IconBadge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Dialog } from '../components/ui/Dialog';
import { Field } from '../components/ui/Field';
import { ProgressBar } from '../components/ui/ProgressBar';
import { RupiahInput } from '../components/ui/RupiahInput';
import { Segmented } from '../components/ui/Segmented';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';
import { api } from '../lib/api';
import { BUDGET_STATUS, budgetPercent, remainingLabel } from '../lib/budget';
import { cn } from '../lib/cn';
import { applyServerErrors } from '../lib/forms';
import { formatMonthLabel } from '../lib/format';
import { categoryIcon } from '../lib/icons';
import { queryKeys, useBudgets } from '../lib/queries';
import { FormAlert } from './auth/AuthLayout';

function useMonthParam() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('bulan');
  const month = raw && MONTH_REGEX.test(raw) ? raw : currentMonth();
  const setMonth = (next: string) =>
    setParams(next === currentMonth() ? {} : { bulan: next }, { replace: true });
  return [month, setMonth] as const;
}

export function BudgetsPage() {
  const [month, setMonth] = useMonthParam();
  const budgets = useBudgets(month);
  const [editing, setEditing] = useState<BudgetDTO | null>(null);

  const items = budgets.data?.items ?? [];
  const budgeted = items.filter((i) => i.id !== null);
  const unbudgeted = items.filter((i) => i.id === null);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Anggaran</h1>
        <MonthSwitcher month={month} onChange={setMonth} />
      </header>

      {budgets.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat anggaran">
          <Skeleton className="h-32" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : budgets.isError ? (
        <Card>
          <ErrorState message={budgets.error.message} onRetry={() => void budgets.refetch()} />
        </Card>
      ) : (
        <div
          className={cn(
            'flex flex-col gap-4 transition-opacity',
            budgets.isPlaceholderData && 'opacity-60',
          )}
          aria-busy={budgets.isPlaceholderData}
        >
          {budgeted.length > 0 ? (
            <>
              <TotalCard data={budgets.data} count={budgeted.length} />
              <section aria-labelledby="judul-beranggaran">
                <h2 id="judul-beranggaran" className="mb-2 px-1 text-sm font-semibold text-muted">
                  Kategori beranggaran
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {budgeted.map((item) => (
                    <BudgetCard key={item.categoryId} item={item} onEdit={() => setEditing(item)} />
                  ))}
                </div>
              </section>
            </>
          ) : (
            <Card>
              <EmptyState
                icon={PiggyBank}
                title={`Belum ada anggaran untuk ${formatMonthLabel(month)}`}
                description="Tentukan batas pengeluaran per kategori supaya kamu tahu kapan perlu mengerem. Cukup atur sekali, anggaran otomatis berlanjut ke bulan berikutnya."
              />
            </Card>
          )}

          {unbudgeted.length > 0 && (
            <Card className="p-2 sm:p-4">
              <CardHeader title="Belum ada anggaran" className="px-2 sm:px-0" />
              <ul>
                {unbudgeted.map((item) => (
                  <li key={item.categoryId}>
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className="flex min-h-14 w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-surface-muted"
                    >
                      <IconBadge
                        icon={categoryIcon(item.category.icon)}
                        color={item.category.color}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.category.name}</span>
                        <span className="tabular block text-sm text-muted">
                          {item.spent > 0
                            ? `Terpakai ${formatRupiah(item.spent)} bulan ini`
                            : 'Belum ada pengeluaran'}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-primary">
                        Atur
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Anggaran ${editing.category.name}` : ''}
        description={formatMonthLabel(month)}
      >
        {editing && <BudgetForm item={editing} month={month} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const isCurrent = month === currentMonth();
  return (
    <div className="flex items-center gap-1 rounded-control border border-line bg-surface p-1">
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, -1))}
        className="flex size-10 items-center justify-center rounded-control text-muted hover:bg-surface-muted hover:text-fg"
        aria-label="Bulan sebelumnya"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onChange(currentMonth())}
        disabled={isCurrent}
        className="min-h-10 min-w-36 rounded-control px-2 text-sm font-semibold enabled:hover:bg-surface-muted"
        title={isCurrent ? undefined : 'Kembali ke bulan ini'}
        aria-live="polite"
      >
        {formatMonthLabel(month)}
      </button>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, 1))}
        className="flex size-10 items-center justify-center rounded-control text-muted hover:bg-surface-muted hover:text-fg"
        aria-label="Bulan berikutnya"
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: BudgetDTO['status'] }) {
  const meta = BUDGET_STATUS[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        meta.badge,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {meta.label}
    </span>
  );
}

function TotalCard({ data, count }: { data: BudgetMonthDTO; count: number }) {
  const { totalLimit, totalSpent } = data;
  const status = budgetStatus(totalSpent, totalLimit);
  const ratio = totalLimit > 0 ? totalSpent / totalLimit : 0;
  const remaining = totalLimit - totalSpent;
  const counts = data.items.reduce(
    (acc, i) =>
      i.id !== null && i.status !== 'ok' ? { ...acc, [i.status]: acc[i.status] + 1 } : acc,
    { warning: 0, over: 0 },
  );

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-muted">Total anggaran {count} kategori</p>
          <p className={cn('tabular truncate text-3xl font-bold', BUDGET_STATUS[status].text)}>
            {remainingLabel(remaining)}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>
      <ProgressBar
        ratio={ratio}
        label="Total anggaran terpakai"
        barClassName={BUDGET_STATUS[status].bar}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted">
        <span className="tabular">
          Terpakai {formatRupiah(totalSpent)} dari {formatRupiah(totalLimit)} (
          {budgetPercent(ratio)}%)
        </span>
        {(counts.warning > 0 || counts.over > 0) && (
          <span className="flex gap-3">
            {counts.warning > 0 && (
              <span className="text-warning-text">{counts.warning} hampir habis</span>
            )}
            {counts.over > 0 && <span className="text-expense-text">{counts.over} terlampaui</span>}
          </span>
        )}
      </div>
    </Card>
  );
}

function BudgetCard({ item, onEdit }: { item: BudgetDTO; onEdit: () => void }) {
  const meta = BUDGET_STATUS[item.status];
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 text-left shadow-card hover:bg-surface-muted/60"
      aria-label={`Ubah anggaran ${item.category.name}`}
    >
      <span className="flex items-center gap-3">
        <IconBadge icon={categoryIcon(item.category.icon)} color={item.category.color} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{item.category.name}</span>
          {item.since === item.month && item.endsThisMonth ? (
            <span className="block truncate text-xs text-muted">Khusus bulan ini</span>
          ) : (
            item.since &&
            item.since !== item.month && (
              <span className="block truncate text-xs text-muted">
                Berlanjut sejak {formatMonthLabel(item.since)}
              </span>
            )
          )}
        </span>
        <StatusBadge status={item.status} />
      </span>
      <ProgressBar
        ratio={item.ratio}
        label={`Anggaran ${item.category.name} terpakai`}
        barClassName={meta.bar}
      />
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="tabular text-muted">
          {formatRupiah(item.spent)} dari {formatRupiah(item.limitAmount)}
        </span>
        <span className={cn('tabular font-semibold', meta.text)}>
          {remainingLabel(item.remaining)} · {budgetPercent(item.ratio)}%
        </span>
      </span>
    </button>
  );
}

function BudgetForm({
  item,
  month,
  onDone,
}: {
  item: BudgetDTO;
  month: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [limit, setLimit] = useState<number | null>(item.id ? item.limitAmount : null);
  const [scope, setScope] = useState<BudgetScope>(
    item.since === month && item.endsThisMonth ? 'month' : 'onward',
  );
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const monthLabel = formatMonthLabel(month);
  const name = item.category.name;

  const save = async (limitAmount: number, kind: 'save' | 'delete') => {
    setBusy(kind);
    setFormError(null);
    try {
      const data = await api<BudgetMonthDTO>('/budgets', {
        method: 'PUT',
        body: { month, items: [{ categoryId: item.categoryId, limitAmount, scope }] },
      });
      qc.setQueryData(queryKeys.budgets(month), data);
      const messages = {
        save: {
          onward: `Anggaran ${name} berlaku mulai ${monthLabel}`,
          month: `Anggaran ${name} khusus ${monthLabel} disimpan`,
        },
        delete: {
          onward: `Anggaran ${name} dihentikan mulai ${monthLabel}`,
          month: `Anggaran ${name} dikosongkan untuk ${monthLabel} saja`,
        },
      };
      toast({ message: messages[kind][scope] });
      // Bulan lain bisa ikut berubah karena anggaran berlanjut.
      void qc.invalidateQueries({ queryKey: ['budgets'] });
      onDone();
    } catch (err) {
      setFormError(applyServerErrors(err, () => undefined, []));
      setBusy(null);
    }
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!limit || limit <= 0) {
          setError('Masukkan batas lebih dari 0');
          return;
        }
        void save(limit, 'save');
      }}
    >
      <FormAlert message={formError} />
      <p className="text-sm text-muted">
        Terpakai bulan ini:{' '}
        <span className="tabular font-semibold text-fg">{formatRupiah(item.spent)}</span>
      </p>
      <Field
        label="Batas per bulan"
        error={error}
        hint="Kamu akan diingatkan saat pemakaian mencapai 80% dan 100%."
      >
        {(a) => (
          <RupiahInput
            {...a}
            size="lg"
            data-autofocus
            value={limit}
            onChange={(v) => {
              setLimit(v);
              setError(undefined);
            }}
            placeholder="0"
          />
        )}
      </Field>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium" aria-hidden>
          Berlaku untuk
        </p>
        <Segmented<BudgetScope>
          label="Berlaku untuk"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'onward', label: 'Mulai bulan ini' },
            { value: 'month', label: 'Hanya bulan ini' },
          ]}
        />
        <p className="text-sm text-muted">
          {scope === 'onward'
            ? `Berlaku untuk ${monthLabel} dan bulan-bulan berikutnya sampai kamu ubah.`
            : `Hanya untuk ${monthLabel}. Bulan berikutnya tetap memakai pengaturan sebelumnya.`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {item.id && (
          <Button
            variant="ghost"
            className="text-expense-text"
            loading={busy === 'delete'}
            disabled={busy !== null}
            onClick={() => void save(0, 'delete')}
            icon={<Trash2 className="size-4" aria-hidden />}
          >
            {scope === 'onward' ? 'Hentikan mulai bulan ini' : 'Kosongkan bulan ini saja'}
          </Button>
        )}
        <Button
          type="submit"
          size="lg"
          className="flex-1"
          loading={busy === 'save'}
          disabled={busy !== null}
        >
          Simpan
        </Button>
      </div>
    </form>
  );
}
