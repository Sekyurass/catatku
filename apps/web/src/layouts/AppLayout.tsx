import { House, ListOrdered, PiggyBank, Plus, UserRound } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { QuickAddProvider, useQuickAdd } from '../components/transactions/QuickAdd';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/cn';

export const NAV_ITEMS = [
  { to: '/', label: 'Beranda', icon: House, end: true },
  { to: '/transaksi', label: 'Transaksi', icon: ListOrdered, end: false },
  { to: '/anggaran', label: 'Anggaran', icon: PiggyBank, end: false },
  { to: '/profil', label: 'Profil', icon: UserRound, end: false },
] as const;

export function AppLayout() {
  return (
    <QuickAddProvider>
      <Shell />
    </QuickAddProvider>
  );
}

function Shell() {
  const { openNew } = useQuickAdd();
  return (
    <div className="min-h-dvh md:pl-60">
      <a
        href="#konten"
        className="sr-only z-50 rounded-control bg-primary px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Lewati ke konten
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col gap-6 border-r border-line bg-surface p-4 md:flex">
        <Logo className="px-2 pt-2" />
        <Button size="lg" icon={<Plus className="size-5" aria-hidden />} onClick={() => openNew()}>
          Catat transaksi
        </Button>
        <nav aria-label="Navigasi utama" className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium',
                  isActive
                    ? 'bg-primary-soft text-primary'
                    : 'text-muted hover:bg-surface-muted hover:text-fg',
                )
              }
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main
        id="konten"
        className="mx-auto w-full max-w-[1100px] px-4 pt-4 pb-28 md:px-8 md:pt-8 md:pb-10"
      >
        <Outlet />
      </main>

      <button
        type="button"
        onClick={() => openNew()}
        className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary-hover md:hidden"
        aria-label="Catat transaksi"
      >
        <Plus className="size-7" aria-hidden />
      </button>

      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-4">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                    isActive ? 'text-primary' : 'text-muted',
                  )
                }
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
