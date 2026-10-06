import { WalletMinimal } from 'lucide-react';
import { cn } from '../lib/cn';

export function Logo({ className, textClassName }: { className?: string; textClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-bold text-fg', className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-primary text-white">
        <WalletMinimal className="size-5" aria-hidden />
      </span>
      <span className={cn('text-xl', textClassName)}>Catatku</span>
    </span>
  );
}
