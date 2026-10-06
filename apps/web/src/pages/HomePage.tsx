import {
  type CategoryType,
  currentMonth,
  formatRupiah,
  monthRange,
  type SummaryDTO,
} from '@catatku/shared';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChartColumn,
  ChartPie,
  ChevronRight,
  type LucideIcon,
  Moon,
  Plus,
  ReceiptText,
  Sun,
  Sunrise,
  Sunset,
  WalletMinimal,
} from 'lucide-react';
import { lazy, type ReactNode, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconBadge } from '../components/IconBadge';
import { PendingRecurringCard } from '../components/recurring/PendingRecurringCard';
import { useQuickAdd } from '../components/transactions/QuickAdd';
import { TransactionRow } from '../components/transactions/TransactionRow';
import { AutoHeight } from '../components/ui/AutoHeight';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Segmented } from '../components/ui/Segmented';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useAuth } from '../lib/auth';
import { groupCategories } from '../lib/chart';
import { cn } from '../lib/cn';
import { useFeature } from '../lib/features';
import { formatMonthLabel } from '../lib/format';
import { categoryIcon } from '../lib/icons';
import { useByCategory, useSummary, useTrend, useWallets } from '../lib/queries';

const CategoryDonut = lazy(() => import('../components/charts/CategoryDonut'));
const TrendChart = lazy(() => import('../components/charts/TrendChart'));

const linkClass =
  'inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-sm font-semibold text-primary hover:bg-primary-soft';

export function HomePage() {
  const { user } = useAuth();
  const month = currentMonth();
  const wallets = useWallets();
  const summary = useSummary(month);
  const { openNew } = useQuickAdd();
  const recurringOn = useFeature('recurring_transactions');

  const noWallets = wallets.isSuccess && wallets.data.length === 0;

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <WelcomeCard name={user?.name ?? ''} month={month} />

      {noWallets ? (
        <Card>
          <EmptyState
            icon={WalletMinimal}
            title="Mulai dengan membuat dompet"
            description="Tambahkan uang tunai, rekening bank, atau dompet digital. Setelah itu kamu bisa mencatat transaksi pertamamu."
            action={
              <Link
                to="/mulai?langkah=2"
                className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover"
              >
                Buat dompet
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <SummaryCards summary={summary} />
          {recurringOn && <PendingRecurringCard />}
          <TrendCard />
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
            <CategoryCard month={month} />
            <RecentCard summary={summary} onAdd={() => openNew()} />
          </div>
        </>
      )}
    </div>
  );
}

function greetingFor(hour: number): { text: string; icon: LucideIcon } {
  if (hour >= 4 && hour < 11) return { text: 'Selamat pagi', icon: Sunrise };
  if (hour >= 11 && hour < 15) return { text: 'Selamat siang', icon: Sun };
  if (hour >= 15 && hour < 18) return { text: 'Selamat sore', icon: Sunset };
  return { text: 'Selamat malam', icon: Moon };
}

function WelcomeCard({ name, month }: { name: string; month: string }) {
  const { text, icon: Icon } = greetingFor(new Date().getHours());
  return (
    <Card className="flex items-center gap-4 bg-linear-to-r from-primary-soft/70 to-surface">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface text-primary shadow-card">
        <Icon className="size-6" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold sm:text-2xl">
          {text}, {name}!
        </h1>
        <p className="text-sm text-muted">
          Selamat datang kembali. Yuk catat transaksi hari ini dan pantau sisa uangmu.
        </p>
        <p className="mt-1 text-xs font-semibold text-primary sm:hidden">
          {formatMonthLabel(month)}
        </p>
      </div>
      <p className="hidden shrink-0 rounded-full bg-surface px-3 py-1 text-sm font-medium text-muted sm:block">
        {formatMonthLabel(month)}
      </p>
    </Card>
  );
}

