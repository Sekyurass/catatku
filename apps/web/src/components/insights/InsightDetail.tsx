import { formatRupiah, type InsightDTO, type InsightTxRef, monthRange } from '@catatku/shared';
import { ChevronRight, EyeOff, Repeat } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFeature } from '../../lib/features';
import { formatShortDate } from '../../lib/format';
import { categoryIcon } from '../../lib/icons';
import { IconBadge } from '../IconBadge';
import { RecurringSheet } from '../recurring/RecurringSheet';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';

const linkClass =
  'inline-flex min-h-11 items-center gap-1 self-start rounded-control px-2 -ml-2 text-sm font-semibold text-primary hover:bg-primary-soft';

const percent = (ratio: number) => `${Math.round(Math.abs(ratio) * 100)}%`;
const txHref = (categoryId: string, from: string, to: string) =>
  `/transaksi?categoryId=${categoryId}&from=${from}&to=${to}`;

/** Rincian satu insight: angka pendukung, cara menghitung, dan langkah lanjutan. */
export function InsightDetail({
  insight,
  onDismiss,
  onClose,
}: {
  insight: InsightDTO;
  onDismiss: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{insight.body}</p>
      <KindDetail insight={insight} onClose={onClose} />
      <Button
        variant="ghost"
        className="self-start text-muted"
        icon={<EyeOff className="size-4" aria-hidden />}
        onClick={onDismiss}
      >
        Sembunyikan insight ini
      </Button>
    </div>
  );
}

function KindDetail({ insight, onClose }: { insight: InsightDTO; onClose: () => void }) {
  switch (insight.kind) {
    case 'category_change':
      return <CategoryChange detail={insight.detail} onClose={onClose} />;
    case 'budget_pace':
      return <BudgetPace detail={insight.detail} onClose={onClose} />;
    case 'new_subscription':
      return <Subscription detail={insight.detail} onClose={onClose} />;
    case 'unusual_expense':
      return <Unusual detail={insight.detail} onClose={onClose} />;
  }
}

type DetailOf<K extends InsightDTO['kind']> = Extract<InsightDTO, { kind: K }>['detail'];

