import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../lib/auth';

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Memuat">
      <Logo className="animate-pulse" />
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'anonymous') {
    return <Navigate to="/masuk" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }
  return children;
}
