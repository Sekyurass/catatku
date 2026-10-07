import { useCallback } from 'react';
import { api } from '../../lib/api';
import { useInvalidateMoney } from '../../lib/queries';
import { useToast } from '../ui/Toast';

/** Hapus (soft delete) lalu tawarkan Urungkan. Melempar error bila penghapusan gagal. */
export function useDeleteTransaction() {
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  return useCallback(
    async (id: string) => {
      await api(`/transactions/${id}`, { method: 'DELETE' });
      void invalidate();
      toast({
        message: 'Transaksi dihapus',
        tone: 'info',
        duration: 5000,
        action: {
          label: 'Urungkan',
          onClick: async () => {
            try {
              await api(`/transactions/${id}/restore`, { method: 'POST' });
              void invalidate();
              toast({ message: 'Transaksi dikembalikan' });
            } catch {
              toast({ message: 'Gagal mengurungkan. Coba lagi.', tone: 'error' });
            }
          },
        },
      });
    },
    [invalidate, toast],
  );
}
