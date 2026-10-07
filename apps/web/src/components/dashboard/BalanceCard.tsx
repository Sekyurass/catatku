import { formatRupiah } from '@catatku/shared';
import { ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { HIDDEN_AMOUNT, setBalanceHidden, useBalanceHidden } from '../../lib/balanceVisibility';
import { cn } from '../../lib/cn';
import { useWallets } from '../../lib/queries';
import { AutoHeight } from '../ui/AutoHeight';
import { Card } from '../ui/Card';

const whiteButton =
  'inline-flex min-h-11 shrink-0 items-center gap-1 rounded-control px-2 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-white';

/** Kartu Total saldo: bisa disembunyikan, dan rincian saldo per dompet dibuka di tempat. */
export function BalanceCard({ totalBalance, net }: { totalBalance: number; net: number }) {
  const hidden = useBalanceHidden();
  const [open, setOpen] = useState(false);
  const wallets = useWallets();
  const listId = useId();
  const active = (wallets.data ?? []).filter((w) => !w.archivedAt);
  const money = (n: number, signed = false) =>
    hidden ? HIDDEN_AMOUNT : formatRupiah(n, { signed });

  return (
    <Card className="col-span-2 flex flex-col border-none bg-brand text-white">
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
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={listId}
          className={cn(whiteButton, '-mr-2')}
        >
          Dompet
          <ChevronDown
            className={cn('size-4 transition-transform duration-300', open && 'rotate-180')}
            aria-hidden
          />
        </button>
      </div>

      <AutoHeight>
        <div id={listId}>
          {open && (
            <div className="pt-3">
              <ul className="flex flex-col divide-y divide-white/15 rounded-control bg-white/10 px-3">
                {active.map((w) => (
                  <li key={w.id} className="flex min-h-11 items-center gap-2 py-2 text-sm">
                    <span
                      className="size-3 shrink-0 rounded-full border-2 border-white"
                      style={{ backgroundColor: w.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{w.name}</span>
                    <span className="tabular font-semibold">{money(w.balance)}</span>
                  </li>
                ))}
                {wallets.isPending && (
                  <li className="py-3 text-sm text-white/80">Memuat dompet…</li>
                )}
              </ul>
              <Link to="/dompet" className={cn(whiteButton, 'mt-1 -ml-2')}>
                Kelola dompet
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </div>
          )}
        </div>
      </AutoHeight>

      <p className="mt-3 text-sm text-white/90">
        Selisih bulan ini{' '}
        <span className="tabular font-semibold text-white">{money(net, true)}</span>
      </p>
    </Card>
  );
}
