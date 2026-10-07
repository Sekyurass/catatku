import { formatRupiah, type GoalDTO } from '@catatku/shared';
import { PiggyBank } from 'lucide-react';
import { Link } from 'react-router-dom';
import { progressOf } from '../../lib/goal';
import { IconBadge } from '../IconBadge';
import { Card } from '../ui/Card';
import { ProgressBar } from '../ui/ProgressBar';

/**
 * Setoran ke semua target bulan ini dibanding saran setorannya. Setoran berupa transfer, jadi
 * sengaja tidak masuk anggaran pengeluaran; kartu ini yang menampilkannya di tab Anggaran.
 */
export function SavingsThisMonthCard({ goals }: { goals: GoalDTO[] }) {
  const saved = goals.reduce((sum, g) => sum + g.savedThisMonth, 0);
  const plan = goals.reduce((sum, g) => sum + (progressOf(g).suggestedMonthly ?? 0), 0);
  const met = plan > 0 && saved >= plan;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <IconBadge icon={PiggyBank} color="#0F766E" size="sm" />
        <h2 className="min-w-0 flex-1 truncate font-semibold">Menabung bulan ini</h2>
        <Link
          to="/anggaran/target"
          className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-primary hover:underline"
        >
          Lihat target
        </Link>
      </div>
      <p className="tabular text-sm text-muted">
        <span className="text-2xl font-bold text-fg">{formatRupiah(saved)}</span>
        {plan > 0 && <> dari saran {formatRupiah(plan)}</>}
      </p>
      {plan > 0 && (
        <ProgressBar
          ratio={Math.max(0, saved) / plan}
          label="Setoran target bulan ini"
          barClassName={met ? 'bg-income' : 'bg-primary'}
        />
      )}
      <p className="text-sm text-muted">
        {plan === 0
          ? 'Beri tenggat pada target supaya Catatku menghitung saran setoran per bulan.'
          : met
            ? 'Saran setoran bulan ini sudah terpenuhi.'
            : `Kurang ${formatRupiah(plan - saved)} lagi bulan ini.`}{' '}
        Setoran berupa transfer antardompet, jadi tidak dihitung sebagai pengeluaran.
      </p>
    </Card>
  );
}
