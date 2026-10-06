import { type ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Logo } from '../../components/Logo';
import { cn } from '../../lib/cn';
import { ForgotPasswordPage, LoginPage, RegisterPage } from '../../routes/pages';
import { AuthShowcase } from './AuthShowcase';

/**
 * Halaman Masuk adalah titik awal: halaman lain (Daftar, Lupa kata sandi) datang dari kanan,
 * kembali ke Masuk datang dari kiri. Kunjungan pertama (tanpa navigasi sebelumnya) cukup memudar.
 */
function enterAnimation(pathname: string, key: string) {
  if (key === 'default') return 'animate-fade-in';
  return pathname === '/masuk' ? 'animate-auth-from-left' : 'animate-auth-from-right';
}

function showcaseVariant(pathname: string) {
  if (pathname === '/daftar') return 'register';
  if (pathname === '/masuk') return 'login';
  return 'recover';
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

  // Halaman tetangga dipanaskan agar berpindah di antaranya tidak menampilkan layar memuat.
  useEffect(() => {
    for (const p of [LoginPage, RegisterPage, ForgotPasswordPage]) {
      void p.preload().catch(() => undefined);
    }
  }, []);

  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-4 lg:bg-bg lg:p-4">
      <main className="flex min-h-dvh flex-col overflow-x-hidden px-5 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-6 sm:px-10 lg:min-h-0 lg:rounded-[28px] lg:bg-surface lg:px-14 lg:shadow-card">
        <Logo className="self-center lg:self-start" />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <div className={animation}>
            <h1 className="text-3xl font-bold tracking-tight text-fg">{title}</h1>
            <p className="mt-2 mb-8 text-base text-muted">{subtitle}</p>
            {children}
          </div>
        </div>
        <p className={cn('text-center text-sm text-muted', animation)}>{footer}</p>
      </main>
      <AuthShowcase variant={showcaseVariant(pathname)} animate={key === 'default'} />
    </div>
  );
}

export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-control bg-expense-soft px-3 py-2 text-sm text-expense-text" role="alert">
      {message}
    </p>
  );
}
