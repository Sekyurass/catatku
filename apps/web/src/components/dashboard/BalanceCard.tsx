import { formatRupiah } from '@catatku/shared';
import { ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { type KeyboardEvent, useId } from 'react';
import { Link } from 'react-router-dom';
import { HIDDEN_AMOUNT, setBalanceHidden, useBalanceHidden } from '../../lib/balanceVisibility';
import { cn } from '../../lib/cn';
import { useWallets } from '../../lib/queries';
import { Card } from '../ui/Card';
import { ColorDot } from '../ui/Select';
import { usePopover } from '../ui/usePopover';

/** Kartu Total saldo: bisa disembunyikan, dan saldo per dompet dibuka lewat dropdown. */
export function BalanceCard({ totalBalance, net }: { totalBalance: number; net: number }) {
  const hidden = useBalanceHidden();
  const wallets = useWallets();
  const panelId = useId();
  const { open, setOpen, anchorRef, popupRef, style } = usePopover<HTMLButtonElement>({
    align: 'end',
  });
  const active = (wallets.data ?? []).filter((w) => !w.archivedAt);
  const money = (n: number, signed = false) =>
    hidden ? HIDDEN_AMOUNT : formatRupiah(n, { signed });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !open) return;
    e.stopPropagation();
    setOpen(false);
    anchorRef.current?.focus();
  };

  return (
    <Card className="col-span-2 flex flex-col justify-between gap-3 border-none bg-brand text-white">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-sm text-white/90">
            Total saldo
            <button
              type="button"
              onClick={() => setBalanceHidden(!hidden)}
              aria-label={hidden ? 'Tampilkan saldo' : 'Sembunyikan saldo'}
              aria-pressed={hidden}
              className="-my-3 inline-flex size-11 items-center justify-center rounded-full text-white/90 hover:bg-white/10 hover:text-white focus-visible:outline-white"
            >
              {hidden ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </button>
          </p>
          <p className="tabular truncate text-3xl font-bold">{money(totalBalance)}</p>
        </div>
        <div className="relative shrink-0" onKeyDown={onKeyDown}>
          <button
            ref={anchorRef}
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-haspopup="dialog"
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white/15 py-2 pr-3 pl-4 text-sm font-semibold text-white transition-colors hover:bg-white/25 focus-visible:outline-white',
              open && 'bg-white/25',
            )}
          >
            Dompet
            <ChevronDown
              className={cn('size-4 transition-transform duration-200', open && 'rotate-180')}
              aria-hidden
            />
          </button>
          {open && (
            <div
              ref={popupRef}
              id={panelId}
              role="dialog"
              aria-label="Saldo per dompet"
              style={style}
              className="z-50 flex w-72 max-w-[calc(100vw-1rem)] origin-top-right animate-pop-in flex-col overflow-hidden rounded-card border border-line bg-surface text-fg shadow-lg"
            >
              <p className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">
                Saldo per dompet
              </p>
              <ul className="overflow-y-auto overscroll-contain px-2">
                {active.map((w) => (
                  <li
                    key={w.id}
                    className="flex min-h-11 items-center gap-3 rounded-control px-2 text-sm"
                  >
                    <ColorDot color={w.color} />
                    <span className="min-w-0 flex-1 truncate">{w.name}</span>
                    <span className="tabular font-semibold">{money(w.balance)}</span>
                  </li>
                ))}
                {wallets.isPending && <li className="px-2 py-3 text-sm text-muted">Memuat…</li>}
              </ul>
              <Link
                to="/dompet"
                className="mt-1 flex min-h-11 items-center justify-between border-t border-line px-4 text-sm font-semibold text-primary hover:bg-primary-soft"
              >
                Kelola dompet
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </div>
          )}
        </div>
      </div>

      <p className="text-sm text-white/90">
        Selisih bulan ini{' '}
        <span className="tabular font-semibold text-white">{money(net, true)}</span>
      </p>
    </Card>
  );
}
