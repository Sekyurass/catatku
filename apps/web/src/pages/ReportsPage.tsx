import {
  type CompareItem,
  currentMonth,
  FEATURE_FLAGS,
  formatRupiah,
  MONTH_REGEX,
  monthRange,
  shiftMonth,
} from '@catatku/shared';
import { ChartColumn, ChevronLeft, ChevronRight, FileDown } from 'lucide-react';
import { lazy, type ReactNode, Suspense, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { IconBadge } from '../components/IconBadge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { MonthSwitcher } from '../components/ui/MonthSwitcher';
import { Segmented } from '../components/ui/Segmented';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';
import { ApiError, downloadFile } from '../lib/api';
import { cn } from '../lib/cn';
import { useFeatures } from '../lib/features';
import { formatLongDate, formatMonthLabel, formatShortDate } from '../lib/format';
import { categoryIcon } from '../lib/icons';
import { useCompare, useMonthlyReport, useYearlyReport } from '../lib/queries';

const DailyChart = lazy(() => import('../components/charts/DailyChart'));
const TrendChart = lazy(() => import('../components/charts/TrendChart'));

const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
/** Senin dulu, seperti kalender Indonesia. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const linkClass =
  'inline-flex min-h-11 items-center gap-1 rounded-control px-3 text-sm font-semibold text-primary hover:bg-primary-soft';

type Period = 'bulanan' | 'tahunan';

function usePeriodParams() {
  const [params, setParams] = useSearchParams();
  const period: Period = params.get('periode') === 'tahunan' ? 'tahunan' : 'bulanan';
  const rawMonth = params.get('bulan');
  const month = rawMonth && MONTH_REGEX.test(rawMonth) ? rawMonth : currentMonth();
  const rawYear = Number(params.get('tahun'));
  const year =
    Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 2100
      ? rawYear
      : Number(currentMonth().slice(0, 4));
  const update = (next: { period?: Period; month?: string; year?: number }) => {
    const p = next.period ?? period;
    const m = next.month ?? month;
    const y = next.year ?? year;
    const query: Record<string, string> = {};
    if (p === 'tahunan') {
      query.periode = 'tahunan';
      if (y !== Number(currentMonth().slice(0, 4))) query.tahun = String(y);
    } else if (m !== currentMonth()) {
      query.bulan = m;
    }
    setParams(query, { replace: true });
  };
  return { period, month, year, update };
}

export function ReportsPage() {
  const features = useFeatures();
  const enabled = features.data?.[FEATURE_FLAGS.ADVANCED_REPORTS] ?? false;
  const { period, month, year, update } = usePeriodParams();

  if (features.isSuccess && !enabled) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">Laporan</h1>
        <Segmented
          label="Periode laporan"
          value={period}
          onChange={(p) => update({ period: p })}
          options={[
            { value: 'bulanan', label: 'Bulanan' },
            { value: 'tahunan', label: 'Tahunan' },
          ]}
        />
      </header>
      {!enabled ? (
        <LoadingBlock label="Memuat laporan" />
      ) : period === 'bulanan' ? (
        <MonthlyView month={month} onMonth={(m) => update({ month: m })} />
      ) : (
        <YearlyView
          year={year}
          onYear={(y) => update({ year: y })}
          onOpenMonth={(m) => update({ period: 'bulanan', month: m })}
        />
      )}
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-label={label}>
      <Skeleton className="h-28" />
      <Skeleton className="h-64" />
    </div>
  );
}

function Totals({
  items,
}: {
  items: { label: string; value: number; tone: 'income' | 'expense' | 'net'; note?: ReactNode }[];
}) {
  return (
    <Card className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((i) => (
        <div
          key={i.label}
          className={cn('min-w-0', i.tone === 'net' && 'col-span-2 sm:col-span-1')}
        >
          <p className="text-sm text-muted">{i.label}</p>
          <p
            className={cn(
              'tabular truncate text-lg font-bold sm:text-xl',
              i.tone === 'income' && 'text-income-text',
              i.tone === 'expense' && 'text-expense-text',
            )}
          >
            {formatRupiah(i.value, { signed: i.tone === 'net' })}
          </p>
          {i.note && <p className="text-xs text-muted">{i.note}</p>}
        </div>
      ))}
    </Card>
  );
}

function ChangeText({ change }: { change: number | null }) {
  if (change === null) return <span className="text-muted">baru</span>;
  const pct = Math.round(change * 100);
  if (pct === 0) return <span className="text-muted">sama</span>;
  return (
    <span className={pct > 0 ? 'text-expense-text' : 'text-income-text'}>
      {pct > 0 ? '+' : '−'}
      {Math.abs(pct)}%
    </span>
  );
}

// ---------- Bulanan ----------

function MonthlyView({ month, onMonth }: { month: string; onMonth: (m: string) => void }) {
  const report = useMonthlyReport(month);
  const compare = useCompare(shiftMonth(month, -1), month);
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadFile('/export/report.pdf', { month }, `catatku-laporan-${month}.pdf`);
      toast({ message: 'Laporan PDF sudah diunduh' });
    } catch (err) {
      toast({
        message:
          err instanceof ApiError
            ? err.message
            : 'Gagal membuat PDF. Periksa koneksi lalu coba lagi.',
        tone: 'error',
      });
    } finally {
      setDownloading(false);
    }
  };

  const data = report.data;
  const empty = data && data.income === 0 && data.expense === 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthSwitcher month={month} onChange={onMonth} />
        <Button
          variant="secondary"
          loading={downloading}
          disabled={!data || empty}
          onClick={() => void download()}
          icon={<FileDown className="size-4" aria-hidden />}
        >
          Unduh PDF
        </Button>
      </div>

      {report.isPending ? (
        <LoadingBlock label="Memuat laporan bulanan" />
      ) : report.isError ? (
        <Card>
          <ErrorState message={report.error.message} onRetry={() => void report.refetch()} />
        </Card>
      ) : empty ? (
        <Card>
          <EmptyState
            icon={ChartColumn}
            title={`Belum ada transaksi di ${formatMonthLabel(month)}`}
            description="Pemasukan dan pengeluaran yang kamu catat akan dirangkum di sini."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4" aria-busy={report.isPlaceholderData || undefined}>
          <Totals
            items={[
              { label: 'Pemasukan', value: report.data.income, tone: 'income' },
              {
                label: 'Pengeluaran',
                value: report.data.expense,
                tone: 'expense',
                note:
                  compare.data && compare.data.from.expense > 0 ? (
                    <>
                      <ChangeText
                        change={
                          (report.data.expense - compare.data.from.expense) /
                          compare.data.from.expense
                        }
                      />{' '}
                      dari bulan lalu
                    </>
                  ) : undefined,
              },
              { label: 'Selisih', value: report.data.net, tone: 'net' },
            ]}
          />

          <dl className="grid grid-cols-2 gap-3">
            <Card>
              <dt className="text-sm text-muted">Rata-rata per hari</dt>
              <dd className="tabular text-lg font-bold">
                {formatRupiah(report.data.averageDaily)}
              </dd>
              <dd className="text-xs text-muted">dari {report.data.daysCounted} hari</dd>
            </Card>
            <Card>
              <dt className="text-sm text-muted">Hari paling boros</dt>
              {report.data.busiestDay ? (
                <>
                  <dd className="text-lg font-bold">
                    {formatShortDate(report.data.busiestDay.date).replace(/ \d{4}$/, '')}
                  </dd>
                  <dd className="tabular text-xs text-muted">
                    {formatRupiah(report.data.busiestDay.total)} · {report.data.busiestDay.count}{' '}
                    transaksi
                  </dd>
                </>
              ) : (
                <dd className="text-lg font-bold">–</dd>
              )}
            </Card>
          </dl>

          <Card className="flex flex-col gap-3">
            <CardHeader title="Pengeluaran harian" className="mb-0" />
            <div className="relative h-52 sm:h-64">
              <Suspense fallback={<Skeleton className="absolute inset-0" />}>
                <DailyChart days={report.data.daily} />
              </Suspense>
            </div>
            <p className="sr-only">
              {report.data.busiestDay
                ? `Pengeluaran terbesar pada ${formatLongDate(report.data.busiestDay.date)}: ${formatRupiah(report.data.busiestDay.total)}.`
                : 'Belum ada pengeluaran.'}
            </p>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <CategoryCompareCard month={month} items={compare.data?.items} />
            <WeekdayCard weekdays={report.data.weekdays} />
          </div>

          <TopExpensesCard items={report.data.topExpenses} />
        </div>
      )}
    </>
  );
}

function CategoryCompareCard({ month, items }: { month: string; items?: CompareItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const { start, end } = monthRange(month);
  const list = (items ?? []).filter((i) => i.to > 0 || i.from > 0).sort((a, b) => b.to - a.to);
  const max = Math.max(...list.map((i) => Math.max(i.to, i.from)), 1);
  const visible = showAll ? list : list.slice(0, 6);

  return (
    <Card className="flex flex-col gap-2">
      <CardHeader title="Per kategori" className="mb-0" />
      <p className="text-sm text-muted">Pengeluaran bulan ini dibanding bulan lalu.</p>
      {!items ? (
        <Skeleton className="h-40" />
      ) : list.length === 0 ? (
        <p className="py-4 text-sm text-muted">Belum ada pengeluaran.</p>
      ) : (
        <ul aria-label="Pengeluaran per kategori dibanding bulan lalu">
          {visible.map((i) => {
            const content = (
              <>
                <IconBadge icon={categoryIcon(i.icon)} color={i.color} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{i.name}</span>
                    <span className="tabular shrink-0 text-sm font-semibold">
                      {formatRupiah(i.to)}
                    </span>
                  </span>
                  <span
                    className="relative h-1.5 overflow-hidden rounded-full bg-surface-muted"
                    aria-hidden
                  >
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-line"
                      style={{ width: `${(i.from / max) * 100}%` }}
                    />
                    <span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${(i.to / max) * 100}%`, backgroundColor: i.color }}
                    />
                  </span>
                  <span className="tabular flex justify-between gap-2 text-xs text-muted">
                    <span>Bulan lalu {formatRupiah(i.from)}</span>
                    <ChangeText change={i.change} />
                  </span>
                </span>
              </>
            );
            const rowClass = 'flex min-h-14 items-center gap-3 rounded-control px-2 py-2';
            return (
              <li key={i.categoryId ?? i.name}>
                {i.categoryId ? (
                  <Link
                    to={`/transaksi?categoryId=${i.categoryId}&from=${start}&to=${end}`}
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
      )}
      {list.length > 6 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className={cn(linkClass, 'self-start')}
        >
          {showAll ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${list.length})`}
        </button>
      )}
    </Card>
  );
}

function WeekdayCard({
  weekdays,
}: {
  weekdays: { weekday: number; total: number; average: number }[];
}) {
  const max = Math.max(...weekdays.map((w) => w.average), 1);
  const top = weekdays.reduce((a, b) => (b.average > a.average ? b : a));
  return (
    <Card className="flex flex-col gap-2">
      <CardHeader title="Pola per hari" className="mb-0" />
      <p className="text-sm text-muted">
        {top.average > 0
          ? `Rata-rata pengeluaran paling besar di hari ${WEEKDAYS[top.weekday]}.`
          : 'Belum ada pengeluaran yang dihitung.'}
      </p>
      <ul
        className="flex flex-col gap-2"
        aria-label="Rata-rata pengeluaran per hari dalam seminggu"
      >
        {WEEK_ORDER.map((d) => {
          const w = weekdays[d]!;
          return (
            <li
              key={d}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm"
            >
              <span className={cn(w.weekday === top.weekday && top.average > 0 && 'font-semibold')}>
                {WEEKDAYS[d]}
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${(w.average / max) * 100}%` }}
                />
              </span>
              <span className="tabular text-right text-muted">{formatRupiah(w.average)}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function TopExpensesCard({
  items,
}: {
  items: {
    id: string;
    date: string;
    amount: number;
    note: string | null;
    category: { name: string; icon: string; color: string } | null;
    wallet: { name: string };
  }[];
}) {
  return (
    <Card className="flex flex-col gap-2">
      <CardHeader title="5 pengeluaran terbesar" className="mb-0" />
      {items.length === 0 ? (
        <p className="py-4 text-sm text-muted">Belum ada pengeluaran.</p>
      ) : (
        <ol>
          {items.map((t) => (
            <li key={t.id} className="flex min-h-14 items-center gap-3 px-2 py-2">
              <IconBadge
                icon={categoryIcon(t.category?.icon ?? 'circle-ellipsis')}
                color={t.category?.color ?? '#94A3B8'}
                size="sm"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {t.note || t.category?.name || 'Tanpa catatan'}
                </span>
                <span className="block truncate text-xs text-muted">
                  {formatShortDate(t.date)} · {t.wallet.name}
                </span>
              </span>
              <span className="tabular shrink-0 text-sm font-semibold text-expense-text">
                {formatRupiah(t.amount)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ---------- Tahunan ----------

function YearlyView({
  year,
  onYear,
  onOpenMonth,
}: {
  year: number;
  onYear: (y: number) => void;
  onOpenMonth: (m: string) => void;
}) {
  const report = useYearlyReport(year);
  const thisYear = Number(currentMonth().slice(0, 4));
  const arrow =
    'flex size-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-surface-muted hover:text-fg disabled:opacity-40';

  return (
    <>
      <div className="flex shrink-0 items-center gap-1 self-start rounded-control border border-line bg-surface p-1">
        <button
          type="button"
          className={arrow}
          onClick={() => onYear(year - 1)}
          aria-label="Tahun sebelumnya"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <span className="min-w-20 text-center text-sm font-semibold" aria-live="polite">
          {year}
        </span>
        <button
          type="button"
          className={arrow}
          onClick={() => onYear(year + 1)}
          disabled={year >= thisYear}
          aria-label="Tahun berikutnya"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>

      {report.isPending ? (
        <LoadingBlock label="Memuat laporan tahunan" />
      ) : report.isError ? (
        <Card>
          <ErrorState message={report.error.message} onRetry={() => void report.refetch()} />
        </Card>
      ) : report.data.income === 0 && report.data.expense === 0 ? (
        <Card>
          <EmptyState icon={ChartColumn} title={`Belum ada transaksi di tahun ${year}`} />
        </Card>
      ) : (
        <div className="flex flex-col gap-4" aria-busy={report.isPlaceholderData || undefined}>
          <Totals
            items={[
              { label: 'Pemasukan', value: report.data.income, tone: 'income' },
              {
                label: 'Pengeluaran',
                value: report.data.expense,
                tone: 'expense',
                note:
                  report.data.monthsCounted > 0
                    ? `Rata-rata ${formatRupiah(report.data.averageMonthlyExpense)}/bulan`
                    : undefined,
              },
              { label: 'Selisih', value: report.data.net, tone: 'net' },
            ]}
          />

          <Card className="flex flex-col gap-3">
            <CardHeader title={`Per bulan ${year}`} className="mb-0" />
            <div className="relative h-60 sm:h-72">
              <Suspense fallback={<Skeleton className="absolute inset-0" />}>
                <TrendChart points={report.data.months} />
              </Suspense>
            </div>
            <ul aria-label={`Ringkasan per bulan ${year}`} className="-mx-2">
              {report.data.months
                .filter((m) => m.income > 0 || m.expense > 0)
                .map((m) => {
                  const name = formatMonthLabel(m.month).replace(/ \d{4}$/, '');
                  return (
                    <li key={m.month} className="border-t border-line first:border-t-0">
                      <button
                        type="button"
                        onClick={() => onOpenMonth(m.month)}
                        className="flex min-h-14 w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-surface-muted"
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-sm font-semibold">{name}</span>
                          <span className="tabular text-xs text-muted">
                            Selisih {formatRupiah(m.net, { signed: true })}
                          </span>
                        </span>
                        <span className="tabular flex shrink-0 flex-col items-end text-sm">
                          <span className="text-income-text">
                            <span className="sr-only">Pemasukan </span>
                            {formatRupiah(m.income)}
                          </span>
                          <span className="text-expense-text">
                            <span className="sr-only">Pengeluaran </span>
                            {formatRupiah(m.expense)}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                      </button>
                    </li>
                  );
                })}
            </ul>
          </Card>

          <Card className="flex flex-col gap-2">
            <CardHeader title="Kategori pengeluaran terbesar" className="mb-0" />
            {report.data.topCategories.length === 0 ? (
              <p className="py-4 text-sm text-muted">Belum ada pengeluaran.</p>
            ) : (
              <ul>
                {report.data.topCategories.map((c) => (
                  <li
                    key={c.categoryId ?? c.name}
                    className="flex min-h-14 items-center gap-3 px-2 py-2"
                  >
                    <IconBadge icon={categoryIcon(c.icon)} color={c.color} size="sm" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">{c.name}</span>
                        <span className="tabular shrink-0 text-sm font-semibold">
                          {formatRupiah(c.total)}
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
                              width: `${Math.max(c.ratio * 100, 2)}%`,
                              backgroundColor: c.color,
                            }}
                          />
                        </span>
                        <span className="tabular shrink-0 text-xs text-muted">
                          {Math.round(c.ratio * 100)}%
                        </span>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
