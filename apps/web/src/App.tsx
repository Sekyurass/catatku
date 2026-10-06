import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { BudgetsPage } from './pages/BudgetsPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfilePage } from './pages/ProfilePage';
import { TransactionsPage } from './pages/TransactionsPage';
import { WalletsPage } from './pages/WalletsPage';
import { GuestOnly, RequireAuth } from './routes/guards';

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
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="transaksi" element={<TransactionsPage />} />
        <Route path="anggaran" element={<BudgetsPage />} />
        <Route path="dompet" element={<WalletsPage />} />
        <Route path="kategori" element={<CategoriesPage />} />
        <Route path="profil" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
