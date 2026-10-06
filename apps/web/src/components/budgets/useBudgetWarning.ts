import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { budgetMessage } from '../../lib/budget';
import { fetchBudgets, queryKeys } from '../../lib/queries';
import { useToast } from '../ui/Toast';

/**
 * Setelah pengeluaran dicatat: tampilkan peringatan bila anggaran kategorinya
 * di bulan itu sudah ≥ 80% atau terlampaui. Gagal memuat anggaran tidak mengganggu alur catat.
 */
export function useBudgetWarning() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();

  return useCallback(
    async (categoryId: string, date: string) => {
      const month = date.slice(0, 7);
      try {
        const data = await qc.fetchQuery({
          queryKey: queryKeys.budgets(month),
          queryFn: ({ signal }) => fetchBudgets(month, signal),
          staleTime: 0,
        });
        const item = data.items.find((i) => i.categoryId === categoryId && i.id !== null);
        if (!item || item.status === 'ok') return;
        toast({
          message: budgetMessage(item),
          tone: 'warning',
          duration: 6000,
          action: { label: 'Lihat', onClick: () => navigate(`/anggaran?bulan=${month}`) },
        });
      } catch {
        // Peringatan hanya pelengkap; transaksi sudah tersimpan.
      }
    },
    [qc, toast, navigate],
  );
}
