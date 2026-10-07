import { formatRupiah, MAX_AMOUNT, type PendingOccurrenceDTO } from '@catatku/shared';
import { ChevronRight } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatDayLabel } from '../../lib/format';
import { categoryIcon } from '../../lib/icons';
import { useInvalidateMoney, usePendingOccurrences } from '../../lib/queries';
import { FormAlert } from '../../pages/auth/AuthLayout';
import { IconBadge } from '../IconBadge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Dialog } from '../ui/Dialog';
import { Field } from '../ui/Field';
import { RupiahInput } from '../ui/RupiahInput';
import { useToast } from '../ui/Toast';

const MAX_VISIBLE = 3;

/** Kejadian transaksi berulang yang menunggu dicatat atau dilewati. Tidak tampil bila kosong. */
export function PendingRecurringCard() {
  const pending = usePendingOccurrences();
  const invalidate = useInvalidateMoney();
  const toast = useToast();
  const [confirming, setConfirming] = useState<PendingOccurrenceDTO | null>(null);
  const [skipping, setSkipping] = useState<string | null>(null);

  const items = pending.data ?? [];
  if (items.length === 0) return null;

  const skip = async (item: PendingOccurrenceDTO) => {
    setSkipping(item.id);
    try {
      await api(`/recurring/pending/${item.id}/skip`, { method: 'POST' });
      void invalidate();
      toast({ message: 'Dilewati', tone: 'info' });
    } catch {
      toast({ message: 'Gagal melewati. Coba lagi.', tone: 'error' });
    } finally {
      setSkipping(null);
    }
  };

  return (
    <Card className="p-2 sm:p-4">
      <CardHeader
        title={`Menunggu konfirmasi (${items.length})`}
        className="px-2 sm:px-0"
        action={
          <Link
            to="/berulang"
            className="inline-flex min-h-11 items-center gap-1 rounded-control px-3 text-sm font-semibold text-primary hover:bg-primary-soft"
          >
            Atur
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        }
      />
      <ul className="flex flex-col">
        {items.slice(0, MAX_VISIBLE).map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control px-2 py-2"
          >
            <IconBadge icon={categoryIcon(item.category.icon)} color={item.category.color} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.note || item.category.name}</span>
              <span className="block truncate text-sm text-muted">
                {formatDayLabel(item.date)} · {item.wallet.name}
              </span>
            </span>
            <span
              className={cn(
                'tabular shrink-0 font-semibold',
                item.type === 'EXPENSE' ? 'text-expense-text' : 'text-income-text',
              )}
            >
              {formatRupiah(item.type === 'EXPENSE' ? -item.amount : item.amount, {
                signed: true,
              })}
            </span>
            <span className="flex w-full justify-end gap-2 sm:w-auto">
              <Button
                variant="ghost"
                loading={skipping === item.id}
                onClick={() => void skip(item)}
                aria-label={`Lewati ${item.note || item.category.name}`}
              >
                Lewati
              </Button>
              <Button
                onClick={() => setConfirming(item)}
                aria-label={`Catat ${item.note || item.category.name}`}
              >
                Catat
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {items.length > MAX_VISIBLE && (
        <p className="px-2 pt-1 text-sm text-muted">
          dan {items.length - MAX_VISIBLE} lainnya. Tangani yang di atas dulu, sisanya akan muncul
          di sini.
        </p>
      )}

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Catat transaksi berulang"
      >
        {confirming && <ConfirmForm item={confirming} onDone={() => setConfirming(null)} />}
      </Dialog>
    </Card>
  );
}

function ConfirmForm({ item, onDone }: { item: PendingOccurrenceDTO; onDone: () => void }) {
  const invalidate = useInvalidateMoney();
  const toast = useToast();
  const [amount, setAmount] = useState<number | null>(item.amount);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) return setError('Masukkan nominal lebih dari 0');
    if (amount > MAX_AMOUNT) return setError('Nominal terlalu besar');
    setError(null);
    setFormError(null);
    setBusy(true);
    try {
      await api(`/recurring/pending/${item.id}/confirm`, {
        method: 'POST',
        body: amount === item.amount ? {} : { amount },
      });
      void invalidate();
      toast({ message: 'Transaksi tersimpan' });
      onDone();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan. Coba lagi.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormAlert message={formError} />
      <div className="flex items-center gap-3">
        <IconBadge icon={categoryIcon(item.category.icon)} color={item.category.color} />
        <div className="min-w-0">
          <p className="truncate font-medium">{item.note || item.category.name}</p>
          <p className="truncate text-sm text-muted">
            {formatDayLabel(item.date)} · {item.wallet.name}
          </p>
        </div>
      </div>
      <Field
        label="Nominal"
        error={error ?? undefined}
        hint="Sesuaikan bila tagihannya berbeda dari biasanya."
      >
        {(a) => (
          <RupiahInput
            {...a}
            value={amount}
            onChange={setAmount}
            size="lg"
            data-autofocus
            enterKeyHint="done"
            className={item.type === 'EXPENSE' ? 'text-expense-text' : 'text-income-text'}
          />
        )}
      </Field>
      <Button type="submit" size="lg" loading={busy}>
        Simpan
      </Button>
    </form>
  );
}
