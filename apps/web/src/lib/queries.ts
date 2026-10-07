import type {
  BudgetMonthDTO,
  CategoryBreakdownDTO,
  CategoryDTO,
  CategoryMapDTO,
  CategoryType,
  ImportBatchDTO,
  ListTransactionsQuery,
  PendingOccurrenceDTO,
  RecurringRuleDTO,
  SummaryDTO,
  TransactionPage,
  TransactionTemplateDTO,
  TrendDTO,
  WalletDTO,
} from '@catatku/shared';
import { currentMonth } from '@catatku/shared';
import {
  infiniteQueryOptions,
  keepPreviousData,
  type QueryClient,
  queryOptions,
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
  learnedCategories: ['categories', 'learned'] as const,
  transactions: (filters: TransactionFilters) => ['transactions', filters] as const,
  summary: (month: string) => ['reports', 'summary', month] as const,
  byCategory: (month: string, type: CategoryType) =>
    ['reports', 'by-category', month, type] as const,
  trend: (months: number) => ['reports', 'trend', months] as const,
  budgets: (month: string) => ['budgets', month] as const,
  recurring: ['recurring', 'rules'] as const,
  recurringPending: ['recurring', 'pending'] as const,
  templates: ['templates'] as const,
  imports: ['imports'] as const,
  importBatch: (id: string) => ['imports', id] as const,
};

export function useImports(enabled = true) {
  return useQuery({
    queryKey: queryKeys.imports,
    queryFn: ({ signal }) =>
      api<{ items: ImportBatchDTO[] }>('/imports', { signal }).then((r) => r.items),
    enabled,
    refetchInterval: (q) => (q.state.data?.some((b) => b.status === 'PROCESSING') ? 3000 : false),
  });
}

/** Dipantau berkala selama impor besar masih diproses di server. */
export function useImportBatch(initial: ImportBatchDTO) {
  return useQuery({
    queryKey: queryKeys.importBatch(initial.id),
    queryFn: ({ signal }) => api<ImportBatchDTO>(`/imports/${initial.id}`, { signal }),
    initialData: initial,
    enabled: initial.status === 'PROCESSING',
    refetchInterval: (q) => (q.state.data?.status === 'PROCESSING' ? 1500 : false),
  });
}

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

export const budgetsQuery = (month: string) =>
  queryOptions({
    queryKey: queryKeys.budgets(month),
    queryFn: ({ signal }) => fetchBudgets(month, signal),
  });

export function useBudgets(month: string) {
  return useQuery({ ...budgetsQuery(month), placeholderData: keepPreviousData });
}

export const summaryQuery = (month: string) =>
  queryOptions({
    queryKey: queryKeys.summary(month),
    queryFn: ({ signal }) => api<SummaryDTO>('/reports/summary', { query: { month }, signal }),
  });

export function useSummary(month: string) {
  return useQuery(summaryQuery(month));
}

export const byCategoryQuery = (month: string, type: CategoryType) =>
  queryOptions({
    queryKey: queryKeys.byCategory(month, type),
    queryFn: ({ signal }) =>
      api<CategoryBreakdownDTO>('/reports/by-category', { query: { month, type }, signal }),
  });

export function useByCategory(month: string, type: CategoryType) {
  return useQuery({ ...byCategoryQuery(month, type), placeholderData: keepPreviousData });
}

export const trendQuery = (months = 6) =>
  queryOptions({
    queryKey: queryKeys.trend(months),
    queryFn: ({ signal }) => api<TrendDTO>('/reports/trend', { query: { months }, signal }),
  });

export function useTrend(months = 6) {
  return useQuery(trendQuery(months));
}

export const walletsQuery = (includeArchived = false) =>
  queryOptions({
    queryKey: queryKeys.wallets(includeArchived),
    queryFn: ({ signal }) =>
      api<{ items: WalletDTO[] }>('/wallets', { query: { includeArchived }, signal }).then(
        (r) => r.items,
      ),
  });

export function useWallets(includeArchived = false) {
  return useQuery(walletsQuery(includeArchived));
}

export const categoriesQuery = queryOptions({
  queryKey: queryKeys.categories,
  queryFn: ({ signal }) =>
    api<{ items: CategoryDTO[] }>('/categories', { signal }).then((r) => r.items),
});

export function useCategories(type?: CategoryType) {
  return useQuery({
    ...categoriesQuery,
    select: type ? (items) => items.filter((c) => c.type === type) : undefined,
  });
}

export function useLearnedCategories(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.learnedCategories,
    queryFn: ({ signal }) =>
      api<{ items: CategoryMapDTO[] }>('/categories/learned', { signal }).then((r) => r.items),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export const PAGE_SIZE = 30;

export const transactionsQuery = (filters: TransactionFilters) =>
  infiniteQueryOptions({
    queryKey: queryKeys.transactions(filters),
    queryFn: ({ pageParam, signal }) =>
      api<TransactionPage>('/transactions', {
        query: { ...filters, cursor: pageParam, limit: PAGE_SIZE },
        signal,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export function useTransactions(filters: TransactionFilters) {
  return useInfiniteQuery(transactionsQuery(filters));
}

/** Data awal tiap menu utama, diambil lebih dulu agar halaman langsung tampil tanpa kerangka. */
export function prefetchPageData(qc: QueryClient, path: string) {
  const month = currentMonth();
  const jobs: Promise<unknown>[] = [];
  if (path === '/') {
    jobs.push(
      qc.prefetchQuery(walletsQuery()),
      qc.prefetchQuery(summaryQuery(month)),
      qc.prefetchQuery(byCategoryQuery(month, 'EXPENSE')),
      qc.prefetchQuery(trendQuery(6)),
    );
  } else if (path === '/transaksi') {
    jobs.push(
      qc.prefetchInfiniteQuery(transactionsQuery({})),
      qc.prefetchQuery(walletsQuery()),
      qc.prefetchQuery(categoriesQuery),
    );
  } else if (path === '/anggaran') {
    jobs.push(qc.prefetchQuery(budgetsQuery(month)));
  }
  return Promise.all(jobs);
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
