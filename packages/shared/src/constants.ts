export const WALLET_TYPES = ['CASH', 'BANK', 'EWALLET'] as const;
export type WalletType = (typeof WALLET_TYPES)[number];

export const CATEGORY_TYPES = ['INCOME', 'EXPENSE'] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export const TRANSACTION_TYPES = ['INCOME', 'EXPENSE', 'TRANSFER'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const RECURRENCE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const PLANS = ['FREE', 'PREMIUM'] as const;
export type Plan = (typeof PLANS)[number];

/** Batas atas satu nominal: Rp 1 triliun. */
export const MAX_AMOUNT = 1_000_000_000_000;

export const BUDGET_WARNING_RATIO = 0.8;

/** Umur default tautan lupa kata sandi (bisa diubah server lewat RESET_TOKEN_TTL_MINUTES). */
export const RESET_LINK_TTL_MINUTES = 30;
/** Jeda minimal antar-permintaan email reset untuk satu akun. */
export const RESET_RESEND_COOLDOWN_SECONDS = 60;

/** Foto profil dikompres di browser; server tetap menolak yang lebih besar dari ini. */
export const AVATAR_MAX_BYTES = 300_000;
export const AVATAR_MIME_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;
export type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[number];

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
