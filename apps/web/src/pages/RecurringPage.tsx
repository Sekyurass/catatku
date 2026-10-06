import { describeRecurrence, formatRupiah, type RecurringRuleDTO } from '@catatku/shared';
import { Plus, Repeat } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconBadge } from '../components/IconBadge';
import { RecurringSheet } from '../components/recurring/RecurringSheet';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { cn } from '../lib/cn';
import { useFeatures } from '../lib/features';
import { formatShortDate } from '../lib/format';
import { categoryIcon } from '../lib/icons';
import { useRecurringRules } from '../lib/queries';

export function RecurringPage() {
  const features = useFeatures();
  const enabled = features.data?.recurring_transactions ?? false;
  const rules = useRecurringRules(enabled);
  const [editing, setEditing] = useState<RecurringRuleDTO | 'new' | null>(null);
  const items = rules.data ?? [];

  const unavailable = features.isSuccess && !enabled;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Transaksi berulang</h1>
        {enabled && (
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
            Tambah
          </Button>
        )}
      </header>
      <p className="-mt-2 text-sm text-muted">
        Gaji, sewa, atau langganan dicatat otomatis sesuai jadwal, jadi kamu tidak perlu
        mengingatnya.
      </p>

      {features.isError ? (
        <Card>
          <ErrorState message={features.error.message} onRetry={() => void features.refetch()} />
        </Card>
      ) : unavailable ? (
        <Card>
          <EmptyState
            icon={Repeat}
            title="Fitur belum tersedia"
            description="Transaksi berulang belum aktif untuk akunmu."
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
      ) : rules.isPending ? (
        <div
          className="flex flex-col gap-3"
          aria-busy="true"
          aria-label="Memuat transaksi berulang"
        >
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : rules.isError ? (
        <Card>
          <ErrorState message={rules.error.message} onRetry={() => void rules.refetch()} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Repeat}
            title="Belum ada transaksi berulang"
            description="Contohnya gaji tiap tanggal 25 atau tagihan internet tiap bulan."
            action={
              <Button
                icon={<Plus className="size-4" aria-hidden />}
                onClick={() => setEditing('new')}
              >
                Tambah transaksi berulang
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="p-1">
          <ul>
            {items.map((rule) => (
              <li key={rule.id}>
                <RuleRow rule={rule} onSelect={() => setEditing(rule)} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <RecurringSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        editing={editing === 'new' || editing === null ? undefined : editing}
      />
    </div>
  );
}

function ruleStatus(rule: RecurringRuleDTO): string {
  if (rule.paused) return 'Dijeda';
  if (!rule.nextRunAt) return 'Selesai';
  return `Berikutnya ${formatShortDate(rule.nextRunAt)}`;
}

function RuleRow({ rule, onSelect }: { rule: RecurringRuleDTO; onSelect: () => void }) {
  const inactive = rule.paused || !rule.nextRunAt;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex min-h-16 w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-surface-muted"
    >
      <span className={cn(inactive && 'opacity-50')}>
        <IconBadge icon={categoryIcon(rule.category.icon)} color={rule.category.color} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{rule.note || rule.category.name}</span>
        <span className="block truncate text-sm text-muted">
          {describeRecurrence(rule)} · {rule.wallet.name}
        </span>
        <span className="mt-0.5 flex flex-wrap gap-1.5 text-xs">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 font-medium',
              inactive ? 'bg-surface-muted text-muted' : 'bg-primary-soft text-primary',
            )}
          >
            {ruleStatus(rule)}
          </span>
          {!rule.autoPost && (
            <span className="rounded-full bg-surface-muted px-2 py-0.5 font-medium text-muted">
              Perlu konfirmasi
            </span>
          )}
        </span>
      </span>
      <span
        className={cn(
          'tabular shrink-0 font-semibold',
          rule.type === 'EXPENSE' ? 'text-expense-text' : 'text-income-text',
        )}
      >
        {formatRupiah(rule.type === 'EXPENSE' ? -rule.amount : rule.amount, { signed: true })}
      </span>
    </button>
  );
}
