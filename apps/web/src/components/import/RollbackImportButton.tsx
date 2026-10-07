import type { ImportBatchDTO } from '@catatku/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Undo2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../lib/api';
import { invalidateMoney, queryKeys } from '../../lib/queries';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';

/** Hapus semua transaksi dari satu impor, dengan konfirmasi. */
export function RollbackImportButton({
  batch,
  className,
}: {
  batch: ImportBatchDTO;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const count = batch.stats.imported;

  const rollback = async () => {
    setBusy(true);
    try {
      const updated = await api<ImportBatchDTO>(`/imports/${batch.id}/rollback`, {
        method: 'POST',
      });
      queryClient.setQueryData(queryKeys.importBatch(batch.id), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.imports });
      void invalidateMoney(queryClient);
      toast({ message: `Impor dibatalkan, ${count} transaksi dihapus`, tone: 'info' });
      setOpen(false);
    } catch (err) {
      toast({
        message: err instanceof Error ? err.message : 'Gagal membatalkan impor.',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        icon={<Undo2 className="size-4" aria-hidden />}
        onClick={() => setOpen(true)}
        className={className}
        aria-label={`Batalkan impor ${batch.filename}`}
      >
        Batalkan impor
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Batalkan impor?"
        description={`${count.toLocaleString('id-ID')} transaksi dari ${batch.filename} akan dihapus permanen, termasuk yang sudah kamu ubah setelah diimpor.`}
        confirmLabel="Hapus transaksinya"
        loading={busy}
        onConfirm={() => void rollback()}
      />
    </>
  );
}
