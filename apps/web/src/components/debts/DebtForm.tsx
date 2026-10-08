import {
  DEBT_COUNTERPARTY_MAX,
  DEBT_MAX_INSTALLMENTS,
  type DebtDirection,
  type DebtDTO,
  debtSchedule,
  formatRupiah,
  MAX_AMOUNT,
} from '@catatku/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../../lib/api';
import { today } from '../../lib/format';
import { applyServerErrors } from '../../lib/forms';
import { pickDefaultWallet, useInvalidateMoney, useWallets } from '../../lib/queries';
import { FormAlert } from '../../pages/auth/AuthLayout';
import { Button } from '../ui/Button';
import { DatePicker } from '../ui/DatePicker';
import { Field, Input } from '../ui/Field';
import { RupiahInput } from '../ui/RupiahInput';
import { Segmented } from '../ui/Segmented';
import { ColorDot, Select, type SelectOption } from '../ui/Select';
import { useToast } from '../ui/Toast';

const NO_WALLET = 'none';

type Mode = 'once' | 'installments';

const formSchema = z
  .object({
    direction: z.enum(['PAYABLE', 'RECEIVABLE']),
    counterparty: z
      .string()
      .trim()
      .min(1, { error: 'Nama wajib diisi' })
      .max(DEBT_COUNTERPARTY_MAX, { error: `Nama maksimal ${DEBT_COUNTERPARTY_MAX} karakter` }),
    principal: z.number().nullable(),
    interest: z.number().nullable(),
    startDate: z.string().min(1, { error: 'Pilih tanggal' }),
    mode: z.enum(['once', 'installments']),
    dueDate: z.string(),
    installments: z.string(),
    firstDueDate: z.string(),
    walletId: z.string(),
    note: z.string().max(200, { error: 'Catatan maksimal 200 karakter' }),
  })
  .superRefine((v, ctx) => {
    if (!v.principal || v.principal <= 0) {
      ctx.addIssue({ code: 'custom', path: ['principal'], message: 'Masukkan jumlah pinjaman' });
    } else if (v.principal > MAX_AMOUNT) {
      ctx.addIssue({ code: 'custom', path: ['principal'], message: 'Jumlah terlalu besar' });
    }
    if (v.mode === 'installments') {
      const n = Number(v.installments);
      if (!Number.isInteger(n) || n < 1 || n > DEBT_MAX_INSTALLMENTS) {
        ctx.addIssue({
          code: 'custom',
          path: ['installments'],
          message: `Isi 1–${DEBT_MAX_INSTALLMENTS} bulan`,
        });
      }
      if (!v.firstDueDate) {
        ctx.addIssue({ code: 'custom', path: ['firstDueDate'], message: 'Pilih tanggal' });
      }
    }
  });
type FormValues = z.infer<typeof formSchema>;

const FIELD_NAMES: Array<keyof FormValues> = [
  'counterparty',
  'principal',
  'interest',
  'startDate',
  'dueDate',
  'installments',
  'firstDueDate',
  'walletId',
  'note',
];