function SummaryCards({ summary }: { summary: ReturnType<typeof useSummary> }) {
  if (summary.isPending) {
    return (
      <div
        className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-6"
        aria-busy="true"
        aria-label="Memuat ringkasan"
      >
        <Skeleton className="col-span-2 h-32" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (summary.isError) {
    return (
      <Card>
        <ErrorState message={summary.error.message} onRetry={() => void summary.refetch()} />
      </Card>
    );
  }
  const { totalBalance, income, expense, net } = summary.data;
  return (
    <section
      aria-label="Ringkasan bulan ini"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-6"
    >
      <Card className="col-span-2 flex flex-col justify-between gap-3 border-none bg-brand text-white">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-white/90">Total saldo</p>
            <p className="tabular truncate text-3xl font-bold">{formatRupiah(totalBalance)}</p>
          </div>
          <Link
            to="/dompet"
            className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-control px-2 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-white"
          >
            Dompet
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
        <p className="text-sm text-white/90">
          Selisih bulan ini{' '}
          <span className="tabular font-semibold text-white">
            {formatRupiah(net, { signed: true })}
          </span>
        </p>
      </Card>
      <StatCard
        label="Pemasukan"
        value={income}
        tone="income"
        icon={<ArrowDownLeft className="size-4" aria-hidden />}
      />
      <StatCard
        label="Pengeluaran"
        value={expense}
        tone="expense"
        icon={<ArrowUpRight className="size-4" aria-hidden />}
      />
    </section>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: 'income' | 'expense';
  icon: ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col justify-between gap-2">
      <p className="flex items-center gap-1.5 text-sm text-muted">
        <span
          className={cn(
            'flex size-6 items-center justify-center rounded-full',
            tone === 'income' ? 'bg-income/15 text-income-text' : 'bg-expense/15 text-expense-text',
          )}
        >
          {icon}
        </span>
        {label}
      </p>
      <p
        className={cn(
          'tabular truncate text-lg font-bold sm:text-xl',
          tone === 'income' ? 'text-income-text' : 'text-expense-text',
        )}
        title={formatRupiah(value)}
      >
        {formatRupiah(value)}
      </p>
    </Card>
  );
}

function CategoryCard({ month, className }: { month: string; className?: string }) {
  const [type, setType] = useState<CategoryType>('EXPENSE');
  const expense = useByCategory(month, 'EXPENSE');
  const income = useByCategory(month, 'INCOME');
  const report = type === 'EXPENSE' ? expense : income;
  const items = report.data ? groupCategories(report.data.items) : [];
  const { start, end } = monthRange(month);
  const label = type === 'EXPENSE' ? 'pengeluaran' : 'pemasukan';

  return (
    <Card className={cn('flex flex-col gap-4', className)}>
      <CardHeader title="Per kategori" className="mb-0" />
      <Segmented
        label="Jenis laporan kategori"
        value={type}
        onChange={setType}
        options={[
          { value: 'EXPENSE', label: 'Pengeluaran' },
          { value: 'INCOME', label: 'Pemasukan' },
        ]}
      />
      <div className="flex flex-1 flex-col justify-center">
        <AutoHeight>
          <div key={type} className="animate-fade-in">
            {report.isPending ? (
              <div
                className="flex flex-col items-center gap-4"
                aria-busy="true"
                aria-label="Memuat kategori"
              >
                <Skeleton className="size-40 rounded-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : report.isError ? (
              <ErrorState message={report.error.message} onRetry={() => void report.refetch()} />
            ) : report.data.items.length === 0 ? (
              <EmptyState icon={ChartPie} title={`Belum ada ${label} bulan ini`} />
            ) : (
              <div className="@container">
                <div className="flex flex-col gap-4 @md:flex-row @md:items-center">
                  <div className="@md:w-44 @md:shrink-0">
                    <Suspense fallback={<Skeleton className="mx-auto size-40 rounded-full" />}>
                      <CategoryDonut items={items} total={report.data.total} />
                    </Suspense>
                  </div>
                  <ul
                    className="flex min-w-0 flex-1 flex-col"
                    aria-label={`Rincian ${label} per kategori`}
                  >
                    {items.map((item) => {
                      const percent = Math.round(item.ratio * 100);
                      const content = (
                        <>
                          <IconBadge icon={categoryIcon(item.icon)} color={item.color} size="sm" />
                          <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-sm font-medium">{item.name}</span>
                              <span className="tabular shrink-0 text-sm font-semibold whitespace-nowrap">
                                {formatRupiah(item.total)}
                              </span>
                            </span>
                            <span className="flex items-center gap-2">
                              <span
                                className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted"
                                aria-hidden
                              >
                                <span
                                  className="block h-full rounded-full"
                                  style={{
                                    width: `${Math.max(percent, 2)}%`,
                                    backgroundColor: item.color,
                                  }}
                                />
                              </span>
                              <span className="tabular shrink-0 text-xs whitespace-nowrap text-muted">
                                {percent}% · {item.count} transaksi
                              </span>
                            </span>
                          </span>
                        </>
                      );
                      const rowClass = 'flex min-h-14 items-center gap-3 rounded-control px-2 py-2';
                      return (
                        <li key={item.categoryId ?? item.name}>
                          {item.categoryId ? (
                            <Link
                              to={`/transaksi?categoryId=${item.categoryId}&from=${start}&to=${end}`}
                              className={cn(rowClass, 'hover:bg-surface-muted')}
                            >
                              {content}
                            </Link>
                          ) : (
                            <div className={rowClass}>{content}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </AutoHeight>
      </div>
    </Card>
  );
}

function TrendCard({ className }: { className?: string }) {
  const trend = useTrend(6);
  const hasData = trend.data?.months.some((m) => m.income > 0 || m.expense > 0);

  return (
    <Card className={cn('flex flex-col gap-3', className)}>
      <CardHeader
        title="Tren 6 bulan"
        className="mb-0"
        action={
          <div className="flex gap-3 text-xs text-muted" aria-hidden>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-income" />
              Pemasukan
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-expense" />
              Pengeluaran
            </span>
          </div>
        }
      />
      {trend.isPending ? (
        <Skeleton className="h-60 sm:h-72" />
      ) : trend.isError ? (
        <ErrorState message={trend.error.message} onRetry={() => void trend.refetch()} />
      ) : !hasData ? (
        <EmptyState icon={ChartColumn} title="Belum ada data 6 bulan terakhir" />
      ) : (
        <>
          <div className="relative h-60 sm:h-72">
            <Suspense fallback={<Skeleton className="absolute inset-0" />}>
              <TrendChart points={trend.data.months} />
            </Suspense>
          </div>
          <table className="sr-only">
            <caption>Pemasukan dan pengeluaran 6 bulan terakhir</caption>
            <thead>
              <tr>
                <th scope="col">Bulan</th>
                <th scope="col">Pemasukan</th>
                <th scope="col">Pengeluaran</th>
              </tr>
            </thead>
            <tbody>
              {trend.data.months.map((m) => (
                <tr key={m.month}>
                  <th scope="row">{formatMonthLabel(m.month)}</th>
                  <td>{formatRupiah(m.income)}</td>
                  <td>{formatRupiah(m.expense)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}

function RecentCard({
  summary,
  onAdd,
}: {
  summary: ReturnType<typeof useSummary>;
  onAdd: () => void;
}) {
  const { openEdit } = useQuickAdd();
  const recent: SummaryDTO['recent'] | undefined = summary.data?.recent;

  return (
    <Card className="p-2 sm:p-4">
      <CardHeader
        title="Transaksi terakhir"
        className="px-2 sm:px-0"
        action={
          <Link to="/transaksi" className={linkClass}>
            Lihat semua
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        }
      />
      {summary.isPending ? (
        <div className="flex flex-col gap-3 p-2" aria-busy="true" aria-label="Memuat transaksi">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : summary.isError ? null : recent && recent.length > 0 ? (
        <ul>
          {recent.map((tx) => (
            <li key={tx.id}>
              <TransactionRow tx={tx} onSelect={openEdit} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={ReceiptText}
          title="Belum ada transaksi"
          description="Catat pengeluaran atau pemasukan pertamamu."
          action={
            <Button icon={<Plus className="size-4" aria-hidden />} onClick={onAdd}>
              Catat transaksi
            </Button>
          }
        />
      )}
    </Card>
  );
}
