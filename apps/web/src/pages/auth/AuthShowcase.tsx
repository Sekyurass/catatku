import { formatRupiah } from '@catatku/shared';
import { Banknote, Bus, Plus, Utensils } from 'lucide-react';
import type { CSSProperties } from 'react';
import { IconBadge } from '../../components/IconBadge';
import { cn } from '../../lib/cn';

const COPY = {
  login: {
    title: 'Tahu ke mana uangmu pergi.',
    body: 'Lanjutkan mencatat pemasukan dan pengeluaran, pantau anggaran, dan lihat laporan bulananmu.',
  },
  register: {
    title: 'Mulai rapikan keuanganmu hari ini.',
    body: 'Gratis dan tanpa iklan. Catat transaksi pertama dalam hitungan detik, langsung dari HP.',
  },
} as const;

const TRANSACTIONS = [
  { icon: Utensils, color: '#EA580C', name: 'Makan siang', meta: 'GoPay', amount: -25_000 },
  { icon: Bus, color: '#2563EB', name: 'Transport', meta: 'Tunai', amount: -15_000 },
  { icon: Banknote, color: '#16A34A', name: 'Gaji', meta: 'BCA', amount: 8_500_000 },
];

const WALLETS = [
  { name: 'BCA', color: '#2563EB' },
  { name: 'Tunai', color: '#0F766E' },
  { name: 'GoPay', color: '#16A34A' },
];

/** Muncul berurutan hanya saat halaman pertama kali dibuka, bukan setiap pindah Masuk ↔ Daftar. */
function enter(animate: boolean, delayMs: number): { className?: string; style?: CSSProperties } {
  if (!animate) return {};
  return {
    className: 'motion-safe:animate-fade-in motion-safe:[animation-fill-mode:both]',
    style: { animationDelay: `${delayMs}ms` },
  };
}

/** Panel ilustrasi di layar lebar: cuplikan aplikasi dari HTML, dekoratif untuk pembaca layar. */
export function AuthShowcase({
  variant,
  animate,
}: {
  variant: 'login' | 'register';
  animate: boolean;
}) {
  const copy = COPY[variant];
  const main = enter(animate, 100);
  const budget = enter(animate, 250);
  const chip = enter(animate, 400);

  return (
    <aside
      aria-hidden
      className="relative hidden overflow-hidden rounded-[28px] bg-linear-to-br from-brand to-brand-hover text-white lg:flex lg:flex-col"
    >
      <div className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-accent/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-accent/25 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative flex flex-1 items-center justify-center px-10 pt-12">
        <div className="relative w-full max-w-[22rem]">
          <div
            className={cn(
              'rounded-3xl bg-surface p-5 text-fg shadow-2xl shadow-black/20',
              main.className,
            )}
            style={main.style}
          >
            <p className="text-sm text-muted">Saldo total</p>
            <p className="mt-0.5 text-3xl font-bold tracking-tight tabular">
              {formatRupiah(9_879_000)}
            </p>
            <div className="mt-3 flex gap-2">
              {WALLETS.map((w) => (
                <span
                  key={w.name}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium"
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: w.color }} />
                  {w.name}
                </span>
              ))}
            </div>
            <p className="mt-5 mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
              Hari ini
            </p>
            <ul className="flex flex-col gap-3">
              {TRANSACTIONS.map((t) => (
                <li key={t.name} className="flex items-center gap-3">
                  <IconBadge icon={t.icon} color={t.color} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{t.name}</span>
                    <span className="block text-xs text-muted">{t.meta}</span>
                  </span>
                  <span
                    className={cn(
                      'text-sm font-semibold tabular',
                      t.amount > 0 ? 'text-income-text' : 'text-fg',
                    )}
                  >
                    {t.amount > 0 ? '+' : '−'}
                    {formatRupiah(Math.abs(t.amount))}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className={cn(
              'absolute -top-20 -right-14 w-52 rotate-3 rounded-2xl bg-surface p-4 text-fg shadow-xl shadow-black/20',
              budget.className,
            )}
            style={budget.style}
          >
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">Anggaran Makan</span>
              <span className="font-semibold text-warning-text tabular">72%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full w-[72%] rounded-full bg-warning" />
            </div>
            <p className="mt-2 text-xs text-muted">Sisa {formatRupiah(280_000)}</p>
          </div>

          <div
            className={cn(
              'absolute -bottom-12 -left-12 flex -rotate-2 items-center gap-2 rounded-full bg-surface py-2 pr-4 pl-2 text-sm font-semibold text-fg shadow-xl shadow-black/20',
              chip.className,
            )}
            style={chip.style}
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-on-primary">
              <Plus className="size-4" />
            </span>
            Catat dalam 5 detik
          </div>
        </div>
      </div>

      <div className="relative px-12 pt-14 pb-12">
        <p className="text-3xl leading-tight font-bold">{copy.title}</p>
        <p className="mt-3 max-w-md text-base text-white/90">{copy.body}</p>
      </div>
    </aside>
  );
}
