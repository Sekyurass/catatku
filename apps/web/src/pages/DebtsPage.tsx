import {
  type DebtDirection,
  type DebtDTO,
  type DebtPaymentDTO,
  type DebtProgress,
  FEATURE_FLAGS,
  formatRupiah,
} from '@catatku/shared';
import { CircleCheck, HandCoins, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DebtForm } from '../components/debts/DebtForm';
import { DebtPaymentForm } from '../components/debts/DebtPaymentForm';
import { SplitBillForm } from '../components/debts/SplitBillForm';
import { IconBadge } from '../components/IconBadge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Dialog } from '../components/ui/Dialog';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Segmented } from '../components/ui/Segmented';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { DEBT_COLOR, debtProgressOf, debtTitle, nextDueLine } from '../lib/debts';
import { useFeatures } from '../lib/features';
import { formatShortDate } from '../lib/format';
import { useDebtPayments, useDebts, useInvalidateMoney } from '../lib/queries';

type View =
  | { kind: 'new' }
  | { kind: 'split' }
  | { kind: 'edit'; id: string }
  | { kind: 'detail'; id: string }
  | { kind: 'pay'; id: string };

export function DebtsPage() {
  const features = useFeatures();
  const enabled = features.data?.[FEATURE_FLAGS.DEBTS] ?? false;
  const debts = useDebts(enabled);
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<DebtDirection>('PAYABLE');
  const [localView, setLocalView] = useState<View | null>(null);

  // ?debt=id (dari notifikasi atau detail transaksi) membuka detailnya langsung.
  const linked = params.get('debt');
  const view: View | null = localView ?? (linked ? { kind: 'detail', id: linked } : null);
  const setView = (v: View | null) => {
    setLocalView(v);
    if (linked) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('debt');
          return next;
        },
        { replace: true },
      );
    }
  };
  const close = () => setView(null);

  const items = debts.data ?? [];
  const current = view && 'id' in view ? items.find((d) => d.id === view.id) : undefined;
  const shown = items.filter((d) => d.direction === tab);
  const active = shown.filter((d) => !d.settledAt);
  const settled = shown.filter((d) => d.settledAt);
  const unavailable = features.isSuccess && !enabled;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Utang & piutang</h1>
        {enabled && items.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              icon={<Users className="size-4" aria-hidden />}
              onClick={() => setView({ kind: 'split' })}
            >
              Bagi tagihan
            </Button>
            <Button
              icon={<Plus className="size-4" aria-hidden />}
              onClick={() => setView({ kind: 'new' })}
            >
              Catat
            </Button>
          </div>
        )}
      </header>
      <p className="-mt-2 text-sm text-muted">
        Pinjaman dan cicilan tidak dihitung sebagai pemasukan atau pengeluaran, tapi saldo dompet
        tetap ikut bergerak.
      </p>

      {features.isError ? (
        <Card>
          <ErrorState message={features.error.message} onRetry={() => void features.refetch()} />
        </Card>
      ) : unavailable ? (
        <Card>
          <EmptyState
            icon={HandCoins}
            title="Fitur belum tersedia"
            description="Pencatatan utang & piutang belum aktif untuk akunmu."
            action={
              <Link
                to="/"
                className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 text-sm font-semibold text-on-primary hover:bg-primary-hover"
              >
                Kembali ke Beranda
              </Link>
            }
          />
        </Card>
      ) : !enabled || debts.isPending ? (
        <div
          className="flex flex-col gap-3"
          role="status"
          aria-busy="true"
          aria-label="Memuat utang"
        >
          <Skeleton className="h-24" />
          <Skeleton className="h-32" />
        </div>
      ) : debts.isError ? (
        <Card>
          <ErrorState message={debts.error.message} onRetry={() => void debts.refetch()} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={HandCoins}
            title="Belum ada utang atau piutang"
            description="Catat pinjaman ke teman, kredit HP, atau uang yang kamu pinjamkan. Catatku menyusun jadwal cicilan dan mengingatkan sebelum jatuh tempo."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  icon={<Plus className="size-4" aria-hidden />}
                  onClick={() => setView({ kind: 'new' })}
                >
                  Catat utang/piutang
                </Button>
                <Button
                  variant="ghost"
                  icon={<Users className="size-4" aria-hidden />}
                  onClick={() => setView({ kind: 'split' })}
                >
                  Bagi tagihan
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <>
          <SummaryCard debts={items} />
          <Segmented<DebtDirection>
            label="Tampilkan"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'PAYABLE', label: 'Utang saya' },
              { value: 'RECEIVABLE', label: 'Piutang saya' },
            ]}
          />
          {active.length === 0 && settled.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              {tab === 'PAYABLE' ? 'Tidak ada utang.' : 'Tidak ada piutang.'}
            </p>
          ) : (
            <>
              {active.length > 0 && (
                <ul
                  aria-label="Belum lunas"
                  className="grid grid-cols-1 items-start gap-3 md:grid-cols-2"
                >
                  {active.map((d) => (
                    <li key={d.id}>
                      <DebtCard
                        debt={d}
                        onOpen={() => setView({ kind: 'detail', id: d.id })}
                        onPay={() => setView({ kind: 'pay', id: d.id })}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {settled.length > 0 && (
                <section aria-labelledby="judul-lunas" className="flex flex-col gap-2">
                  <h2 id="judul-lunas" className="text-sm font-semibold text-muted">
                    Lunas
                  </h2>
                  <ul className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
                    {settled.map((d) => (
                      <li key={d.id}>
                        <DebtCard debt={d} onOpen={() => setView({ kind: 'detail', id: d.id })} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </>
      )}

      <Dialog
        open={view?.kind === 'new' || (view?.kind === 'edit' && !!current)}
        onClose={close}
        title={view?.kind === 'edit' ? 'Ubah utang/piutang' : 'Catat utang/piutang'}
      >
        {view?.kind === 'new' && (
          <DebtForm
            initialDirection={tab}
            onDone={(d) => {
              setTab(d.direction);
              close();
            }}
          />
        )}
        {view?.kind === 'edit' && current && (
          <DebtForm debt={current} onDone={() => setView({ kind: 'detail', id: current.id })} />
        )}
      </Dialog>

      <Dialog
        open={view?.kind === 'split'}
        onClose={close}
        title="Bagi tagihan"
        description="Bagianmu dicatat sebagai pengeluaran, bagian teman menjadi piutang."
      >
        {view?.kind === 'split' && (
          <SplitBillForm
            onDone={() => {
              setTab('RECEIVABLE');
              close();
            }}
          />
        )}
      </Dialog>

      <Dialog
        open={view?.kind === 'detail' && !!current}
        onClose={close}
        title={current ? debtTitle(current) : ''}
        description="Detail utang/piutang"
      >
        {view?.kind === 'detail' && current && (
          <DebtDetail
            debt={current}
            onPay={() => setView({ kind: 'pay', id: current.id })}
            onEdit={() => setView({ kind: 'edit', id: current.id })}
            onDeleted={close}
          />
        )}
      </Dialog>

      <Dialog
        open={view?.kind === 'pay' && !!current}
        onClose={close}
        title={current ? debtTitle(current) : ''}
        description={current?.direction === 'RECEIVABLE' ? 'Catat penerimaan' : 'Catat pembayaran'}
      >
        {view?.kind === 'pay' && current && (
          <DebtPaymentForm
            debt={current}
            onDone={() => setView({ kind: 'detail', id: current.id })}
          />
        )}
      </Dialog>
    </div>
  );
}

function SummaryCard({ debts }: { debts: DebtDTO[] }) {
  const open = debts.filter((d) => !d.settledAt);
  const payable = open.filter((d) => d.direction === 'PAYABLE');
  const receivable = open.filter((d) => d.direction === 'RECEIVABLE');
  const sum = (list: DebtDTO[]) => list.reduce((s, d) => s + d.remaining, 0);
  const overdue = open.filter((d) => debtProgressOf(d).overdueAmount > 0).length;
  return (
    <Card className="grid grid-cols-2 gap-3">
      <div className="min-w-0">
        <p className="text-sm text-muted">Sisa utang</p>
        <p className="tabular truncate text-2xl font-bold text-expense-text">
          {formatRupiah(sum(payable))}
        </p>
        <p className="text-xs text-muted">{payable.length} belum lunas</p>
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted">Sisa piutang</p>
        <p className="tabular truncate text-2xl font-bold text-income-text">
          {formatRupiah(sum(receivable))}
        </p>
        <p className="text-xs text-muted">{receivable.length} belum dibayar</p>
      </div>
      {overdue > 0 && (
        <p className="col-span-2 rounded-control bg-warning/10 px-3 py-2 text-sm font-medium text-warning-text">
          {overdue} lewat jatuh tempo
        </p>
      )}
    </Card>
  );
}

function ProgressBlock({ debt, p }: { debt: DebtDTO; p: DebtProgress }) {
  const line = nextDueLine(debt, p);
  return (
    <>
      <ProgressBar
        ratio={p.ratio}
        label={`Progres pelunasan ${debtTitle(debt)}`}
        barClassName={cn(
          p.settled ? 'bg-income' : line.overdue ? 'bg-warning' : 'bg-primary',
          'origin-left motion-safe:animate-bar-grow',
        )}
      />
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="tabular text-muted">
          {formatRupiah(debt.paid)} dari {formatRupiah(debt.total)}
        </span>
        <span className="tabular font-semibold">Sisa {formatRupiah(debt.remaining)}</span>
      </span>
      <span
        className={cn(
          'tabular text-sm font-medium',
          p.settled && 'text-income-text',
          line.overdue && 'text-warning-text',
        )}
      >
        {line.text}
      </span>
    </>
  );
}

function DebtCard({
  debt,
  onOpen,
  onPay,
}: {
  debt: DebtDTO;
  onOpen: () => void;
  onPay?: () => void;
}) {
  const p = debtProgressOf(debt);
  const payable = debt.direction === 'PAYABLE';
  return (
    <div className="flex flex-col rounded-card border border-line bg-surface shadow-card">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Lihat ${debtTitle(debt)}`}
        className="flex flex-col gap-3 rounded-t-card p-4 text-left hover:bg-surface-muted/60"
      >
        <span className="flex items-center gap-3">
          <IconBadge icon={HandCoins} color={DEBT_COLOR} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{debt.counterparty}</span>
            <span className="block text-xs text-muted">
              {debt.installments && debt.installments > 1
                ? `Cicilan ${debt.installments} bulan`
                : 'Sekali bayar'}
              {debt.note && ` · ${debt.note}`}
            </span>
          </span>
          {p.settled && (
            <CircleCheck className="size-5 shrink-0 text-income-text" aria-label="Lunas" />
          )}
        </span>
        <ProgressBlock debt={debt} p={p} />
      </button>
      {onPay && !p.settled && (
        <div className="border-t border-line p-2">
          <Button
            variant="ghost"
            className="w-full text-primary"
            icon={<HandCoins className="size-4" aria-hidden />}
            onClick={onPay}
            aria-label={`${payable ? 'Bayar utang ke' : 'Terima pembayaran dari'} ${debt.counterparty}`}
          >
            {payable ? 'Bayar' : 'Terima pembayaran'}
          </Button>
        </div>
      )}
    </div>
  );
}

function DebtDetail({
  debt,
  onPay,
  onEdit,
  onDeleted,
}: {
  debt: DebtDTO;
  onPay: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const p = debtProgressOf(debt);
  const payable = debt.direction === 'PAYABLE';
  const invalidateMoney = useInvalidateMoney();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/debts/${debt.id}`, { method: 'DELETE' });
      void invalidateMoney();
      toast({ message: `${debtTitle(debt)} dihapus` });
      onDeleted();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Gagal menghapus', tone: 'error' });
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <IconBadge icon={HandCoins} color={DEBT_COLOR} />
          <div className="min-w-0 flex-1">
            <p className="tabular truncate text-2xl font-bold">{formatRupiah(debt.remaining)}</p>
            <p className="text-sm text-muted">
              Sisa {payable ? 'utang' : 'piutang'} · dipinjam {formatShortDate(debt.startDate)}
            </p>
          </div>
        </div>
        <ProgressBlock debt={debt} p={p} />
        <p className="text-sm text-muted">
          Pokok {formatRupiah(debt.principal)}
          {debt.interest > 0 && ` + bunga/biaya ${formatRupiah(debt.interest)}`}
          {debt.wallet && ` · dompet ${debt.wallet.name}`}
        </p>
        {debt.note && <p className="text-sm break-words">{debt.note}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {!p.settled && (
          <Button
            size="lg"
            className="flex-1"
            data-autofocus
            icon={<HandCoins className="size-4" aria-hidden />}
            onClick={onPay}
          >
            {payable ? 'Bayar' : 'Terima pembayaran'}
          </Button>
        )}
        <Button
          size="lg"
          variant="ghost"
          icon={<Pencil className="size-4" aria-hidden />}
          onClick={onEdit}
        >
          Ubah
        </Button>
      </div>

      {p.schedule.length > 1 && <Schedule p={p} />}
      <Payments debt={debt} />

      <Button
        variant="ghost"
        className="self-start text-expense-text"
        icon={<Trash2 className="size-4" aria-hidden />}
        onClick={() => setConfirmDelete(true)}
      >
        Hapus
      </Button>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        loading={busy}
        title={`Hapus ${debtTitle(debt).toLowerCase()}?`}
        description="Semua pembayarannya ikut dihapus, termasuk transaksinya di dompet, jadi saldo kembali seperti sebelum dicatat."
        confirmLabel="Hapus"
      />
    </div>
  );
}

const ITEM_STATUS = {
  PAID: { label: 'Lunas', className: 'text-income-text' },
  PARTIAL: { label: 'Sebagian', className: 'text-primary' },
  UNPAID: { label: 'Belum', className: 'text-muted' },
} as const;

function Schedule({ p }: { p: DebtProgress }) {
  return (
    <section aria-labelledby="judul-jadwal" className="flex flex-col gap-2">
      <h3 id="judul-jadwal" className="text-sm font-semibold text-muted">
        Jadwal cicilan
      </h3>
      <ol className="flex max-h-64 flex-col divide-y divide-line overflow-y-auto rounded-control border border-line">
        {p.schedule.map((s) => {
          const status = s.overdue
            ? { label: 'Terlambat', className: 'text-warning-text' }
            : ITEM_STATUS[s.status];
          return (
            <li key={s.index} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="tabular w-6 shrink-0 text-right text-muted">{s.index + 1}.</span>
              <span className="min-w-0 flex-1">{s.dueDate ? formatShortDate(s.dueDate) : '-'}</span>
              <span className="tabular font-medium">{formatRupiah(s.amount)}</span>
              <span
                className={cn('w-20 shrink-0 text-right text-xs font-semibold', status.className)}
              >
                {status.label}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Payments({ debt }: { debt: DebtDTO }) {
  const payments = useDebtPayments(debt.id);
  const invalidateMoney = useInvalidateMoney();
  const toast = useToast();
  const [removing, setRemoving] = useState<DebtPaymentDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const payable = debt.direction === 'PAYABLE';

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api(`/debts/payments/${removing.id}`, { method: 'DELETE' });
      void invalidateMoney();
      toast({ message: 'Pembayaran dihapus' });
      setRemoving(null);
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Gagal menghapus', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="judul-pembayaran" className="flex flex-col gap-2">
      <h3 id="judul-pembayaran" className="text-sm font-semibold text-muted">
        Riwayat pembayaran
      </h3>
      {payments.isPending ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Memuat pembayaran"
          className="flex flex-col gap-2"
        >
          <Skeleton className="h-12" />
        </div>
      ) : payments.isError ? (
        <ErrorState message={payments.error.message} onRetry={() => void payments.refetch()} />
      ) : payments.data.length === 0 ? (
        <p className="text-sm text-muted">Belum ada pembayaran.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {payments.data.map((pay) => (
            <li key={pay.id} className="flex items-center gap-3 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {formatShortDate(pay.date)}
                  {pay.wallet && ` · ${payable ? 'dari' : 'ke'} ${pay.wallet.name}`}
                </span>
                {pay.note && <span className="block truncate text-xs text-muted">{pay.note}</span>}
              </span>
              <span className="tabular shrink-0 text-sm font-semibold">
                {formatRupiah(pay.amount)}
              </span>
              <button
                type="button"
                onClick={() => setRemoving(pay)}
                className="flex size-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-surface-muted hover:text-expense-text"
                aria-label={`Hapus pembayaran ${formatRupiah(pay.amount)} tanggal ${formatShortDate(pay.date)}`}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => void remove()}
        loading={busy}
        title="Hapus pembayaran ini?"
        description={
          removing?.walletId
            ? 'Transaksinya di dompet ikut dihapus, jadi saldo kembali seperti semula.'
            : 'Sisa tagihan akan dihitung ulang tanpa pembayaran ini.'
        }
        confirmLabel="Hapus"
      />
    </section>
  );
}
