import type {
  AttachmentDTO,
  BankEmailInboxDTO,
  BankEmailPendingDTO,
  BudgetMonthDTO,
  CategoryBreakdownDTO,
  CategoryDTO,
  CategoryMapDTO,
  CategoryType,
  CompareDTO,
  ForecastDTO,
  GoalContributionDTO,
  GoalDTO,
  ImportBatchDTO,
  InsightDTO,
  ListTransactionsQuery,
  MonthlyReportDTO,
  PendingOccurrenceDTO,
  RecurringRuleDTO,
  SummaryDTO,
  TagBreakdownDTO,
  TagDTO,
  TransactionPage,
  TransactionTemplateDTO,
  TrendDTO,
  WalletDTO,
  YearlyReportDTO,
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
  tags: ['tags'] as const,
  byTag: (month: string, type: CategoryType) => ['reports', 'by-tag', month, type] as const,
  attachments: (transactionId: string) => ['attachments', transactionId] as const,
  goals: ['goals'] as const,
  goalContributions: (goalId: string) => ['goals', goalId, 'contributions'] as const,
  insights: ['insights'] as const,
  monthlyReport: (month: string) => ['reports', 'monthly', month] as const,
  compare: (from: string, to: string) => ['reports', 'compare', from, to] as const,
  yearlyReport: (year: number) => ['reports', 'yearly', year] as const,
  forecast: ['reports', 'forecast'] as const,
  quickTextSharing: ['quick-text', 'sharing'] as const,
  bankEmail: ['bank-email'] as const,
  bankEmailPending: ['bank-email', 'pending'] as const,
};

export function useBankEmail(enabled = true) {
  return useQuery({
    queryKey: queryKeys.bankEmail,
    queryFn: ({ signal }) => api<BankEmailInboxDTO>('/bank-email', { signal }),
    enabled,
  });
}

export function useBankEmailPending(enabled = true) {
  return useQuery({
    queryKey: queryKeys.bankEmailPending,
    queryFn: ({ signal }) =>
      api<{ items: BankEmailPendingDTO[] }>('/bank-email/pending', { signal }).then((r) => r.items),
    enabled,
  });
}

export const quickTextSharingQuery = queryOptions({
  queryKey: queryKeys.quickTextSharing,
  queryFn: ({ signal }) =>
    api<{ enabled: boolean }>('/quick-text/sharing', { signal }).then((r) => r.enabled),
  staleTime: Infinity,
});

export function useQuickTextSharing(enabled = true) {
  return useQuery({ ...quickTextSharingQuery, enabled });
}

export function useForecast() {
  return useQuery({
    queryKey: queryKeys.forecast,
    queryFn: ({ signal }) => api<ForecastDTO>('/reports/forecast', { signal }),
  });
}

export function useMonthlyReport(month: string) {
  return useQuery({
    queryKey: queryKeys.monthlyReport(month),
    queryFn: ({ signal }) =>
      api<MonthlyReportDTO>('/reports/monthly', { query: { month }, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useCompare(from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.compare(from, to),
    queryFn: ({ signal }) =>
      api<CompareDTO>('/reports/compare', { query: { from, to, type: 'EXPENSE' }, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useYearlyReport(year: number) {
  return useQuery({
    queryKey: queryKeys.yearlyReport(year),
    queryFn: ({ signal }) => api<YearlyReportDTO>('/reports/yearly', { query: { year }, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useInsights(enabled = true) {
  return useQuery({
    queryKey: queryKeys.insights,
    queryFn: ({ signal }) =>
      api<{ items: InsightDTO[] }>('/insights', { signal }).then((r) => r.items),
    enabled,
  });
}

export function useGoals(enabled = true) {
  return useQuery({
    queryKey: queryKeys.goals,
    queryFn: ({ signal }) => api<{ items: GoalDTO[] }>('/goals', { signal }).then((r) => r.items),
    enabled,
  });
}

export function useGoalContributions(goalId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.goalContributions(goalId ?? ''),
    queryFn: ({ signal }) =>
      api<{ items: GoalContributionDTO[] }>(`/goals/${goalId}/contributions`, { signal }).then(
        (r) => r.items,
      ),
    enabled: !!goalId,
  });
}

export function useTags(enabled = true) {
  return useQuery({
    queryKey: queryKeys.tags,
    queryFn: ({ signal }) => api<{ items: TagDTO[] }>('/tags', { signal }).then((r) => r.items),
    enabled,
  });
}

export function useByTag(month: string, type: CategoryType, enabled = true) {
  return useQuery({
    queryKey: queryKeys.byTag(month, type),
    queryFn: ({ signal }) =>
      api<TagBreakdownDTO>('/reports/by-tag', { query: { month, type }, signal }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Tautan foto berumur 15 menit; dimuat ulang sebelum kedaluwarsa. */
export function useAttachments(transactionId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.attachments(transactionId ?? ''),
    queryFn: ({ signal }) =>
      api<{ items: AttachmentDTO[] }>(`/transactions/${transactionId}/attachments`, {
        signal,
      }).then((r) => r.items),
    enabled: enabled && !!transactionId,
    staleTime: 10 * 60_000,
    gcTime: 12 * 60_000,
  });
}

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
 * template (status dompet/kategori diarsipkan), jumlah pemakaian tag, progres target (setoran
 * tertaut transfer mengikuti transaksinya), dan insight.
 */
export function invalidateMoney(qc: QueryClient) {
  return Promise.all(
    [
      'wallets',
      'transactions',
      'reports',
      'budgets',
      'recurring',
      'templates',
      'tags',
      'goals',
      'insights',
    ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
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
