import { type ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Logo } from '../../components/Logo';
import { cn } from '../../lib/cn';
import { LoginPage, RegisterPage } from '../../routes/pages';

/**
 * Kartu masuk dan daftar bergeser seperti dua langkah berurutan: Daftar datang dari kanan,
 * Masuk dari kiri. Kunjungan pertama (tanpa navigasi sebelumnya) cukup memudar.
 */
function enterAnimation(pathname: string, key: string) {
  if (key === 'default') return 'animate-fade-in';
  return pathname === '/daftar' ? 'animate-auth-from-right' : 'animate-auth-from-left';
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { pathname, key } = useLocation();
  const animation = enterAnimation(pathname, key);

  // Halaman pasangannya dipanaskan agar pindah Masuk ↔ Daftar tidak menampilkan layar memuat.
  useEffect(() => {
    void LoginPage.preload().catch(() => undefined);
    void RegisterPage.preload().catch(() => undefined);
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center overflow-x-hidden px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo />
          <p className="text-sm text-muted">Catat keuangan dalam hitungan detik.</p>
        </div>
        <div
          className={cn('rounded-card border border-line bg-surface p-6 shadow-card', animation)}
        >
          <h1 className="text-2xl font-bold text-fg">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-muted">{subtitle}</p>
          {children}
        </div>
        <p className={cn('mt-6 text-center text-sm text-muted', animation)}>{footer}</p>
      </div>
    </main>
  );
}

export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-control bg-red-50 px-3 py-2 text-sm text-expense-text" role="alert">
      {message}
    </p>
  );
}
