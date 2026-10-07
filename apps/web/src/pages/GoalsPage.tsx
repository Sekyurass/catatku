import {
  FEATURE_FLAGS,
  formatRupiah,
  type GoalContributionDTO,
  type GoalContributionType,
  type GoalDTO,
  type GoalProgress,
} from '@catatku/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Goal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ContributionForm } from '../components/goals/ContributionForm';
import { DeleteGoalButton } from '../components/goals/DeleteGoalButton';
import { GoalForm } from '../components/goals/GoalForm';
import { IconBadge } from '../components/IconBadge';
import { PlanHeader } from '../components/plan/PlanHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Dialog } from '../components/ui/Dialog';
import { ProgressBar } from '../components/ui/ProgressBar';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useFeatures } from '../lib/features';
import { formatShortDate } from '../lib/format';
import { deadlineLabel, GOAL_STATUS, planLines, progressOf } from '../lib/goal';
import { categoryIcon } from '../lib/icons';
import { queryKeys, useGoalContributions, useGoals, useInvalidateMoney } from '../lib/queries';

type View =
  | { kind: 'new' }
  | { kind: 'edit'; id: string }
  | { kind: 'detail'; id: string }
  | { kind: 'contribute'; id: string; type: GoalContributionType };

export function GoalsPage() {
  const features = useFeatures();
  const enabled = features.data?.[FEATURE_FLAGS.SAVINGS_GOALS] ?? false;
  const goals = useGoals(enabled);
  const [view, setView] = useState<View | null>(null);

  if (features.isSuccess && !enabled) return <Navigate to="/anggaran" replace />;

  const items = goals.data ?? [];
  const current = view && view.kind !== 'new' ? items.find((g) => g.id === view.id) : undefined;
  const close = () => setView(null);

  return (
    <div className="flex flex-col gap-4">
      <PlanHeader
        action={
          items.length > 0 && (
            <Button
              icon={<Plus className="size-4" aria-hidden />}
              onClick={() => setView({ kind: 'new' })}
            >
              Target baru
            </Button>
          )
        }
      />

      {!enabled || goals.isPending ? (
        <div
          className="flex flex-col gap-3"
          role="status"
          aria-busy="true"
          aria-label="Memuat target"
        >
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      ) : goals.isError ? (
        <Card>
          <ErrorState message={goals.error.message} onRetry={() => void goals.refetch()} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Goal}
            title="Belum ada target tabungan"
            description="Tentukan tujuan seperti dana darurat atau liburan, lalu setor sedikit demi sedikit. Catatku menghitung berapa yang perlu disisihkan tiap bulan."
            action={
              <Button
                icon={<Plus className="size-4" aria-hidden />}
                onClick={() => setView({ kind: 'new' })}
              >
                Buat target
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <SummaryCard goals={items} />
          <ul
            aria-label="Daftar target"
            className="grid grid-cols-1 items-start gap-3 md:grid-cols-2"
          >
            {items.map((goal) => (
              <li key={goal.id}>
                <GoalCard
                  goal={goal}
                  onOpen={() => setView({ kind: 'detail', id: goal.id })}
                  onDeposit={() => setView({ kind: 'contribute', id: goal.id, type: 'DEPOSIT' })}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog
        open={view?.kind === 'new' || (view?.kind === 'edit' && !!current)}
        onClose={close}
        title={view?.kind === 'edit' ? 'Ubah target' : 'Target baru'}
      >
        {view?.kind === 'new' && <GoalForm onDone={close} />}
        {view?.kind === 'edit' && current && <GoalForm goal={current} onDone={close} />}
      </Dialog>

      <Dialog
        open={view?.kind === 'detail' && !!current}
        onClose={close}
        title={current?.name ?? ''}
        description="Detail target"
      >
        {view?.kind === 'detail' && current && (
          <GoalDetail
            goal={current}
            onContribute={(type) => setView({ kind: 'contribute', id: current.id, type })}
            onEdit={() => setView({ kind: 'edit', id: current.id })}
            onDeleted={close}
          />
        )}
      </Dialog>

      <Dialog
        open={view?.kind === 'contribute' && !!current}
        onClose={close}
        title={current?.name ?? ''}
        description="Catat setoran atau penarikan"
      >
        {view?.kind === 'contribute' && current && (
          <ContributionForm
            goal={current}
            initialType={view.type}
            onDone={close}
            onEdit={() => setView({ kind: 'edit', id: current.id })}
          />
        )}
      </Dialog>
    </div>
  );
}

function SummaryCard({ goals }: { goals: GoalDTO[] }) {
  const saved = goals.reduce((sum, g) => sum + Math.min(g.saved, g.targetAmount), 0);
  const target = goals.reduce((sum, g) => sum + g.targetAmount, 0);
  const achieved = goals.filter((g) => g.saved >= g.targetAmount).length;
  return (
    <Card className="flex flex-col gap-3">
      <div className="min-w-0">
        <p className="text-sm text-muted">Terkumpul dari {goals.length} target</p>
        <p className="tabular truncate text-3xl font-bold">{formatRupiah(saved)}</p>
      </div>
      <ProgressBar
        ratio={target > 0 ? saved / target : 0}
        label="Total progres semua target"
        barClassName="bg-primary origin-left motion-safe:animate-bar-grow"
      />
      <p className="tabular flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-muted">
        <span>Dari total {formatRupiah(target)}</span>
        {achieved > 0 && <span className="text-income-text">{achieved} tercapai</span>}
      </p>
    </Card>
  );
}

function StatusBadge({ p }: { p: GoalProgress }) {
  const meta = GOAL_STATUS[p.status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        meta.badge,
      )}
    >
      <Icon
        className={cn('size-3.5', p.status === 'achieved' && 'motion-safe:animate-celebrate')}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}

function ProgressBlock({ goal, p }: { goal: GoalDTO; p: GoalProgress }) {
  const lines = planLines(p);
  return (
    <>
      <ProgressBar
        ratio={p.ratio}
        label={`Progres target ${goal.name}`}
        barClassName={cn(GOAL_STATUS[p.status].bar, 'origin-left motion-safe:animate-bar-grow')}
      />
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="tabular text-muted">
          {formatRupiah(goal.saved)} dari {formatRupiah(goal.targetAmount)}
        </span>
        <span className="tabular font-semibold">{Math.floor(p.ratio * 100)}%</span>
      </span>
      <span className="flex flex-col gap-0.5 text-sm">
        <span
          className={cn(
            'tabular font-medium',
            p.status === 'achieved' && 'text-income-text',
            p.status === 'behind' && 'text-warning-text',
          )}
        >
          {lines.main}
        </span>
        {lines.sub && <span className="tabular text-muted">{lines.sub}</span>}
      </span>
    </>
  );
}

function GoalCard({
  goal,
  onOpen,
  onDeposit,
}: {
  goal: GoalDTO;
  onOpen: () => void;
  onDeposit: () => void;
}) {
  const p = progressOf(goal);
  return (
    <div className="flex flex-col rounded-card border border-line bg-surface shadow-card">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Lihat target ${goal.name}`}
        className="flex flex-col gap-3 rounded-t-card p-4 text-left hover:bg-surface-muted/60"
      >
        <span className="flex items-center gap-3">
          <IconBadge icon={categoryIcon(goal.icon)} color={goal.color} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{goal.name}</span>
            <span className="block text-xs text-muted">{deadlineLabel(goal, p)}</span>
          </span>
          <StatusBadge p={p} />
        </span>
        <ProgressBlock goal={goal} p={p} />
      </button>
      {p.status !== 'achieved' && (
        <div className="border-t border-line p-2">
          <Button
            variant="ghost"
            className="w-full text-primary"
            icon={<ArrowDownToLine className="size-4" aria-hidden />}
            onClick={onDeposit}
            aria-label={`Setor ke ${goal.name}`}
          >
            Setor
          </Button>
        </div>
      )}
    </div>
  );
}

function GoalDetail({
  goal,
  onContribute,
  onEdit,
  onDeleted,
}: {
  goal: GoalDTO;
  onContribute: (type: GoalContributionType) => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const p = progressOf(goal);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <IconBadge icon={categoryIcon(goal.icon)} color={goal.color} />
          <div className="min-w-0 flex-1">
            <p className="tabular truncate text-2xl font-bold">{formatRupiah(goal.saved)}</p>
            <p className="text-sm text-muted">{deadlineLabel(goal, p)}</p>
          </div>
          <StatusBadge p={p} />
        </div>
        <ProgressBlock goal={goal} p={p} />
        {goal.wallet && (
          <p className="text-sm text-muted">
            Dompet tabungan: <span className="font-medium text-fg">{goal.wallet.name}</span>
            {goal.wallet.archivedAt && ' (diarsipkan)'}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="lg"
          className="flex-1"
          data-autofocus
          icon={<ArrowDownToLine className="size-4" aria-hidden />}
          onClick={() => onContribute('DEPOSIT')}
        >
          Setor
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="flex-1"
          disabled={goal.saved <= 0}
          icon={<ArrowUpFromLine className="size-4" aria-hidden />}
          onClick={() => onContribute('WITHDRAW')}
        >
          Tarik
        </Button>
        <Button
          size="lg"
          variant="ghost"
          icon={<Pencil className="size-4" aria-hidden />}
          onClick={onEdit}
        >
          Ubah
        </Button>
      </div>

      <History goal={goal} />

      <DeleteGoalButton
        goal={goal}
        onDeleted={onDeleted}
        className="self-start text-expense-text"
      />
    </div>
  );
}

function History({ goal }: { goal: GoalDTO }) {
  const history = useGoalContributions(goal.id);
  const qc = useQueryClient();
  const invalidateMoney = useInvalidateMoney();
  const toast = useToast();
  const [removing, setRemoving] = useState<GoalContributionDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api(`/goals/contributions/${removing.id}`, { method: 'DELETE' });
      if (removing.transferGroupId) void invalidateMoney();
      else void qc.invalidateQueries({ queryKey: queryKeys.goals });
      toast({ message: removing.type === 'DEPOSIT' ? 'Setoran dihapus' : 'Penarikan dihapus' });
      setRemoving(null);
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Gagal menghapus', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="judul-riwayat-target" className="flex flex-col gap-2">
      <h3 id="judul-riwayat-target" className="text-sm font-semibold text-muted">
        Riwayat
      </h3>
      {history.isPending ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Memuat riwayat"
          className="flex flex-col gap-2"
        >
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : history.isError ? (
        <ErrorState message={history.error.message} onRetry={() => void history.refetch()} />
      ) : history.data.length === 0 ? (
        <p className="text-sm text-muted">
          Belum ada setoran. Mulai dari nominal kecil pun tidak apa-apa.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {history.data.map((c) => {
            const deposit = c.type === 'DEPOSIT';
            const Icon = deposit ? ArrowDownToLine : ArrowUpFromLine;
            const label = deposit ? 'Setor' : 'Tarik';
            return (
              <li key={c.id} className="flex items-center gap-3 py-1.5">
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full',
                    deposit ? 'bg-income/10 text-income-text' : 'bg-expense/10 text-expense-text',
                  )}
                  aria-hidden
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {label}
                    {c.wallet && ` · ${deposit ? 'dari' : 'ke'} ${c.wallet.name}`}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {formatShortDate(c.date)}
                    {c.note && ` · ${c.note}`}
                  </span>
                </span>
                <span
                  className={cn(
                    'tabular shrink-0 text-sm font-semibold',
                    deposit ? 'text-income-text' : 'text-expense-text',
                  )}
                >
                  {deposit ? '+' : '−'}
                  {formatRupiah(c.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => setRemoving(c)}
                  className="flex size-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-surface-muted hover:text-expense-text"
                  aria-label={`Hapus ${label.toLowerCase()} ${formatRupiah(c.amount)} tanggal ${formatShortDate(c.date)}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => void remove()}
        loading={busy}
        title={removing?.type === 'WITHDRAW' ? 'Hapus penarikan ini?' : 'Hapus setoran ini?'}
        description={
          removing?.transferGroupId
            ? 'Transfer yang tercatat untuknya ikut dihapus, jadi saldo dompet kembali seperti semula.'
            : 'Progres target akan dihitung ulang tanpa catatan ini.'
        }
        confirmLabel="Hapus"
      />
    </section>
  );
}
