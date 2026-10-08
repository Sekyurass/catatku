import { Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { PageMeta } from './components/PageMeta';
import { SplashScreen } from './components/SplashScreen';
import { AppLayout } from './layouts/AppLayout';
import { PrivacyGate } from './pages/privacy/PrivacyGate';
import { GuestOnly, RequireAuth } from './routes/guards';
import {
  AuthPage,
  BankEmailPage,
  BudgetsPage,
  DebtsPage,
  GoalsPage,
  CategoriesPage,
  ForgotPasswordPage,
  HomePage,
  ImportPage,
  NotFoundPage,
  NotificationSettingsPage,
  OnboardingPage,
  PrivacyPolicyPage,
  ProfilePage,
  RecurringPage,
  ReportsPage,
  TagsPage,
  TemplatesPage,
  ResetPasswordPage,
  TransactionsPage,
  WalletsPage,
} from './routes/pages';

function GuestAuthPage() {
  const { pathname } = useLocation();
  return (
    <GuestOnly afterAuth={pathname === '/daftar' ? '/mulai' : undefined}>
      <AuthPage />
    </GuestOnly>
  );
}

/** Tautan lama (notifikasi yang sudah terkirim) memakai /utang?debt=id. */
function LegacyDebtsRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/anggaran/utang${search}`} replace />;
}

export function App() {
  return (
    <>
      <PageMeta />
      <Routes>
        {/* Satu elemen untuk kedua rute agar halaman tidak dipasang ulang saat berpindah tab. */}
        <Route element={<GuestAuthPage />}>
          <Route path="/masuk" element={null} />
          <Route path="/daftar" element={null} />
        </Route>
        <Route
          path="/lupa-kata-sandi"
          element={
            <GuestOnly>
              <ForgotPasswordPage />
            </GuestOnly>
          }
        />
        {/* Bukan GuestOnly: tautan dari email harus tetap bisa dipakai walau perangkat ini sedang masuk. */}
        <Route
          path="/atur-ulang-kata-sandi"
          element={
            <Suspense fallback={<SplashScreen progress={false} />}>
              <ResetPasswordPage />
            </Suspense>
          }
        />
        <Route
          path="/privasi"
          element={
            <Suspense fallback={<SplashScreen progress={false} />}>
              <PrivacyPolicyPage />
            </Suspense>
          }
        />
        {/* Satu RequireAuth untuk semua rute privat agar intro logo tidak diputar ulang antar-rute. */}
        <Route
          element={
            <RequireAuth>
              <PrivacyGate>
                <Outlet />
              </PrivacyGate>
            </RequireAuth>
          }
        >
          <Route path="/mulai" element={<OnboardingPage />} />
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="transaksi" element={<TransactionsPage />} />
            <Route path="anggaran" element={<BudgetsPage />} />
            <Route path="anggaran/target" element={<GoalsPage />} />
            <Route path="anggaran/utang" element={<DebtsPage />} />
            <Route path="utang" element={<LegacyDebtsRedirect />} />
            <Route path="dompet" element={<WalletsPage />} />
            <Route path="kategori" element={<CategoriesPage />} />
            <Route path="berulang" element={<RecurringPage />} />
            <Route path="template" element={<TemplatesPage />} />
            <Route path="tag" element={<TagsPage />} />
            <Route path="laporan" element={<ReportsPage />} />
            <Route path="impor" element={<ImportPage />} />
            <Route path="email-bank" element={<BankEmailPage />} />
            <Route path="pengingat" element={<NotificationSettingsPage />} />
            <Route path="profil" element={<ProfilePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </>
  );
}
