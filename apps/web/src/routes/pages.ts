import { type ComponentType, lazy } from 'react';

type Loader = () => Promise<ComponentType>;

/** Satu chunk per halaman; loader disimpan agar bisa dipanaskan sebelum dibuka. */
function page(load: Loader) {
  return Object.assign(
    lazy(async () => ({ default: await load() })),
    { preload: load },
  );
}

/** Masuk dan Daftar satu halaman (satu chunk) agar perpindahannya bisa dianimasikan bersambung. */
export const AuthPage = page(() => import('../pages/auth/AuthPage').then((m) => m.AuthPage));
export const ForgotPasswordPage = page(() =>
  import('../pages/auth/ForgotPasswordPage').then((m) => m.ForgotPasswordPage),
);
export const ResetPasswordPage = page(() =>
  import('../pages/auth/ResetPasswordPage').then((m) => m.ResetPasswordPage),
);
export const OnboardingPage = page(() =>
  import('../pages/OnboardingPage').then((m) => m.OnboardingPage),
);
export const HomePage = page(() => import('../pages/HomePage').then((m) => m.HomePage));
export const TransactionsPage = page(() =>
  import('../pages/TransactionsPage').then((m) => m.TransactionsPage),
);
export const BudgetsPage = page(() => import('../pages/BudgetsPage').then((m) => m.BudgetsPage));
export const WalletsPage = page(() => import('../pages/WalletsPage').then((m) => m.WalletsPage));
export const CategoriesPage = page(() =>
  import('../pages/CategoriesPage').then((m) => m.CategoriesPage),
);
export const RecurringPage = page(() =>
  import('../pages/RecurringPage').then((m) => m.RecurringPage),
);
export const TemplatesPage = page(() =>
  import('../pages/TemplatesPage').then((m) => m.TemplatesPage),
);
export const TagsPage = page(() => import('../pages/TagsPage').then((m) => m.TagsPage));
/** Jarang dibuka, jadi tidak ikut diunduh di muka. */
export const ImportPage = page(() => import('../pages/ImportPage').then((m) => m.ImportPage));
export const NotificationSettingsPage = page(() =>
  import('../pages/NotificationSettingsPage').then((m) => m.NotificationSettingsPage),
);
export const ProfilePage = page(() => import('../pages/ProfilePage').then((m) => m.ProfilePage));
export const NotFoundPage = page(() => import('../pages/NotFoundPage').then((m) => m.NotFoundPage));

const APP_PAGES = [
  HomePage,
  TransactionsPage,
  BudgetsPage,
  WalletsPage,
  CategoriesPage,
  RecurringPage,
  TemplatesPage,
  NotificationSettingsPage,
  ProfilePage,
  // Sesi bisa berakhir kapan saja (kedaluwarsa); halaman masuk sudah siap tanpa layar memuat.
  AuthPage,
];

export function whenIdle(run: () => void) {
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}

/** Unduh chunk halaman aplikasi saat browser senggang supaya pindah menu tidak menunggu jaringan. */
export function preloadAppPages() {
  whenIdle(() => APP_PAGES.forEach((p) => void p.preload().catch(() => undefined)));
}
