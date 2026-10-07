import { AlertCircle, type LucideIcon, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-control bg-surface-muted', className)} aria-hidden />
  );
}

/** Placeholder halaman selama chunk rute diunduh. */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Memuat halaman">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-28" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  titleAs: Title = 'p',
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  /** Pakai 'h1' bila state ini satu-satunya isi halaman. */
  titleAs?: 'p' | 'h1' | 'h2';
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-8" aria-hidden />
      </div>
      <div>
        <Title className="font-semibold text-fg">{title}</Title>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  message = 'Data belum bisa dimuat.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center" role="alert">
      <AlertCircle className="size-8 text-expense" aria-hidden />
      <p className="text-sm text-muted">{message}</p>
      {onRetry && (
        <Button
          variant="secondary"
          onClick={onRetry}
          icon={<RefreshCw className="size-4" aria-hidden />}
        >
          Coba lagi
        </Button>
      )}
    </div>
  );
}
