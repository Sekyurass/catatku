import { formatRupiah, type TransactionDTO } from '@catatku/shared';
import { Paperclip, Repeat } from 'lucide-react';
import { cn } from '../../lib/cn';
import { categoryIcon, TransferIcon } from '../../lib/icons';
import { IconBadge } from '../IconBadge';

function describe(tx: TransactionDTO) {
  if (tx.type === 'TRANSFER') {
    const other = tx.counterpartWallet?.name ?? 'dompet lain';
    const route = tx.amount < 0 ? `${tx.wallet.name} → ${other}` : `${other} → ${tx.wallet.name}`;
    return { title: 'Transfer', subtitle: tx.note ? `${route} · ${tx.note}` : route };
  }
  const title = tx.category?.name ?? 'Tanpa kategori';
  return { title, subtitle: tx.note ? `${tx.wallet.name} · ${tx.note}` : tx.wallet.name };
}

export function TransactionRow({
  tx,
  onSelect,
  showTransferSign = false,
}: {
  tx: TransactionDTO;
  onSelect: (tx: TransactionDTO) => void;
  /** Saat difilter per dompet, transfer ditampilkan bertanda sesuai arah uang di dompet itu. */
  showTransferSign?: boolean;
}) {
  const { title, subtitle } = describe(tx);
  const isTransfer = tx.type === 'TRANSFER';
  const recurring = tx.recurringRuleId !== null;
  // Data lama di cache (sebelum fitur tag) bisa belum punya kolom ini.
  const tags = tx.tags ?? [];
  const attachments = tx.attachmentCount ?? 0;
  const extras = [
    tags.length > 0 && `tag ${tags.map((t) => t.name).join(', ')}`,
    attachments > 0 && `${attachments} lampiran`,
  ].filter(Boolean);
  const amountText =
    isTransfer && !showTransferSign
      ? formatRupiah(Math.abs(tx.amount))
      : formatRupiah(tx.amount, { signed: true });

  return (
    <button
      type="button"
      onClick={() => onSelect(tx)}
      className="flex min-h-14 w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-surface-muted"
      aria-label={`${title}${recurring ? ' (berulang)' : ''}, ${amountText}, ${subtitle}${extras.length ? `, ${extras.join(', ')}` : ''}. Ketuk untuk mengubah.`}
    >
      {isTransfer ? (
        <IconBadge icon={TransferIcon} color="#475569" />
      ) : (
        <IconBadge icon={categoryIcon(tx.category?.icon)} color={tx.category?.color ?? '#64748B'} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium text-fg">{title}</span>
          {recurring && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary-soft px-1.5 py-0.5 text-[11px] font-semibold text-primary"
              title="Dari transaksi berulang"
            >
              <Repeat className="size-3" aria-hidden />
              Berulang
            </span>
          )}
          {attachments > 0 && <Paperclip className="size-3.5 shrink-0 text-muted" aria-hidden />}
        </span>
        <span className="block truncate text-sm text-muted">{subtitle}</span>
        {tags.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1" aria-hidden>
            {tags.map((t) => (
              <span
                key={t.id}
                className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted"
              >
                #{t.name}
              </span>
            ))}
          </span>
        )}
      </span>
      <span
        className={cn(
          'tabular shrink-0 font-semibold',
          isTransfer && !showTransferSign
            ? 'text-fg'
            : tx.amount > 0
              ? 'text-income-text'
              : 'text-expense-text',
        )}
      >
        {amountText}
      </span>
    </button>
  );
}
