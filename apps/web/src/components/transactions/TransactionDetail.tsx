import { FEATURE_FLAGS, formatRupiah, type TransactionDTO } from '@catatku/shared';
import { Pencil, Repeat, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '../../lib/cn';
import { useFeature } from '../../lib/features';
import { formatLongDate } from '../../lib/format';
import { categoryIcon, TransferIcon } from '../../lib/icons';
import { splitNoteItems } from '../../lib/noteItems';
import { useAttachments } from '../../lib/queries';
import { IconBadge } from '../IconBadge';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Skeleton } from '../ui/States';
import { useToast } from '../ui/Toast';
import { PhotoViewer } from './AttachmentField';
import { useDeleteTransaction } from './useDeleteTransaction';

const TYPE_LABEL = { EXPENSE: 'Pengeluaran', INCOME: 'Pemasukan', TRANSFER: 'Transfer' } as const;

/** Tampilan baca transaksi yang sudah tersimpan; mengubah lewat tombol Ubah. */
export function TransactionDetail({
  tx,
  onClose,
  onEdit,
}: {
  tx: TransactionDTO | null;
  onClose: () => void;
  onEdit: (tx: TransactionDTO) => void;
}) {
  return (
    <Dialog open={tx !== null} onClose={onClose} title="Detail transaksi">
      {tx && <DetailBody tx={tx} onClose={onClose} onEdit={() => onEdit(tx)} />}
    </Dialog>
  );
}

function DetailBody({
  tx,
  onClose,
  onEdit,
}: {
  tx: TransactionDTO;
  onClose: () => void;
  onEdit: () => void;
}) {
  const deleteTransaction = useDeleteTransaction();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const isTransfer = tx.type === 'TRANSFER';
  const title = isTransfer ? 'Transfer' : (tx.category?.name ?? 'Tanpa kategori');
  const other = tx.counterpartWallet?.name ?? 'dompet lain';
  const [from, to] = tx.amount < 0 ? [tx.wallet.name, other] : [other, tx.wallet.name];
  const noteItems = splitNoteItems(tx.note);
  const tags = tx.tags ?? [];

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteTransaction(tx.id);
      onClose();
    } catch {
      toast({ message: 'Gagal menghapus. Coba lagi.', tone: 'error' });
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {isTransfer ? (
          <IconBadge icon={TransferIcon} color="#475569" />
        ) : (
          <IconBadge
            icon={categoryIcon(tx.category?.icon)}
            color={tx.category?.color ?? '#64748B'}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{title}</p>
          <p
            className={cn(
              'tabular text-2xl font-bold',
              isTransfer ? 'text-fg' : tx.amount > 0 ? 'text-income-text' : 'text-expense-text',
            )}
          >
            {isTransfer
              ? formatRupiah(Math.abs(tx.amount))
              : formatRupiah(tx.amount, { signed: true })}
          </p>
        </div>
      </div>

      <dl className="divide-y divide-line rounded-control border border-line text-sm">
        <Row label="Tanggal">{formatLongDate(tx.date)}</Row>
        <Row label="Jenis">{TYPE_LABEL[tx.type]}</Row>
        {isTransfer ? (
          <>
            <Row label="Dari">{from}</Row>
            <Row label="Ke">{to}</Row>
          </>
        ) : (
          <Row label="Dompet">{tx.wallet.name}</Row>
        )}
        {tx.recurringRuleId && (
          <Row label="Sumber">
            <span className="inline-flex items-center gap-1">
              <Repeat className="size-3.5 text-primary" aria-hidden />
              Transaksi berulang
            </span>
          </Row>
        )}
        {tags.length > 0 && (
          <Row label="Tag">
            <span className="flex flex-wrap justify-end gap-1">
              {tags.map((t) => (
                <span
                  key={t.id}
                  className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary"
                >
                  #{t.name}
                </span>
              ))}
            </span>
          </Row>
        )}
      </dl>

      {noteItems ? (
        <section aria-labelledby="rincian-catatan" className="flex flex-col gap-2">
          <h3 id="rincian-catatan" className="text-sm font-semibold">
            {noteItems.merchant ? `Rincian dari ${noteItems.merchant}` : 'Rincian'}
            <span className="font-normal text-muted">
              {' '}
              · {noteItems.items.length + noteItems.more} barang
            </span>
          </h3>
          <ol className="flex flex-col gap-1 rounded-control bg-surface-muted p-3 text-sm">
            {noteItems.items.map((item, i) => (
              <li key={`${i}-${item.name}`} className="flex gap-2">
                <span className="tabular w-5 shrink-0 text-right text-muted">{i + 1}.</span>
                <span className="min-w-0 flex-1 break-words">{item.name}</span>
                {item.price !== null && (
                  <span className="tabular shrink-0 font-medium">{formatRupiah(item.price)}</span>
                )}
              </li>
            ))}
            {noteItems.more > 0 && (
              <li className="pl-7 text-muted">dan {noteItems.more} barang lainnya</li>
            )}
          </ol>
        </section>
      ) : (
        tx.note && (
          <section aria-labelledby="judul-catatan" className="flex flex-col gap-1">
            <h3 id="judul-catatan" className="text-sm font-semibold">
              Catatan
            </h3>
            <p className="text-sm break-words whitespace-pre-wrap">{tx.note}</p>
          </section>
        )
      )}

      <Attachments tx={tx} />

      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="ghost"
          className="text-expense-text"
          onClick={() => void remove()}
          loading={deleting}
          icon={<Trash2 className="size-4" aria-hidden />}
        >
          Hapus
        </Button>
        <Button
          size="lg"
          className="flex-1"
          onClick={onEdit}
          disabled={deleting}
          icon={<Pencil className="size-4" aria-hidden />}
          data-autofocus
        >
          Ubah
        </Button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words">{children}</dd>
    </div>
  );
}

function Attachments({ tx }: { tx: TransactionDTO }) {
  const enabled = useFeature(FEATURE_FLAGS.ATTACHMENTS);
  const count = tx.attachmentCount ?? 0;
  const attachments = useAttachments(tx.id, enabled && count > 0);
  const [viewing, setViewing] = useState<string | null>(null);
  if (!enabled || count === 0) return null;

  return (
    <section aria-labelledby="judul-lampiran" className="flex flex-col gap-2">
      <h3 id="judul-lampiran" className="text-sm font-semibold">
        Lampiran <span className="font-normal text-muted">· {count} foto</span>
      </h3>
      {attachments.isPending ? (
        <div className="flex gap-2" role="status" aria-busy="true" aria-label="Memuat lampiran">
          {Array.from({ length: count }, (_, i) => (
            <Skeleton key={i} className="size-20" />
          ))}
        </div>
      ) : attachments.isError ? (
        <p className="text-sm text-muted">
          Lampiran gagal dimuat.{' '}
          <button
            type="button"
            onClick={() => void attachments.refetch()}
            className="inline-flex min-h-11 items-center font-medium text-primary underline"
          >
            Coba lagi
          </button>
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {attachments.data.map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setViewing(a.url)}
                aria-label={`Lihat lampiran ${i + 1}`}
                className="block size-20 overflow-hidden rounded-control border border-line bg-surface-muted"
              >
                <img src={a.url} alt="" className="size-full object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <PhotoViewer url={viewing} onClose={() => setViewing(null)} />
    </section>
  );
}
