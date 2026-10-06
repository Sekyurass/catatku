import type { ReactNode } from 'react';

export function AuthPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-fg">{title}</h1>
      <p className="mt-2 mb-8 text-base text-muted">{subtitle}</p>
      {children}
    </>
  );
}
