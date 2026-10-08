import {
  House,
  ListOrdered,
  Loader2,
  LogOut,
  type LucideIcon,
  PiggyBank,
  Plus,
  UserRound,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Logo } from '../components/Logo';
import {
  NotificationCenterProvider,
  SideBell,
  useNotificationCenter,
} from '../components/notifications/NotificationCenter';
import { usePlanTabs } from '../components/plan/PlanHeader';
import { QuickAddProvider, useQuickAdd } from '../components/transactions/QuickAdd';
import { Button } from '../components/ui/Button';
import { PageSkeleton } from '../components/ui/States';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/cn';
import { prefetchPageData } from '../lib/queries';
import { preloadAppPages, whenIdle } from '../routes/pages';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Beranda', icon: House, end: true },
  { to: '/transaksi', label: 'Transaksi', icon: ListOrdered, end: false },
  { to: '/anggaran', label: 'Anggaran', icon: PiggyBank, end: false },
  { to: '/profil', label: 'Profil', icon: UserRound, end: false },
];

/** Dengan target tabungan atau utang, menu Anggaran menjadi "Rencana" (sub-tab di /anggaran/*). */
function useNavItems(): readonly NavItem[] {
  const tabs = usePlanTabs();
  if (tabs.length === 1) return NAV_ITEMS;
  return NAV_ITEMS.map((i) => (i.to === '/anggaran' ? { ...i, label: 'Rencana' } : i));
}

export function AppLayout() {
  return (
    <QuickAddProvider>
      <NotificationCenterProvider>
        <Shell />
      </NotificationCenterProvider>
    </QuickAddProvider>
  );
}

/** `?catat=1` (mis. dari notifikasi pengingat) langsung membuka form catat transaksi. */
function useQuickAddDeepLink() {
  const { openNew } = useQuickAdd();
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('catat') !== '1') return;
    openNew();
    const next = new URLSearchParams(params);
    next.delete('catat');
    setParams(next, { replace: true });
  }, [params, setParams, openNew]);
}

/**
 * < md (HP): bottom nav 5 kolom dengan tombol "+" di tengah.
 * md–lg (tablet / HP landscape): rail ikon 80px.
 * ≥ lg (desktop): sidebar penuh 240px. Konten maks 1100px.
 */
/** Menu utama yang datanya diambil saat browser senggang. */
const PREFETCH_PATHS = NAV_ITEMS.map((i) => i.to);

function usePrefetchNav() {
  const qc = useQueryClient();
  useEffect(() => {
    preloadAppPages();
    whenIdle(() => PREFETCH_PATHS.forEach((p) => void prefetchPageData(qc, p)));
  }, [qc]);
  return (path: string) => void prefetchPageData(qc, path);
}

/** Halaman baru masuk dengan pudar-geser singkat; pindah menu (bukan Kembali) mulai dari atas. */
function RouteView() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  useLayoutEffect(() => {
    if (navType !== 'POP') window.scrollTo(0, 0);
  }, [pathname, navType]);
  return (
    <div key={pathname} className="animate-page-in">
      <Outlet />
    </div>
  );
}

function Shell() {
  const { openNew } = useQuickAdd();
  const prefetch = usePrefetchNav();
  const navItems = useNavItems();
  useQuickAddDeepLink();
  return (
    <div
      className={cn(
        'min-h-dvh pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]',
        'md:pl-[calc(5rem+env(safe-area-inset-left))] lg:pl-[calc(15rem+env(safe-area-inset-left))]',
      )}
    >
      <a
        href="#konten"
        className="sr-only z-50 rounded-control bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
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
            {navItems.map((item) => (
              <SideLink key={item.to} item={item} onIntent={prefetch} />
            ))}
          </nav>
          <SideBell />
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
          <RouteView />
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
          {navItems.slice(0, 2).map((item) => (
            <BottomLink key={item.to} item={item} onIntent={prefetch} />
          ))}
          <li className="flex items-start justify-center">
            <button
              type="button"
              onClick={() => openNew()}
              className="-mt-5 flex size-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg ring-4 ring-bg hover:bg-primary-hover active:scale-95"
              aria-label="Catat transaksi"
            >
              <Plus className="size-7" aria-hidden />
            </button>
          </li>
          {navItems.slice(2).map((item) => (
            <BottomLink key={item.to} item={item} onIntent={prefetch} />
          ))}
        </ul>
      </nav>
    </div>
  );
}

type NavLinkProps = { item: NavItem; onIntent: (path: string) => void };

/** Arahkan kursor, fokus, atau sentuh: data halaman tujuan mulai diambil sebelum diklik. */
function intentHandlers(to: string, onIntent: (path: string) => void) {
  const run = () => onIntent(to);
  return { onPointerEnter: run, onFocus: run, onTouchStart: run };
}

function SideLink({ item: { to, label, icon: Icon, end }, onIntent }: NavLinkProps) {
  return (
    <NavLink
      to={to}
      end={end}
      {...intentHandlers(to, onIntent)}
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
          'hover:bg-expense hover:text-on-expense disabled:opacity-60',
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

function BottomLink({ item: { to, label, icon: Icon, end }, onIntent }: NavLinkProps) {
  const { user } = useAuth();
  const { unread } = useNotificationCenter();
  const photoUser = to === '/profil' && user?.avatarUpdatedAt ? user : null;
  // Lonceng ada di Beranda; titik di tab ini memberi tahu ada notifikasi baru dari halaman lain.
  const showDot = to === '/' && unread > 0;
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        {...intentHandlers(to, onIntent)}
        className={({ isActive }) =>
          cn(
            'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium',
            isActive ? 'text-primary' : 'text-muted',
          )
        }
      >
        {({ isActive }) => (
          <>
            {photoUser ? (
              <Avatar
                user={photoUser}
                className={cn(
                  '-my-0.5 size-6 ring-offset-1 ring-offset-surface',
                  isActive ? 'ring-2 ring-primary' : 'ring-1 ring-line',
                )}
              />
            ) : (
              <span className="relative">
                <Icon className="size-5" aria-hidden />
                {showDot && (
                  <span className="absolute -top-0.5 -right-1 size-2.5 rounded-full bg-expense ring-2 ring-surface" />
                )}
              </span>
            )}
            {label}
            {showDot && <span className="sr-only">, ada notifikasi baru</span>}
          </>
        )}
      </NavLink>
    </li>
  );
}
