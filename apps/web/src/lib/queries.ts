import type {
  BudgetMonthDTO,
  CategoryBreakdownDTO,
  CategoryDTO,
  CategoryType,
  ListTransactionsQuery,
  PendingOccurrenceDTO,
  RecurringRuleDTO,
  SummaryDTO,
  TransactionPage,
  TransactionTemplateDTO,
  TrendDTO,
  WalletDTO,
} from '@catatku/shared';
import {
  keepPreviousData,
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
  summary: (month: string) => ['reports', 'summary', month] as const,
  byCategory: (month: string, type: CategoryType) =>
    ['reports', 'by-category', month, type] as const,
  trend: (months: number) => ['reports', 'trend', months] as const,
  budgets: (month: string) => ['budgets', month] as const,
  recurring: ['recurring', 'rules'] as const,
  recurringPending: ['recurring', 'pending'] as const,
  templates: ['templates'] as const,
};

export function useTemplates(enabled = true) {
  return useQuery({
    queryKey: queryKeys.templates,
    queryFn: ({ signal }) =>
      api<{ items: TransactionTemplateDTO[] }>('/templates', { signal }).then((r) => r.items),
    enabled,
  });
}

export function useRecurringRules(enabled = true) {
  return useQuery({
    queryKey: queryKeys.recurring,
    queryFn: ({ signal }) =>
      api<{ items: RecurringRuleDTO[] }>('/recurring', { signal }).then((r) => r.items),
    enabled,
  });
}

export function usePendingOccurrences(enabled = true) {
  return useQuery({
    queryKey: queryKeys.recurringPending,
    queryFn: ({ signal }) =>
      api<{ items: PendingOccurrenceDTO[] }>('/recurring/pending', { signal }).then((r) => r.items),
    enabled,
  });
}

export function fetchBudgets(month: string, signal?: AbortSignal) {
  return api<BudgetMonthDTO>('/budgets', { query: { month }, signal });
}

export function useBudgets(month: string) {
  return useQuery({
    queryKey: queryKeys.budgets(month),
    queryFn: ({ signal }) => fetchBudgets(month, signal),
    placeholderData: keepPreviousData,
  });
}

export function useSummary(month: string) {
  return useQuery({
    queryKey: queryKeys.summary(month),
    queryFn: ({ signal }) => api<SummaryDTO>('/reports/summary', { query: { month }, signal }),
  });
}

export function useByCategory(month: string, type: CategoryType) {
  return useQuery({
    queryKey: queryKeys.byCategory(month, type),
    queryFn: ({ signal }) =>
      api<CategoryBreakdownDTO>('/reports/by-category', { query: { month, type }, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useTrend(months = 6) {
  return useQuery({
    queryKey: queryKeys.trend(months),
    queryFn: ({ signal }) => api<TrendDTO>('/reports/trend', { query: { months }, signal }),
  });
}

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

/**
 * Semua data yang ikut berubah saat uang bergerak: saldo, riwayat, laporan, anggaran, berulang,
 * dan template (status dompet/kategori diarsipkan).
 */
export function invalidateMoney(qc: QueryClient) {
  return Promise.all(
    ['wallets', 'transactions', 'reports', 'budgets', 'recurring', 'templates'].map((key) =>
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
