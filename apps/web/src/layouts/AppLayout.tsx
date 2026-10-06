import { House, ListOrdered, Loader2, LogOut, PiggyBank, Plus, UserRound } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Logo } from '../components/Logo';
import { QuickAddProvider, useQuickAdd } from '../components/transactions/QuickAdd';
import { Button } from '../components/ui/Button';
import { PageSkeleton } from '../components/ui/States';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/cn';
import { preloadAppPages } from '../routes/pages';

export const NAV_ITEMS = [
  { to: '/', label: 'Beranda', icon: House, end: true },
  { to: '/transaksi', label: 'Transaksi', icon: ListOrdered, end: false },
  { to: '/anggaran', label: 'Anggaran', icon: PiggyBank, end: false },
  { to: '/profil', label: 'Profil', icon: UserRound, end: false },
] as const;

type NavItem = (typeof NAV_ITEMS)[number];

export function AppLayout() {
  return (
    <QuickAddProvider>
      <Shell />
    </QuickAddProvider>
  );
}

/**
 * < md (HP): bottom nav 5 kolom dengan tombol "+" di tengah.
 * md–lg (tablet / HP landscape): rail ikon 80px.
 * ≥ lg (desktop): sidebar penuh 240px. Konten maks 1100px.
 */
function Shell() {
  const { openNew } = useQuickAdd();
  useEffect(preloadAppPages, []);
  return (
    <div
      className={cn(
        'min-h-dvh pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]',
        'md:pl-[calc(5rem+env(safe-area-inset-left))] lg:pl-[calc(15rem+env(safe-area-inset-left))]',
      )}
    >
      <a
        href="#konten"
        className="sr-only z-50 rounded-control bg-primary px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Lewati ke konten
      </a>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden border-r border-line bg-surface pl-[env(safe-area-inset-left)] md:block',
          'md:w-[calc(5rem+env(safe-area-inset-left))] lg:w-[calc(15rem+env(safe-area-inset-left))]',
        )}
      >
        <div className="flex h-full flex-col gap-6 overflow-y-auto px-3 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 lg:px-4">
          <Logo
            className="justify-center lg:justify-start lg:px-2"
            textClassName="max-lg:sr-only"
          />
          <Button
            size="lg"
            icon={<Plus className="size-5" aria-hidden />}
            onClick={() => openNew()}
            title="Catat transaksi"
            className="max-lg:mx-auto max-lg:size-12 max-lg:px-0"
          >
            <span className="max-lg:sr-only">Catat transaksi</span>
          </Button>
          <nav aria-label="Navigasi utama" className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <SideLink key={item.to} item={item} />
            ))}
          </nav>
          <SideLogout />
        </div>
      </aside>

      <main
        id="konten"
        className={cn(
          'mx-auto w-full max-w-[1100px] px-4 sm:px-6 md:px-8',
          'pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(6.5rem+env(safe-area-inset-bottom))]',
          'md:pt-[calc(2rem+env(safe-area-inset-top))] md:pb-10',
        )}
      >
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>

      <nav
        aria-label="Navigasi utama"
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden',
          'pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]',
        )}
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {NAV_ITEMS.slice(0, 2).map((item) => (
            <BottomLink key={item.to} item={item} />
          ))}
          <li className="flex items-start justify-center">
            <button
              type="button"
              onClick={() => openNew()}
              className="-mt-5 flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-lg ring-4 ring-bg hover:bg-primary-hover active:scale-95"
              aria-label="Catat transaksi"
            >
              <Plus className="size-7" aria-hidden />
            </button>
          </li>
          {NAV_ITEMS.slice(2).map((item) => (
            <BottomLink key={item.to} item={item} />
          ))}
        </ul>
      </nav>
    </div>
  );
}

function SideLink({ item: { to, label, icon: Icon, end } }: { item: NavItem }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex min-h-11 flex-col items-center justify-center gap-1 rounded-control px-1 py-2 text-[11px] font-medium',
          'lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:py-0 lg:text-sm',
          isActive
            ? 'bg-primary-soft text-primary'
            : 'text-muted hover:bg-surface-muted hover:text-fg',
        )
      }
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      {label}
    </NavLink>
  );
}

function SideLogout() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
      {user && (
        <div className="hidden min-w-0 items-center gap-3 px-3 lg:flex">
          <Avatar user={user} className="size-9 text-sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
        </div>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await logout();
        }}
        className={cn(
          'flex min-h-11 flex-col items-center justify-center gap-1 rounded-control px-1 py-2 text-[11px] font-semibold text-expense-text transition-colors',
          'lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:py-0 lg:text-sm',
          'hover:bg-expense hover:text-white disabled:opacity-60',
        )}
      >
        {busy ? (
          <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden />
        ) : (
          <LogOut className="size-5 shrink-0" aria-hidden />
        )}
        Keluar
      </button>
    </div>
  );
}

function BottomLink({ item: { to, label, icon: Icon, end } }: { item: NavItem }) {
  return (
    <li>
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
  );
}
