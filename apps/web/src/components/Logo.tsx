import { WalletMinimal } from 'lucide-react';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold text-fg ${className}`}>
      <span className="flex size-9 items-center justify-center rounded-control bg-primary text-white">
        <WalletMinimal className="size-5" aria-hidden />
      </span>
      <span className="text-xl">Catatku</span>
    </span>
  );
}
