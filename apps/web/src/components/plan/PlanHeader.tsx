import { FEATURE_FLAGS } from '@catatku/shared';
import { Goal, HandCoins, PiggyBank } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { useFeature } from '../../lib/features';

const BUDGET_TAB = { to: '/anggaran', label: 'Anggaran', icon: PiggyBank };
const GOALS_TAB = { to: '/anggaran/target', label: 'Target', icon: Goal };
const DEBTS_TAB = { to: '/anggaran/utang', label: 'Utang', icon: HandCoins };

/**
 * Sub-tab Rencana yang aktif; hanya Anggaran = tidak perlu header Rencana. Tab halaman yang sedang
 * dibuka selalu ikut tampil supaya tidak berkedip selama flag dimuat.
 */
export function usePlanTabs() {
  const { pathname } = useLocation();
  const goals = useFeature(FEATURE_FLAGS.SAVINGS_GOALS) || pathname === GOALS_TAB.to;
  const debts = useFeature(FEATURE_FLAGS.DEBTS) || pathname === DEBTS_TAB.to;
  return [BUDGET_TAB, ...(goals ? [GOALS_TAB] : []), ...(debts ? [DEBTS_TAB] : [])];
}

/** Judul tab "Rencana" dengan sub-tab Anggaran | Target | Utang. `action` tampil di kanan judul. */
export function PlanHeader({ action }: { action?: ReactNode }) {
  const tabs = usePlanTabs();
  return (
    <header className="flex flex-col gap-3">
      <div className="flex min-h-[54px] items-center justify-between gap-2">
        <h1 className="min-w-0 truncate text-2xl font-bold">Rencana</h1>
        {action}
      </div>
      <nav aria-label="Bagian rencana">
        <ul
          className={cn(
            'grid gap-1 rounded-control bg-surface-muted p-1',
            tabs.length === 3 ? 'grid-cols-3 md:max-w-md' : 'grid-cols-2 md:max-w-sm',
          )}
        >
          {tabs.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end
                replace
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-2 text-sm font-semibold transition-colors',
                    isActive ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg',
                  )
                }
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
