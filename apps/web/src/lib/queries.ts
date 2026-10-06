import type {
  CategoryDTO,
  CategoryType,
  ListTransactionsQuery,
  TransactionPage,
  WalletDTO,
} from '@catatku/shared';
import {
  type QueryClient,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from './api';

export type TransactionFilters = Partial<Omit<ListTransactionsQuery, 'cursor' | 'limit'>>;

export const queryKeys = {
  wallets: (includeArchived = false) => ['wallets', { includeArchived }] as const,
  categories: ['categories'] as const,
  transactions: (filters: TransactionFilters) => ['transactions', filters] as const,
};

export function useWallets(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.wallets(includeArchived),
    queryFn: ({ signal }) =>
      api<{ items: WalletDTO[] }>('/wallets', { query: { includeArchived }, signal }).then(
        (r) => r.items,
      ),
  });
}

export function useCategories(type?: CategoryType) {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: ({ signal }) =>
      api<{ items: CategoryDTO[] }>('/categories', { signal }).then((r) => r.items),
    select: type ? (items) => items.filter((c) => c.type === type) : undefined,
  });
}

export const PAGE_SIZE = 30;

export function useTransactions(filters: TransactionFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.transactions(filters),
    queryFn: ({ pageParam, signal }) =>
      api<TransactionPage>('/transactions', {
        query: { ...filters, cursor: pageParam, limit: PAGE_SIZE },
        signal,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Semua data yang ikut berubah saat uang bergerak: saldo, riwayat, laporan, anggaran. */
export function invalidateMoney(qc: QueryClient) {
  return Promise.all(
    ['wallets', 'transactions', 'reports', 'budgets'].map((key) =>
      qc.invalidateQueries({ queryKey: [key] }),
    ),
  );
}

export function useInvalidateMoney() {
  const qc = useQueryClient();
  return useCallback(() => invalidateMoney(qc), [qc]);
}

/** Dompet yang terakhir dipakai mencatat; jika belum ada, dompet pertama. */
export function pickDefaultWallet(wallets: WalletDTO[]): WalletDTO | undefined {
  return [...wallets].sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''))[0];
}
