import { formatRupiah, type TransactionDTO, type TransactionTemplateDTO } from '@catatku/shared';
import { ChevronRight, Zap } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { today } from '../../lib/format';
import { useInvalidateMoney, useTemplates } from '../../lib/queries';
import { useBudgetWarning } from '../budgets/useBudgetWarning';
import { useQuickAdd } from '../transactions/QuickAdd';
import { Card, CardHeader } from '../ui/Card';
import { useToast } from '../ui/Toast';
import { TemplateChips } from './TemplateChips';

const linkClass =
  'inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-sm font-semibold text-primary hover:bg-primary-soft';

/**
 * Chip "Cepat catat" di Beranda. Template bernominal langsung dicatat hari ini (bisa diurungkan);
 * template tanpa nominal membuka form yang sudah terisi.
 */
export function QuickRecordCard() {
  const templates = useTemplates();
  const invalidate = useInvalidateMoney();
  const warnBudget = useBudgetWarning();
  const toast = useToast();
  const { openFromTemplate } = useQuickAdd();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!templates.isSuccess) return null;
  const usable = templates.data.filter((t) => t.usable);

  const record = async (t: TransactionTemplateDTO) => {
    if (t.amount === null) return openFromTemplate(t);
    setBusyId(t.id);
    const date = today();
    try {
      const tx = await api<TransactionDTO>(`/templates/${t.id}/use`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: { date },
      });
      void invalidate();
      toast({
        message: `${t.name} ${formatRupiah(t.amount)} tercatat`,
        duration: 5000,
        action: {
          label: 'Urungkan',
          onClick: async () => {
            try {
              await api(`/transactions/${tx.id}`, { method: 'DELETE' });
              void invalidate();
              toast({ message: 'Dibatalkan', tone: 'info' });
            } catch {
              toast({ message: 'Gagal mengurungkan. Coba lagi.', tone: 'error' });
            }
          },
        },
      });
      if (t.type === 'EXPENSE') void warnBudget(t.categoryId, date);
    } catch (err) {
      toast({
        message: err instanceof Error ? err.message : 'Gagal mencatat. Coba lagi.',
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="p-3 sm:p-4">
      <CardHeader
        title="Cepat catat"
        className="mb-1"
        action={
          <Link to="/template" className={linkClass}>
            Atur
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        }
      />
      {usable.length > 0 ? (
        <TemplateChips templates={usable} onPick={(t) => void record(t)} busyId={busyId} />
      ) : (
        <Link
          to="/template"
          className="flex min-h-11 items-center gap-3 rounded-control border border-dashed border-line px-3 py-2 text-sm text-muted hover:bg-surface-muted"
        >
          <Zap className="size-4 shrink-0 text-primary" aria-hidden />
          Simpan transaksi yang sering kamu catat sebagai template, lalu catat dengan satu tap.
        </Link>
      )}
    </Card>
  );
}
