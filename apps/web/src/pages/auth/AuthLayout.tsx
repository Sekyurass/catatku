import type { ReactNode } from 'react';
import { Logo } from '../../components/Logo';

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
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo />
          <p className="text-sm text-muted">Catat keuangan dalam hitungan detik.</p>
        </div>
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <h1 className="text-2xl font-bold text-fg">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-muted">{subtitle}</p>
          {children}
        </div>
        <p className="mt-6 text-center text-sm text-muted">{footer}</p>
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
