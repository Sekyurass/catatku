import { AlertCircle, type LucideIcon, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-control bg-surface-muted', className)} aria-hidden />
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-8" aria-hidden />
      </div>
      <div>
        <p className="font-semibold text-fg">{title}</p>
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
