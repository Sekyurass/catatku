export const WALLET_TYPES = ['CASH', 'BANK', 'EWALLET'] as const;
export type WalletType = (typeof WALLET_TYPES)[number];

export const CATEGORY_TYPES = ['INCOME', 'EXPENSE'] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export const TRANSACTION_TYPES = ['INCOME', 'EXPENSE', 'TRANSFER'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const PLANS = ['FREE', 'PREMIUM'] as const;
export type Plan = (typeof PLANS)[number];

/** Batas atas satu nominal: Rp 1 triliun. */
export const MAX_AMOUNT = 1_000_000_000_000;

export const BUDGET_WARNING_RATIO = 0.8;

/** Kunci feature flag untuk fase berikutnya. Semua nonaktif di Fase 0. */
export const FEATURE_FLAGS = {
  RECURRING_TRANSACTIONS: 'recurring_transactions',
  REMINDERS: 'reminders',
  TEMPLATES: 'templates',
  CSV_IMPORT: 'csv_import',
  PWA_OFFLINE: 'pwa_offline',
} as const;
export type FeatureFlagKey = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

/** Ikon kategori yang tersedia (nama ikon lucide, kebab-case). */
export const CATEGORY_ICONS = [
  'utensils',
  'car',
  'shopping-bag',
  'receipt',
  'clapperboard',
  'heart-pulse',
  'graduation-cap',
  'banknote',
  'circle-ellipsis',
  'coffee',
  'home',
  'gift',
  'plane',
  'smartphone',
  'shirt',
  'baby',
  'dumbbell',
  'paw-print',
  'piggy-bank',
  'briefcase',
  'trending-up',
  'zap',
  'fuel',
  'book-open',
] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];
