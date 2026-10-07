import { formatRupiah, type GoalContributionType, type GoalDTO, MAX_AMOUNT } from '@catatku/shared';
import { useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { today } from '../../lib/format';
import { progressOf } from '../../lib/goal';
import { pickDefaultWallet, useInvalidateMoney, useWallets } from '../../lib/queries';
import { FormAlert } from '../../pages/auth/AuthLayout';
import { Button } from '../ui/Button';
import { DatePicker } from '../ui/DatePicker';
import { Field, Input } from '../ui/Field';
import { RupiahInput } from '../ui/RupiahInput';
import { Segmented } from '../ui/Segmented';
import { ColorDot, Select, type SelectOption } from '../ui/Select';
import { useToast } from '../ui/Toast';

type Errors = Partial<Record<'amount' | 'date' | 'walletId', string>>;

/**
 * Setor/tarik selalu memindahkan uang lewat transfer: dari dompet yang dipilih ke dompet tabungan
 * target (setor), atau sebaliknya (tarik).
 */
export function ContributionForm({
  goal,
  initialType,
  onDone,
  onEdit,
}: {
  goal: GoalDTO;
  initialType: GoalContributionType;
  onDone: () => void;
  /** Buka form ubah target untuk memilih/membuat dompet tabungan. */
  onEdit: () => void;
}) {
  const toast = useToast();
  const invalidateMoney = useInvalidateMoney();
  const wallets = useWallets();
  const others = (wallets.data ?? []).filter((w) => !w.archivedAt && w.id !== goal.walletId);

  const [type, setType] = useState(initialType);
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(today());
  const [walletId, setWalletId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const selectedWallet = walletId ?? pickDefaultWallet(others)?.id ?? '';
  const source = others.find((w) => w.id === selectedWallet);
  const deposit = type === 'DEPOSIT';
  const p = progressOf(goal);
  const suggestion = deposit && p.dueThisMonth ? Math.min(p.dueThisMonth, MAX_AMOUNT) : null;

  const walletOptions: SelectOption[] = others.map((w) => ({
    value: w.id,
    label: w.name,
    detail: formatRupiah(w.balance),
    leading: <ColorDot color={w.color} />,
  }));

  const submit = async () => {
    const next: Errors = {};
    if (!amount || amount <= 0) next.amount = 'Masukkan nominal lebih dari 0';
    else if (!deposit && amount > goal.saved) {
      next.amount = `Maksimal ${formatRupiah(goal.saved)} (yang sudah terkumpul)`;
    }
    if (!date) next.date = 'Pilih tanggal';
    if (!selectedWallet) next.walletId = deposit ? 'Pilih dompet asal' : 'Pilih dompet tujuan';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    setFormError(null);
    try {
      const updated = await api<GoalDTO>(`/goals/${goal.id}/contributions`, {
        method: 'POST',
        body: { type, amount, date, note: note.trim() || undefined, walletId: selectedWallet },
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      void invalidateMoney();
      const reached = updated.saved >= updated.targetAmount && goal.saved < goal.targetAmount;
      const [from, to] = deposit
        ? [source?.name, goal.wallet?.name]
        : [goal.wallet?.name, source?.name];
      toast({
        message: reached
          ? `Selamat! Target ${goal.name} tercapai`
          : `${deposit ? 'Setoran' : 'Penarikan'} ${formatRupiah(amount!)} dipindah dari ${from} ke ${to}`,
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

  if (!goal.wallet || goal.wallet.archivedAt) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          {goal.wallet
            ? `Dompet tabungan ${goal.wallet.name} sudah diarsipkan.`
            : 'Target ini belum punya dompet tabungan.'}{' '}
          Setoran selalu dipindah ke dompet tabungan supaya saldo dompet asalmu ikut berkurang.
        </p>
        <Button size="lg" onClick={onEdit}>
          Pilih dompet tabungan
        </Button>
      </div>
    );
  }
  if (wallets.isSuccess && others.length === 0) {
    return (
      <p className="text-sm text-muted">
        Butuh dompet lain selain {goal.wallet.name} untuk menyetor atau menarik dana. Tambahkan
        dompet dulu di menu Dompet.
      </p>
    );
  }

  const short = deposit && source && amount !== null && amount > source.balance;

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
      <Segmented<GoalContributionType>
        label="Jenis"
        value={type}
        onChange={(t) => {
          setType(t);
          setErrors({});
        }}
        options={[
          { value: 'DEPOSIT', label: 'Setor' },
          { value: 'WITHDRAW', label: 'Tarik', disabled: goal.saved <= 0 },
        ]}
      />

      <Field
        label="Nominal"
        error={errors.amount}
        hint={deposit ? undefined : `Terkumpul ${formatRupiah(goal.saved)}`}
      >
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
            className={deposit ? 'text-income-text' : 'text-expense-text'}
          />
        )}
      </Field>
      {suggestion !== null && amount !== suggestion && (
        <button
          type="button"
          onClick={() => {
            setAmount(suggestion);
            setErrors((e) => ({ ...e, amount: undefined }));
          }}
          className="-mt-2 inline-flex min-h-11 items-center self-start rounded-full bg-primary-soft px-4 text-sm font-semibold text-primary hover:bg-primary-soft/70"
        >
          Pakai saran bulan ini · {formatRupiah(suggestion)}
        </button>
      )}

      <Field
        label={deposit ? 'Dari dompet' : 'Ke dompet'}
        error={errors.walletId}
        hint={
          short
            ? `Saldo ${source.name} hanya ${formatRupiah(source.balance)}; setelah setor saldonya minus.`
            : deposit
              ? `Saldo dompet ini berkurang dan pindah ke ${goal.wallet.name}, seperti transfer.`
              : `Uang dipindah dari ${goal.wallet.name} ke dompet ini, seperti transfer.`
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
            placeholder="Pilih dompet"
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
            placeholder={deposit ? 'Mis. Sisa gaji' : 'Mis. Bayar tiket'}
          />
        )}
      </Field>

      <Button type="submit" size="lg" loading={busy}>
        {deposit ? 'Simpan setoran' : 'Simpan penarikan'}
      </Button>
    </form>
  );
}
