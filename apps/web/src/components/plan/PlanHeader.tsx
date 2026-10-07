import { Goal, PiggyBank } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn';

const TABS = [
  { to: '/anggaran', label: 'Anggaran', icon: PiggyBank },
  { to: '/anggaran/target', label: 'Target', icon: Goal },
] as const;

/** Judul tab "Rencana" dengan sub-tab Anggaran | Target. `action` tampil di kanan judul. */
export function PlanHeader({ action }: { action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Rencana</h1>
        {action}
      </div>
      <nav aria-label="Bagian rencana">
        <ul className="grid grid-cols-2 gap-1 rounded-control bg-surface-muted p-1 md:max-w-sm">
          {TABS.map(({ to, label, icon: Icon }) => (
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
