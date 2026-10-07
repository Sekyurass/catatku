import {
  type ForecastDTO,
  type ForecastStatus,
  FORECAST_LOOKBACK_DAYS,
  FORECAST_MIN_DAYS,
  formatRupiah,
} from '@catatku/shared';
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  type LucideIcon,
  TriangleAlert,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatShortDate } from '../../lib/format';
import { useForecast } from '../../lib/queries';
import { Card, CardHeader } from '../ui/Card';
import { ErrorState, Skeleton } from '../ui/States';

const STATUS: Record<ForecastStatus, { icon: LucideIcon; className: string }> = {
  safe: { icon: CircleCheck, className: 'text-income-text' },
  tight: { icon: TriangleAlert, className: 'text-warning-text' },
  short: { icon: CircleAlert, className: 'text-expense-text' },
};

function statusText(f: ForecastDTO): string {
  if (f.status === 'safe')
    return 'Dengan pola belanja sekarang, saldo diperkirakan cukup sampai akhir bulan.';
  if (f.status === 'tight') {
    return 'Saldo bisa menipis kalau belanjamu seperti minggu paling boros. Coba tahan pengeluaran yang bisa ditunda.';
  }
  return `Dengan pola sekarang, saldo diperkirakan kurang sekitar ${formatRupiah(-f.projected.mid)} di akhir bulan.`;
}

function Amount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('tabular whitespace-nowrap', value < 0 && 'text-expense-text', className)}>
      {formatRupiah(value)}
    </span>
  );
}

/** Perkiraan saldo akhir bulan (Fase 2.4): rentang pesimis–optimis + cara menghitungnya. */
export function ForecastCard() {
  const forecast = useForecast();

  return (
    <Card role="region" aria-label="Perkiraan akhir bulan" className="flex flex-col gap-3">
      <CardHeader
        title="Perkiraan akhir bulan"
        className="mb-0"
        action={
          forecast.data && (
            <span className="text-xs text-muted">
              {forecast.data.daysLeft === 0
                ? 'Hari terakhir bulan ini'
                : `Sisa ${forecast.data.daysLeft} hari`}
            </span>
          )
        }
      />
      {forecast.isPending ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Memuat perkiraan"
          className="flex flex-col gap-2"
        >
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : forecast.isError ? (
        <ErrorState message={forecast.error.message} onRetry={() => void forecast.refetch()} />
      ) : !forecast.data.enoughData ? (
        <p className="text-sm text-muted">
          Perkiraan muncul setelah kamu mencatat minimal {FORECAST_MIN_DAYS} hari, supaya pola
          belanjamu terbaca. Sekarang baru {forecast.data.historyDays} hari.
        </p>
      ) : (
        <ForecastBody f={forecast.data} />
      )}
    </Card>
  );
}

function ForecastBody({ f }: { f: ForecastDTO }) {
  const { icon: Icon, className } = STATUS[f.status];
  const sameRange = f.projected.low === f.projected.high;
  const bills = f.upcoming.items.filter((u) => u.type === 'EXPENSE');
  const incomes = f.upcoming.items.filter((u) => u.type === 'INCOME');

  return (
    <>
      <div>
        <p className="text-sm text-muted">Saldo di akhir bulan kira-kira</p>
        <p className="text-xl font-bold sm:text-2xl" aria-label={rangeLabel(f)}>
          {sameRange ? (
            <Amount value={f.projected.mid} />
          ) : (
            <>
              <Amount value={f.projected.low} /> <span className="text-muted">–</span>{' '}
              <Amount value={f.projected.high} />
            </>
          )}
        </p>
      </div>
      <p className={cn('flex items-start gap-2 text-sm', className)}>
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{statusText(f)}</span>
      </p>

      <dl className="flex flex-col gap-1.5 rounded-control bg-surface-muted p-3 text-sm">
        <Row label="Saldo sekarang" value={formatRupiah(f.balance)} />
        <Row
          label={`Belanja harian ±${formatRupiah(f.daily.average)} × ${f.daysLeft} hari`}
          value={formatRupiah(-f.spending.average)}
        />
        {bills.length > 0 && (
          <Row
            label={`Tagihan berulang (${bills.length})`}
            value={formatRupiah(-f.upcoming.expense)}
          />
        )}
        {incomes.length > 0 && (
          <Row
            label={`Pemasukan terjadwal (${incomes.length})`}
            value={formatRupiah(f.upcoming.income, { signed: true })}
          />
        )}
      </dl>

      <details className="group">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-control text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">
          Cara menghitung
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="flex flex-col gap-3 pt-1 text-sm text-muted">
          <p>
            Saldo sekarang dikurangi rata-rata belanja harian {f.historyDays} hari terakhir
            {f.historyDays < FORECAST_LOOKBACK_DAYS && ' (sejak kamu mulai mencatat)'} dikali sisa
            hari, lalu dikurangi tagihan berulang dan ditambah pemasukan terjadwal sampai akhir
            bulan. Transfer antardompet dan transaksi berulang yang sudah tercatat tidak ikut
            dihitung sebagai belanja harian.
          </p>
          <p>
            {f.historyDays >= 14
              ? `Angka terendah memakai minggu paling boros (${formatRupiah(f.daily.high)}/hari), angka tertinggi memakai minggu paling hemat (${formatRupiah(f.daily.low)}/hari).`
              : `Datamu belum sampai 2 minggu, jadi rentangnya ±25% dari rata-rata (${formatRupiah(f.daily.low)}–${formatRupiah(f.daily.high)}/hari).`}{' '}
            Ini perkiraan, bukan kepastian.
          </p>
          {f.upcoming.items.length > 0 && (
            <ul className="flex flex-col gap-1" aria-label="Transaksi terjadwal sampai akhir bulan">
              {f.upcoming.items.map((u, i) => (
                <li key={`${u.date}-${i}`} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {formatShortDate(u.date)} · {u.note || u.category?.name || 'Transaksi berulang'}
                    {u.status === 'pending' && (
                      <span className="text-warning-text"> · menunggu konfirmasi</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'tabular shrink-0 whitespace-nowrap font-medium',
                      u.type === 'INCOME' ? 'text-income-text' : 'text-fg',
                    )}
                  >
                    {formatRupiah(u.type === 'INCOME' ? u.amount : -u.amount, { signed: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </>
  );
}

function rangeLabel(f: ForecastDTO): string {
  if (f.projected.low === f.projected.high) return formatRupiah(f.projected.mid);
  return `antara ${formatRupiah(f.projected.low)} sampai ${formatRupiah(f.projected.high)}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 text-muted">{label}</dt>
      <dd className="tabular shrink-0 font-medium whitespace-nowrap">{value}</dd>
    </div>
  );
}
