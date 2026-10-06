import { type ComponentType, lazy } from 'react';

type Loader = () => Promise<ComponentType>;

/** Satu chunk per halaman; loader disimpan agar bisa dipanaskan sebelum dibuka. */
function page(load: Loader) {
  return Object.assign(
    lazy(async () => ({ default: await load() })),
    { preload: load },
  );
}

export const LoginPage = page(() => import('../pages/auth/LoginPage').then((m) => m.LoginPage));
export const RegisterPage = page(() =>
  import('../pages/auth/RegisterPage').then((m) => m.RegisterPage),
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
export const ProfilePage = page(() => import('../pages/ProfilePage').then((m) => m.ProfilePage));
export const NotFoundPage = page(() => import('../pages/NotFoundPage').then((m) => m.NotFoundPage));

const APP_PAGES = [
  HomePage,
  TransactionsPage,
  BudgetsPage,
  WalletsPage,
  CategoriesPage,
  ProfilePage,
  // Sesi bisa berakhir kapan saja (kedaluwarsa); halaman masuk sudah siap tanpa layar memuat.
  LoginPage,
];

/** Unduh chunk halaman aplikasi saat browser senggang supaya pindah menu tidak menunggu jaringan. */
export function preloadAppPages() {
  const run = () => APP_PAGES.forEach((p) => void p.preload().catch(() => undefined));
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}
