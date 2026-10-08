import {
  DEBT_COUNTERPARTY_MAX,
  formatRupiah,
  MAX_AMOUNT,
  SPLIT_MAX_PARTICIPANTS,
  type SplitBillResultDTO,
  splitEvenly,
} from '@catatku/shared';
import { Plus, Scale, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { today } from '../../lib/format';
import {
  pickDefaultWallet,
  useCategories,
  useInvalidateMoney,
  useWallets,
} from '../../lib/queries';
import { FormAlert } from '../../pages/auth/AuthLayout';
import { CategoryPicker } from '../transactions/CategoryPicker';
import { Button } from '../ui/Button';
import { DatePicker } from '../ui/DatePicker';
import { Field, Input } from '../ui/Field';
import { RupiahInput } from '../ui/RupiahInput';
import { ColorDot, Select, type SelectOption } from '../ui/Select';
import { ErrorState, Skeleton } from '../ui/States';
import { useToast } from '../ui/Toast';

interface Person {
  key: number;
  name: string;
  amount: number | null;
}

type Errors = Partial<Record<'total' | 'categoryId' | 'walletId' | 'shares', string>> & {
  names?: Record<number, string>;
};

let nextKey = 1;
const newPerson = (): Person => ({ key: nextKey++, name: '', amount: null });

/**
 * Satu tagihan dibayar penuh dari satu dompet. Bagian pengguna dicatat sebagai pengeluaran,
 * bagian tiap teman menjadi piutang. Bagian dibagi rata sampai salah satunya diubah manual.
 */
export function SplitBillForm({ onDone }: { onDone: (result: SplitBillResultDTO) => void }) {
  const wallets = useWallets();
  const categories = useCategories();
  const toast = useToast();
  const invalidate = useInvalidateMoney();

  const [total, setTotal] = useState<number | null>(null);
  const [people, setPeople] = useState<Person[]>(() => [newPerson()]);
  const [myShare, setMyShare] = useState<number | null>(null);
  /** false = bagian dihitung rata otomatis dari total. */
  const [custom, setCustom] = useState(false);
  const [walletId, setWalletId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (wallets.isPending || categories.isPending) {
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-busy="true"
        aria-label="Memuat formulir"
      >
        <Skeleton className="h-12" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (wallets.isError || categories.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void wallets.refetch();
          void categories.refetch();
        }}
      />
    );
  }

  const active = wallets.data.filter((w) => !w.archivedAt);
  const selectedWallet = walletId || pickDefaultWallet(active)?.id || '';
  const expenseCategories = categories.data.filter((c) => c.type === 'EXPENSE' && !c.archivedAt);

  const even = splitEvenly(total ?? 0, people.length + 1);
  const mine = custom ? (myShare ?? 0) : (even[0] ?? 0);
  const shares = custom ? people.map((p) => p.amount ?? 0) : even.slice(1);
  const diff = (total ?? 0) - mine - shares.reduce((s, a) => s + a, 0);

  /** Edit manual pertama membekukan angka rata saat ini lalu menerapkan perubahan. */
  const freeze = () => {
    if (custom) return;
    setCustom(true);
    setMyShare(even[0] ?? 0);
    setPeople((list) => list.map((p, i) => ({ ...p, amount: even[i + 1] ?? 0 })));
  };

  const updatePerson = (key: number, patch: Partial<Person>) =>
    setPeople((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const addPerson = () => {
    setPeople((list) => [...list, { ...newPerson(), amount: custom ? 0 : null }]);
  };
  const removePerson = (key: number) => setPeople((list) => list.filter((p) => p.key !== key));

  const resetEven = () => {
    setCustom(false);
    setMyShare(null);
    setPeople((list) => list.map((p) => ({ ...p, amount: null })));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const next: Errors = {};
    if (!total || total <= 0) next.total = 'Masukkan total tagihan';
    else if (total > MAX_AMOUNT) next.total = 'Jumlah terlalu besar';
    if (!selectedWallet) next.walletId = 'Pilih dompet';
    if (!categoryId) next.categoryId = 'Pilih kategori';
    const names: Record<number, string> = {};
    people.forEach((p) => {
      if (!p.name.trim()) names[p.key] = 'Nama wajib diisi';
    });
    if (Object.keys(names).length > 0) next.names = names;
    if (total && diff !== 0) {
      next.shares =
        diff > 0
          ? `Masih kurang ${formatRupiah(diff)} dari total`
          : `Kelebihan ${formatRupiah(-diff)} dari total`;
    } else if (total && shares.some((a) => a <= 0)) {
      next.shares = 'Bagian tiap teman harus lebih dari 0';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      const result = await api<SplitBillResultDTO>('/debts/split', {
        method: 'POST',
        body: {
          total,
          date,
          walletId: selectedWallet,
          categoryId,
          note: note.trim() || null,
          myShare: mine,
          participants: people.map((p, i) => ({ name: p.name.trim(), amount: shares[i] })),
          dueDate: dueDate || null,
        },
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      void invalidate();
      toast({ message: `Tagihan dibagi ke ${people.length} teman` });
      onDone(result);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan');
      setBusy(false);
    }
  };

  const walletOptions: SelectOption[] = active.map((w) => ({
    value: w.id,
    label: w.name,
    detail: formatRupiah(w.balance),
    leading: <ColorDot color={w.color} />,
  }));

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
      <FormAlert message={formError} />
      <Field label="Total tagihan" error={errors.total}>
        {(a) => (
          <RupiahInput
            {...a}
            value={total}
            onChange={setTotal}
            size="lg"
            placeholder="0"
            data-autofocus
          />
        )}
      </Field>

      <section aria-labelledby="judul-bagian" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 id="judul-bagian" className="text-sm font-medium text-fg">
            Bagian masing-masing
          </h3>
          {custom && (
            <Button
              type="button"
              variant="ghost"
              icon={<Scale className="size-4" aria-hidden />}
              onClick={resetEven}
            >
              Bagi rata
            </Button>
          )}
        </div>
        <ul className="flex flex-col gap-2">
          <li className="flex items-center gap-2">
            <span className="min-w-0 flex-1 px-1 text-sm font-medium">Saya</span>
            <div className="w-40 shrink-0">
              <RupiahInput
                aria-label="Bagian saya"
                value={mine}
                onChange={(v) => {
                  freeze();
                  setMyShare(v);
                }}
              />
            </div>
            <span className="size-11 shrink-0" aria-hidden />
          </li>
          {people.map((p, i) => (
            <li key={p.key} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Input
                  className="min-w-0 flex-1"
                  aria-label={`Nama teman ${i + 1}`}
                  aria-invalid={errors.names?.[p.key] ? true : undefined}
                  placeholder={`Teman ${i + 1}`}
                  maxLength={DEBT_COUNTERPARTY_MAX}
                  value={p.name}
                  onChange={(e) => updatePerson(p.key, { name: e.target.value })}
                />
                <div className="w-40 shrink-0">
                  <RupiahInput
                    aria-label={`Bagian ${p.name.trim() || `teman ${i + 1}`}`}
                    value={shares[i] ?? 0}
                    onChange={(v) => {
                      freeze();
                      updatePerson(p.key, { amount: v });
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removePerson(p.key)}
                  disabled={people.length === 1}
                  className="flex size-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-surface-muted hover:text-expense-text disabled:opacity-40"
                  aria-label={`Hapus ${p.name.trim() || `teman ${i + 1}`}`}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              {errors.names?.[p.key] && (
                <p className="text-sm text-expense-text" role="alert">
                  {errors.names[p.key]}
                </p>
              )}
            </li>
          ))}
        </ul>
        {people.length < SPLIT_MAX_PARTICIPANTS && (
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            icon={<Plus className="size-4" aria-hidden />}
            onClick={addPerson}
          >
            Tambah teman
          </Button>
        )}
        <p
          className={cn(
            'tabular text-sm',
            errors.shares
              ? 'text-expense-text'
              : diff !== 0 && total
                ? 'text-warning-text'
                : 'text-muted',
          )}
          role={errors.shares ? 'alert' : undefined}
        >
          {errors.shares ??
            (diff !== 0 && total
              ? diff > 0
                ? `Kurang ${formatRupiah(diff)} dari total`
                : `Lebih ${formatRupiah(-diff)} dari total`
              : custom
                ? 'Bagian diatur manual.'
                : 'Dibagi rata; ubah angka mana pun untuk mengatur sendiri.')}
        </p>
      </section>

      <CategoryPicker
        categories={expenseCategories}
        value={categoryId}
        onChange={setCategoryId}
        error={errors.categoryId}
      />

      <Field
        label="Dibayar dari"
        error={errors.walletId}
        hint={`Saldo berkurang sebesar total. Laporan hanya menghitung bagianmu (${formatRupiah(mine)}).`}
      >
        {(a) => (
          <Select {...a} value={selectedWallet} onChange={setWalletId} options={walletOptions} />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tanggal">
          {(a) => <DatePicker {...a} value={date} onChange={setDate} max={today()} />}
        </Field>
        <Field label="Ditagih paling lambat">
          {(a) => (
            <DatePicker
              {...a}
              value={dueDate}
              onChange={setDueDate}
              min={date}
              clearable
              placeholder="Tanpa batas"
            />
          )}
        </Field>
      </div>

      <Field label="Catatan (opsional)">
        {(a) => (
          <Input
            {...a}
            maxLength={200}
            placeholder="Mis. Makan malam tim"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
      </Field>

      <Button type="submit" size="lg" loading={busy}>
        Simpan
      </Button>
    </form>
  );
}
