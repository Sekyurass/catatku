import { formatRupiah, type GoalDTO } from '@catatku/shared';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useInvalidateMoney, useWallets } from '../../lib/queries';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';

/** Hapus target beserta riwayat setorannya; dompet tabungan dan transfernya tetap ada. */
export function DeleteGoalButton({
  goal,
  onDeleted,
  className,
}: {
  goal: GoalDTO;
  onDeleted: () => void;
  className?: string;
}) {
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const wallets = useWallets();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const balance = wallets.data?.find((w) => w.id === goal.walletId)?.balance ?? 0;
  const walletNote = goal.wallet
    ? balance > 0
      ? ` Uang ${formatRupiah(balance)} tetap ada di dompet ${goal.wallet.name}; pindahkan atau arsipkan dompetnya lewat menu Dompet.`
      : ` Dompet ${goal.wallet.name} tetap ada; arsipkan lewat menu Dompet bila tidak dipakai lagi.`
    : '';

  const remove = async () => {
    setDeleting(true);
    try {
      await api(`/goals/${goal.id}`, { method: 'DELETE' });
      void invalidate();
      toast({ message: `Target ${goal.name} dihapus`, tone: 'info' });
      setConfirming(false);
      onDeleted();
    } catch (err) {
      setDeleting(false);
      setConfirming(false);
      toast({
        message: err instanceof Error ? err.message : 'Target belum bisa dihapus. Coba lagi.',
        tone: 'error',
      });
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        className={className ?? 'text-expense-text'}
        onClick={() => setConfirming(true)}
        icon={<Trash2 className="size-4" aria-hidden />}
      >
        Hapus target
      </Button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={remove}
        loading={deleting}
        title={`Hapus target "${goal.name}"?`}
        description={`Riwayat setorannya ikut terhapus. Transfer yang sudah tercatat tetap ada di Transaksi.${walletNote}`}
        confirmLabel="Hapus"
      />
    </>
  );
}
