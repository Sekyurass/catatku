import { type DebtDTO, formatRupiah } from '@catatku/shared';
import { useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { debtProgressOf, debtTitle } from '../../lib/debts';
import { today } from '../../lib/format';
import { pickDefaultWallet, useInvalidateMoney, useWallets } from '../../lib/queries';
import { FormAlert } from '../../pages/auth/AuthLayout';
import { Button } from '../ui/Button';
import { DatePicker } from '../ui/DatePicker';
import { Field, Input } from '../ui/Field';
import { RupiahInput } from '../ui/RupiahInput';
import { ColorDot, Select, type SelectOption } from '../ui/Select';
import { useToast } from '../ui/Toast';

const NO_WALLET = 'none';

type Errors = Partial<Record<'amount' | 'date' | 'walletId', string>>;

/** Bayar utang (uang keluar dari dompet) atau terima pembayaran piutang (uang masuk). */
export function DebtPaymentForm({ debt, onDone }: { debt: DebtDTO; onDone: () => void }) {
  const toast = useToast();
  const invalidateMoney = useInvalidateMoney();
  const wallets = useWallets();
  const active = (wallets.data ?? []).filter((w) => !w.archivedAt);
  const payable = debt.direction === 'PAYABLE';
  const p = debtProgressOf(debt);
  const suggestion = p.next ? p.next.amount - p.next.paid : null;

  const [amount, setAmount] = useState<number | null>(suggestion);
  const [date, setDate] = useState(today());
  const [walletId, setWalletId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const fallback =
    (debt.walletId && active.some((w) => w.id === debt.walletId) ? debt.walletId : null) ??
    pickDefaultWallet(active)?.id ??
    NO_WALLET;
  const selectedWallet = walletId ?? fallback;
  const wallet = active.find((w) => w.id === selectedWallet);

  const walletOptions: SelectOption[] = [
    ...active.map((w) => ({
      value: w.id,
      label: w.name,
      detail: formatRupiah(w.balance),
      leading: <ColorDot color={w.color} />,
    })),
    { value: NO_WALLET, label: 'Tanpa dompet (saldo tidak berubah)' },
  ];

  const submit = async () => {
    const next: Errors = {};
    if (!amount || amount <= 0) next.amount = 'Masukkan nominal lebih dari 0';
    else if (amount > debt.remaining) next.amount = `Maksimal ${formatRupiah(debt.remaining)}`;
    if (!date) next.date = 'Pilih tanggal';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    setFormError(null);
    try {
      const updated = await api<DebtDTO>(`/debts/${debt.id}/payments`, {
        method: 'POST',
        body: {
          amount,
          date,
          note: note.trim() || undefined,
          walletId: selectedWallet === NO_WALLET ? null : selectedWallet,
        },
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      void invalidateMoney();
      toast({
        message: updated.settledAt
          ? `${debtTitle(debt)} lunas`
          : `${payable ? 'Pembayaran' : 'Penerimaan'} ${formatRupiah(amount!)} dicatat`,
      });
      onDone();
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.fields) {
        const { amount: a, date: d, walletId: w, ...rest } = err.fields;
        setErrors({ amount: a, date: d, walletId: w });
        if (Object.keys(rest).length > 0 || (!a && !d && !w)) setFormError(err.message);
      } else {
        setFormError(err instanceof Error ? err.message : 'Terjadi kendala. Coba lagi.');
      }
    }
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <FormAlert message={formError} />
      <Field label="Nominal" error={errors.amount} hint={`Sisa ${formatRupiah(debt.remaining)}`}>
        {(a) => (
          <RupiahInput
            {...a}
            size="lg"
            data-autofocus
            value={amount}
            onChange={(v) => {
              setAmount(v);
              setErrors((e) => ({ ...e, amount: undefined }));
            }}
            placeholder="0"
          />
        )}
      </Field>
      {amount !== debt.remaining && (
        <button
          type="button"
          onClick={() => {
            setAmount(debt.remaining);
            setErrors((e) => ({ ...e, amount: undefined }));
          }}
          className="-mt-2 inline-flex min-h-11 items-center self-start rounded-full bg-primary-soft px-4 text-sm font-semibold text-primary hover:bg-primary-soft/70"
        >
          Lunasi semua · {formatRupiah(debt.remaining)}
        </button>
      )}

      <Field
        label={payable ? 'Bayar dari dompet' : 'Terima ke dompet'}
        error={errors.walletId}
        hint={
          wallet
            ? `Saldo ${wallet.name} ${payable ? 'berkurang' : 'bertambah'}. Tidak dihitung sebagai pengeluaran/pemasukan.`
            : 'Hanya mengurangi sisa tagihan, tanpa mengubah saldo dompet.'
        }
      >
        {(a) => (
          <Select
            {...a}
            value={selectedWallet}
            onChange={(v) => {
              setWalletId(v);
              setErrors((e) => ({ ...e, walletId: undefined }));
            }}
            options={walletOptions}
          />
        )}
      </Field>

      <Field label="Tanggal" error={errors.date}>
        {(a) => <DatePicker {...a} value={date} onChange={setDate} max={today()} />}
      </Field>

      <Field label="Catatan (opsional)">
        {(a) => (
          <Input
            {...a}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="Mis. Transfer BCA"
          />
        )}
      </Field>

      <Button type="submit" size="lg" loading={busy}>
        {payable ? 'Simpan pembayaran' : 'Simpan penerimaan'}
      </Button>
    </form>
  );
}