export function DebtForm({
  debt,
  initialDirection = 'PAYABLE',
  onDone,
}: {
  debt?: DebtDTO;
  initialDirection?: DebtDirection;
  onDone: (debt: DebtDTO) => void;
}) {
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const wallets = useWallets();
  const [formError, setFormError] = useState<string | null>(null);
  const active = (wallets.data ?? []).filter((w) => !w.archivedAt);

  const {
    control,
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      direction: debt?.direction ?? initialDirection,
      counterparty: debt?.counterparty ?? '',
      principal: debt?.principal ?? null,
      interest: debt?.interest || null,
      startDate: debt?.startDate ?? today(),
      mode: debt?.installments ? 'installments' : 'once',
      dueDate: debt?.dueDate ?? '',
      installments: debt?.installments ? String(debt.installments) : '',
      firstDueDate: debt?.firstDueDate ?? '',
      walletId: '',
      note: debt?.note ?? '',
    },
  });

  const direction = watch('direction');
  const mode = watch('mode');
  const startDate = watch('startDate');
  const principal = watch('principal') ?? 0;
  const interest = watch('interest') ?? 0;
  const n = Number(watch('installments'));
  const firstDueDate = watch('firstDueDate');
  const walletField = watch('walletId');
  const selectedWallet = walletField || pickDefaultWallet(active)?.id || NO_WALLET;
  const payable = direction === 'PAYABLE';

  const preview =
    mode === 'installments' && principal > 0 && Number.isInteger(n) && n > 1 && firstDueDate
      ? debtSchedule(principal + interest, n, firstDueDate, null)
      : null;

  const walletOptions: SelectOption[] = [
    ...active.map((w) => ({
      value: w.id,
      label: w.name,
      detail: formatRupiah(w.balance),
      leading: <ColorDot color={w.color} />,
    })),
    { value: NO_WALLET, label: 'Tanpa dompet (saldo tidak berubah)' },
  ];

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    const installments = v.mode === 'installments' ? Number(v.installments) : null;
    const schedule = {
      counterparty: v.counterparty,
      principal: v.principal,
      interest: v.interest ?? 0,
      startDate: v.startDate,
      dueDate: v.mode === 'once' ? v.dueDate || null : null,
      installments,
      firstDueDate: installments ? v.firstDueDate : null,
      note: v.note.trim() || null,
    };
    try {
      const saved = debt
        ? await api<DebtDTO>(`/debts/${debt.id}`, { method: 'PATCH', body: schedule })
        : await api<DebtDTO>('/debts', {
            method: 'POST',
            body: {
              ...schedule,
              direction: v.direction,
              walletId: selectedWallet === NO_WALLET ? null : selectedWallet,
            },
            headers: { 'Idempotency-Key': crypto.randomUUID() },
          });
      void invalidate();
      toast({
        message: debt ? 'Perubahan tersimpan' : payable ? 'Utang dicatat' : 'Piutang dicatat',
      });
      onDone(saved);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, FIELD_NAMES));
    }
  });

  const walletName = active.find((w) => w.id === selectedWallet)?.name;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormAlert message={formError} />
      {!debt && (
        <Controller
          control={control}
          name="direction"
          render={({ field }) => (
            <Segmented<DebtDirection>
              label="Jenis"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: 'PAYABLE', label: 'Saya meminjam' },
                { value: 'RECEIVABLE', label: 'Saya meminjamkan' },
              ]}
            />
          )}
        />
      )}

      <Field
        label={payable ? 'Pinjam dari' : 'Dipinjamkan ke'}
        error={errors.counterparty?.message}
      >
        {(a) => (
          <Input
            {...a}
            placeholder={payable ? 'Mis. Budi, Bank, Kredit HP' : 'Mis. Sari'}
            maxLength={DEBT_COUNTERPARTY_MAX}
            data-autofocus
            {...register('counterparty')}
          />
        )}
      </Field>

      <Field label="Jumlah pinjaman (pokok)" error={errors.principal?.message}>
        {(a) => (
          <Controller
            control={control}
            name="principal"
            render={({ field }) => (
              <RupiahInput
                {...a}
                ref={field.ref}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                size="lg"
                placeholder="0"
              />
            )}
          />
        )}
      </Field>

      <Field
        label="Total bunga/biaya (opsional)"
        error={errors.interest?.message}
        hint="Seluruh bunga atau biaya admin selama pinjaman; dibagi rata ke setiap cicilan."
      >
        {(a) => (
          <Controller
            control={control}
            name="interest"
            render={({ field }) => (
              <RupiahInput
                {...a}
                ref={field.ref}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder="0"
              />
            )}
          />
        )}
      </Field>

      <Field label="Tanggal pinjam" error={errors.startDate?.message}>
        {(a) => (
          <Controller
            control={control}
            name="startDate"
            render={({ field }) => (
              <DatePicker {...a} value={field.value} onChange={field.onChange} max={today()} />
            )}
          />
        )}
      </Field>

      <Controller
        control={control}
        name="mode"
        render={({ field }) => (
          <Segmented<Mode>
            label="Cara bayar"
            value={field.value}
            onChange={field.onChange}
            options={[
              { value: 'once', label: 'Sekali bayar' },
              { value: 'installments', label: 'Cicilan bulanan' },
            ]}
          />
        )}
      />

      {mode === 'once' ? (
        <Field label="Jatuh tempo (opsional)" error={errors.dueDate?.message}>
          {(a) => (
            <Controller
              control={control}
              name="dueDate"
              render={({ field }) => (
                <DatePicker
                  {...a}
                  value={field.value}
                  onChange={field.onChange}
                  min={startDate}
                  clearable
                  placeholder="Tanpa jatuh tempo"
                />
              )}
            />
          )}
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tenor (bulan)" error={errors.installments?.message}>
            {(a) => (
              <Input
                {...a}
                inputMode="numeric"
                placeholder="Mis. 12"
                {...register('installments')}
              />
            )}
          </Field>
          <Field label="Cicilan pertama" error={errors.firstDueDate?.message}>
            {(a) => (
              <Controller
                control={control}
                name="firstDueDate"
                render={({ field }) => (
                  <DatePicker
                    {...a}
                    value={field.value}
                    onChange={field.onChange}
                    min={startDate}
                  />
                )}
              />
            )}
          </Field>
        </div>
      )}
      {preview && (
        <p className="-mt-2 text-sm text-muted">
          <span className="tabular font-medium text-fg">
            {formatRupiah(preview[0]!.amount)} × {preview.length} bulan
          </span>
          {preview.at(-1)!.amount !== preview[0]!.amount &&
            ` (cicilan terakhir ${formatRupiah(preview.at(-1)!.amount)})`}
          , tiap tanggal {Number(firstDueDate.slice(8))}.
        </p>
      )}

      {!debt && (
        <Field
          label={payable ? 'Uang pinjaman masuk ke' : 'Uang dipinjamkan dari'}
          error={errors.walletId?.message}
          hint={
            selectedWallet === NO_WALLET
              ? 'Cocok untuk utang lama yang uangnya sudah terpakai. Pembayaran tetap bisa memotong dompet.'
              : `Saldo ${walletName ?? 'dompet'} ${payable ? 'bertambah' : 'berkurang'}. Tidak dihitung sebagai pemasukan/pengeluaran.`
          }
        >
          {(a) => (
            <Controller
              control={control}
              name="walletId"
              render={({ field }) => (
                <Select
                  {...a}
                  ref={field.ref}
                  value={selectedWallet}
                  onChange={field.onChange}
                  options={walletOptions}
                />
              )}
            />
          )}
        </Field>
      )}

      <Field label="Catatan (opsional)" error={errors.note?.message}>
        {(a) => (
          <Input
            {...a}
            maxLength={200}
            placeholder="Mis. Untuk servis motor"
            {...register('note')}
          />
        )}
      </Field>

      <Button type="submit" size="lg" loading={isSubmitting}>
        Simpan
      </Button>
    </form>
  );
}
