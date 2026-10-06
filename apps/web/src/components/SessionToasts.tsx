import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { ToastProvider } from './ui/Toast';

/** Toast milik pengguna sebelumnya (termasuk aksi "Urungkan") dibuang saat sesi berganti. */
export function SessionToasts({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <ToastProvider resetKey={user?.id ?? 'tamu'}>{children}</ToastProvider>;
}
