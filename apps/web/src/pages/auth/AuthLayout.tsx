import { type ReactNode, useEffect } from 'react';
import { Logo } from '../../components/Logo';
import { cn } from '../../lib/cn';
import { AuthPage, ForgotPasswordPage } from '../../routes/pages';
import { AuthPanel } from './AuthPanel';
import { AuthShowcase, type ShowcaseVariant } from './AuthShowcase';
import { useEnterAnimation } from './useEnterAnimation';

/** Kerangka halaman tamu: kolom form + panel ilustrasi di layar lebar. */
export function AuthShell({
  variant,
  animateShowcase,
  children,
}: {
  variant: ShowcaseVariant;
  animateShowcase: boolean;
  children: ReactNode;
}) {
  // Halaman tetangga dipanaskan agar berpindah di antaranya tidak menampilkan layar memuat.
  useEffect(() => {
    for (const p of [AuthPage, ForgotPasswordPage]) {
      void p.preload().catch(() => undefined);
    }
  }, []);

  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-4 lg:bg-bg lg:p-4">
      <main className="flex min-h-dvh flex-col overflow-x-hidden px-5 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-6 sm:px-10 lg:min-h-0 lg:rounded-[28px] lg:bg-surface lg:px-14 lg:shadow-card">
        <Logo className="self-center lg:self-start" />
        {children}
      </main>
      <AuthShowcase variant={variant} animate={animateShowcase} />
    </div>
  );
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
  const { className, firstVisit } = useEnterAnimation();

  return (
    <AuthShell variant="recover" animateShowcase={firstVisit}>
      <div className={cn('mx-auto w-full max-w-sm flex-1 pt-[max(2.5rem,10vh)] pb-10', className)}>
        <AuthPanel title={title} subtitle={subtitle}>
          {children}
        </AuthPanel>
      </div>
      <p className={cn('text-center text-sm text-muted', className)}>{footer}</p>
    </AuthShell>
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
