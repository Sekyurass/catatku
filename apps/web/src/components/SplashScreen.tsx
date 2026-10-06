import { WalletMinimal } from 'lucide-react';
import { cn } from '../lib/cn';

export const SPLASH_FADE_MS = 400;
/** Lama layar "Sampai jumpa" tampil sebelum memudar, selaras dengan animasi bar-nya. */
export const FAREWELL_MS = 1400;

/**
 * `intro`: muncul seketika (menutup layar kosong saat memuat).
 * `farewell`: memudar masuk di atas aplikasi saat keluar; bar memendek kanan → kiri,
 * kebalikan dari bar intro yang mengisi kiri → kanan.
 */
export function SplashScreen({
  leaving = false,
  progress = true,
  farewell,
}: {
  leaving?: boolean;
  progress?: boolean;
  /** Teks perpisahan; bila diisi, splash tampil sebagai layar keluar. */
  farewell?: string;
}) {
  return (
    <div
      role="status"
      aria-label={farewell ?? 'Memuat Catatku'}
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-bg transition-opacity duration-400 ease-out',
        farewell && 'animate-appear',
        leaving && 'pointer-events-none opacity-0',
      )}
    >
      <span className="inline-flex items-center gap-3 font-bold text-fg">
        <span className="flex size-14 animate-splash-pop items-center justify-center rounded-card bg-primary text-on-primary shadow-lg shadow-primary/30">
          <WalletMinimal className="size-8" aria-hidden />
        </span>
        <span className="animate-splash-text text-3xl">Catatku</span>
      </span>
      {farewell && (
        <p className="-mt-2 animate-splash-text text-base text-muted" aria-hidden>
          {farewell}
        </p>
      )}
      {progress && (
        <span className="h-1 w-32 overflow-hidden rounded-full bg-primary-soft" aria-hidden>
          <span
            className={cn(
              'block h-full rounded-full bg-primary',
              'origin-left',
              farewell ? 'animate-splash-bar-out' : 'animate-splash-bar',
            )}
          />
        </span>
      )}
    </div>
  );
}