function Stats({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3">
      {items.map((s) => (
        <div key={s.label} className="rounded-control bg-surface-muted px-3 py-2">
          <dt className="text-xs text-muted">{s.label}</dt>
          <dd className="tabular font-semibold">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function HowItWorks({ children }: { children: ReactNode }) {
  return (
    <details className="group rounded-control border border-line px-3">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm font-medium">
        Cara menghitung
        <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <p className="pb-3 text-sm text-muted">{children}</p>
    </details>
  );
}

function TxList({ title, items }: { title: string; items: InsightTxRef[] }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="flex flex-col divide-y divide-line">
        {items.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate">{t.note || 'Tanpa catatan'}</span>
              <span className="block text-xs text-muted">{formatShortDate(t.date)}</span>
            </span>
            <span className="tabular shrink-0 font-semibold">{formatRupiah(t.amount)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CategoryHeader({ category }: { category: DetailOf<'budget_pace'>['category'] }) {
  return (
    <div className="flex items-center gap-3">
      <IconBadge icon={categoryIcon(category.icon)} color={category.color} size="sm" />
      <span className="font-medium">{category.name}</span>
    </div>
  );
}

function CategoryChange({
  detail,
  onClose,
}: {
  detail: DetailOf<'category_change'>;
  onClose: () => void;
}) {
  const max = Math.max(detail.current, detail.previous, 1);
  const rows = [
    {
      label: `Bulan ini (${formatShortDate(detail.currentRange.start)}–${formatShortDate(detail.currentRange.end)})`,
      value: detail.current,
      bar: detail.direction === 'up' ? 'bg-warning' : 'bg-income',
    },
    {
      label: `Bulan lalu (${formatShortDate(detail.previousRange.start)}–${formatShortDate(detail.previousRange.end)})`,
      value: detail.previous,
      bar: 'bg-line',
    },
  ];
  return (
    <>
      <CategoryHeader category={detail.category} />
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted">{r.label}</span>
              <span className="tabular font-semibold">{formatRupiah(r.value)}</span>
            </div>
            <ProgressBar ratio={r.value / max} label={r.label} barClassName={r.bar} />
          </div>
        ))}
        <p className="text-sm">
          {detail.direction === 'up' ? 'Naik' : 'Turun'} {percent(detail.change)} (
          {formatRupiah(Math.abs(detail.current - detail.previous))}).
        </p>
      </div>
      {detail.topTransactions.length > 0 && (
        <TxList title="Transaksi terbesar bulan ini" items={detail.topTransactions} />
      )}
      <Link
        to={txHref(detail.category.id, detail.currentRange.start, detail.currentRange.end)}
        onClick={onClose}
        className={linkClass}
      >
        Lihat semua transaksi {detail.category.name}
        <ChevronRight className="size-4" aria-hidden />
      </Link>
      <HowItWorks>
        Total pengeluaran {detail.category.name} dari tanggal 1 sampai hari ini dibanding periode
        yang sama bulan lalu, supaya adil walau bulan belum selesai. Insight muncul bila selisihnya
        minimal 30% dan Rp 50.000.
      </HowItWorks>
    </>
  );
}

function BudgetPace({ detail, onClose }: { detail: DetailOf<'budget_pace'>; onClose: () => void }) {
  const ratio = detail.spent / detail.limit;
  return (
    <>
      <CategoryHeader category={detail.category} />
      <div className="flex flex-col gap-1">
        <p className="tabular text-sm text-muted">
          <span className="font-semibold text-fg">{formatRupiah(detail.spent)}</span> dari{' '}
          {formatRupiah(detail.limit)}
        </p>
        <ProgressBar
          ratio={ratio}
          label={`Anggaran ${detail.category.name} terpakai`}
          barClassName="bg-warning"
        />
      </div>
      <Stats
        items={[
          {
            label: 'Rata-rata per hari',
            value: formatRupiah(Math.round(detail.spent / detail.daysElapsed)),
          },
          { label: 'Perkiraan akhir bulan', value: formatRupiah(detail.projected) },
          { label: 'Bisa habis sekitar', value: formatShortDate(detail.runOutDate) },
          { label: 'Batas aman per hari', value: formatRupiah(detail.dailyAllowance) },
        ]}
      />
      <Link to={`/anggaran?bulan=${detail.month}`} onClick={onClose} className={linkClass}>
        Buka anggaran
        <ChevronRight className="size-4" aria-hidden />
      </Link>
      <HowItWorks>
        Pengeluaran {detail.daysElapsed} hari pertama dibagi jumlah harinya, lalu dikalikan{' '}
        {detail.daysInMonth} hari. Batas aman = sisa anggaran dibagi hari tersisa termasuk hari ini.
        Ini perkiraan; belanja besar sekali waktu bisa membuatnya terlihat lebih cepat.
      </HowItWorks>
    </>
  );
}

function Subscription({
  detail,
  onClose,
}: {
  detail: DetailOf<'new_subscription'>;
  onClose: () => void;
}) {
  const recurringOn = useFeature('recurring_transactions');
  const [creating, setCreating] = useState(false);
  return (
    <>
      <Stats
        items={[
          { label: 'Nominal', value: formatRupiah(detail.amount) },
          { label: 'Jarak rata-rata', value: `${detail.averageGapDays} hari` },
          { label: 'Terakhir', value: formatShortDate(detail.lastDate) },
          { label: 'Perkiraan berikutnya', value: formatShortDate(detail.nextDate) },
        ]}
      />
      <TxList title="Transaksi yang mirip" items={detail.occurrences} />
      {recurringOn && (
        <>
          <Button
            size="lg"
            icon={<Repeat className="size-4" aria-hidden />}
            onClick={() => setCreating(true)}
          >
            Jadikan transaksi berulang
          </Button>
          <p className="-mt-2 text-sm text-muted">
            Formulir terisi otomatis mulai {formatShortDate(detail.nextDate)}; periksa dulu sebelum
            menyimpan. Setelah itu kamu tidak perlu mencatatnya manual.
          </p>
          <RecurringSheet
            open={creating}
            onClose={() => {
              setCreating(false);
              onClose();
            }}
            initial={{
              amount: detail.amount,
              walletId: detail.walletId,
              categoryId: detail.category?.id,
              note: detail.note ?? detail.merchant,
              startDate: detail.nextDate,
            }}
          />
        </>
      )}
      <HowItWorks>
        Pengeluaran dengan catatan yang sama dan nominal yang hampir sama (selisih maksimal 5%)
        tercatat setidaknya dua kali dengan jarak 25–35 hari, dan belum ada transaksi berulang
        untuknya.
      </HowItWorks>
    </>
  );
}

function Unusual({
  detail,
  onClose,
}: {
  detail: DetailOf<'unusual_expense'>;
  onClose: () => void;
}) {
  const { start, end } = monthRange(detail.transaction.date.slice(0, 7));
  return (
    <>
      <CategoryHeader category={detail.category} />
      <TxList title="Transaksinya" items={[detail.transaction]} />
      <Stats
        items={[
          { label: 'Biasanya', value: formatRupiah(detail.median) },
          { label: 'Kali ini', value: `${String(detail.multiple).replace('.', ',')}×` },
        ]}
      />
      <Link to={txHref(detail.category.id, start, end)} onClick={onClose} className={linkClass}>
        Lihat transaksi {detail.category.name} bulan itu
        <ChevronRight className="size-4" aria-hidden />
      </Link>
      <HowItWorks>
        "Biasanya" adalah nilai tengah (median) dari {detail.sampleSize} pengeluaran{' '}
        {detail.category.name} dalam 90 hari sebelumnya. Insight muncul bila satu transaksi minimal
        3× nilai itu dan paling sedikit Rp 200.000. Tidak apa-apa bila memang direncanakan; tutup
        saja insight ini.
      </HowItWorks>
    </>
  );
}
