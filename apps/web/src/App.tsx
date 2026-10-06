import { Suspense } from 'react';
import { Outlet, Route, Routes } from 'react-router-dom';
import { SplashScreen } from './components/SplashScreen';
import { AppLayout } from './layouts/AppLayout';
import { GuestOnly, RequireAuth } from './routes/guards';
import {
  BudgetsPage,
  CategoriesPage,
  ForgotPasswordPage,
  HomePage,
  LoginPage,
  NotFoundPage,
  OnboardingPage,
  ProfilePage,
  RegisterPage,
  ResetPasswordPage,
  TransactionsPage,
  WalletsPage,
} from './routes/pages';

export function App() {
  return (
    <Routes>
      <Route
        path="/masuk"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/daftar"
        element={
          <GuestOnly afterAuth="/mulai">
            <RegisterPage />
          </GuestOnly>
        }
      />
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
      {/* Satu RequireAuth untuk semua rute privat agar intro logo tidak diputar ulang antar-rute. */}
      <Route
        element={
          <RequireAuth>
            <Outlet />
          </RequireAuth>
        }
      >
        <Route path="/mulai" element={<OnboardingPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="transaksi" element={<TransactionsPage />} />
          <Route path="anggaran" element={<BudgetsPage />} />
          <Route path="dompet" element={<WalletsPage />} />
          <Route path="kategori" element={<CategoriesPage />} />
          <Route path="profil" element={<ProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
