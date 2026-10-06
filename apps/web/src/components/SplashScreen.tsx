import { WalletMinimal } from 'lucide-react';
import { cn } from '../lib/cn';

export const SPLASH_FADE_MS = 400;

export function SplashScreen({
  leaving = false,
  progress = true,
}: {
  leaving?: boolean;
  progress?: boolean;
}) {
  return (
    <div
      role="status"
      aria-label="Memuat Catatku"
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-bg transition-opacity duration-400 ease-out',
        leaving && 'pointer-events-none opacity-0',
      )}
    >
      <span className="inline-flex items-center gap-3 font-bold text-fg">
        <span className="flex size-14 animate-splash-pop items-center justify-center rounded-card bg-primary text-white shadow-lg shadow-primary/30">
          <WalletMinimal className="size-8" aria-hidden />
        </span>
        <span className="animate-splash-text text-3xl">Catatku</span>
      </span>
      {progress && (
        <span className="h-1 w-32 overflow-hidden rounded-full bg-primary-soft" aria-hidden>
          <span className="block h-full origin-left animate-splash-bar rounded-full bg-primary" />
        </span>
      )}
    </div>
  );
}
