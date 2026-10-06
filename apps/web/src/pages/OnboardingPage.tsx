import type { ClientEventName, WalletType } from '@catatku/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { ChartPie, Check, PiggyBank, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { IconBadge } from '../components/IconBadge';
import { Logo } from '../components/Logo';
import { TransactionFormPanel } from '../components/transactions/TransactionSheet';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Field, Input } from '../components/ui/Field';
import { RupiahInput } from '../components/ui/RupiahInput';
import { Segmented } from '../components/ui/Segmented';
import { ErrorState, Skeleton } from '../components/ui/States';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/cn';
import { applyServerErrors } from '../lib/forms';
import { WALLET_ICONS } from '../lib/icons';
import { invalidateMoney, useWallets } from '../lib/queries';
import { FormAlert } from './auth/AuthLayout';

const STEPS = ['Sambutan', 'Dompet pertama', 'Transaksi pertama'] as const;
type Step = 1 | 2 | 3;

function parseStep(raw: string | null): Step {
  const n = Number(raw);
  return n === 2 || n === 3 ? n : 1;
}

export function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const step = parseStep(params.get('langkah'));
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Pindahkan fokus ke judul tiap ganti langkah agar pembaca layar ikut berpindah.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const goTo = (next: Step) => setParams({ langkah: String(next) });

  const finish = (name: ClientEventName) => {
    api('/events', { method: 'POST', body: { name, step } }).catch(() => undefined);
    navigate('/', { replace: true });
  };

  return (
    <div className="flex min-h-dvh flex-col items-center bg-bg px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex w-full max-w-lg items-center justify-between gap-2 py-2">
        <Logo />
        <Button variant="ghost" onClick={() => finish('onboarding_skipped')}>
          Lewati
        </Button>
      </header>

      <main id="konten" className="flex w-full max-w-lg flex-1 flex-col justify-center gap-5 py-6">
        <Stepper step={step} />
        <Card className="p-5 sm:p-6">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-bold text-fg outline-none sm:text-2xl"
          >
            {step === 1 && `Hai, ${user?.name ?? 'kamu'}!`}
            {step === 2 && 'Buat dompet pertamamu'}
            {step === 3 && 'Catat transaksi pertamamu'}
          </h1>
          <div className="mt-4">
            {step === 1 && <WelcomeStep onNext={() => goTo(2)} />}
            {step === 2 && <WalletStep onNext={() => goTo(3)} />}
            {step === 3 && (
              <FirstTransactionStep
                onBack={() => goTo(2)}
                onDone={() => finish('onboarding_completed')}
                onLater={() => finish('onboarding_skipped')}
              />
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  return (
    <div>
      <p className="text-sm font-medium text-muted">
        Langkah {step} dari {STEPS.length}
        <span aria-hidden> · </span>
        <span className="sr-only">: </span>
        {STEPS[step - 1]}
      </p>
      <ol className="mt-2 flex gap-2" aria-label="Langkah memulai">
        {STEPS.map((label, i) => {
          const n = i + 1;
          return (
            <li
              key={label}
              aria-current={n === step ? 'step' : undefined}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                n <= step ? 'bg-primary' : 'bg-surface-muted',
              )}
            >
              <span className="sr-only">
                {label}
                {n < step ? ' (selesai)' : n === step ? ' (sekarang)' : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const BENEFITS = [
  { icon: Zap, text: 'Catat pemasukan & pengeluaran dalam hitungan detik.' },
  { icon: PiggyBank, text: 'Lihat sisa uang di semua dompet sekaligus.' },
  { icon: ChartPie, text: 'Pahami ke mana uangmu pergi tiap bulan.' },
];

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted">
        Catatku membantumu mencatat keuangan harian tanpa ribet. Siapkan dalam dua langkah singkat.
      </p>
      <ul className="flex flex-col gap-3">
        {BENEFITS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="text-sm text-fg">{text}</span>
          </li>
        ))}
      </ul>
      <Button size="lg" onClick={onNext}>
        Mulai
      </Button>
    </div>
  );
}

const SUGGESTED_NAMES: Record<WalletType, string> = {
  CASH: 'Tunai',
  BANK: 'Rekening bank',
  EWALLET: 'Dompet digital',
};

const walletFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Nama dompet wajib diisi' })
    .max(40, { error: 'Nama dompet maksimal 40 karakter' }),
  type: z.enum(['CASH', 'BANK', 'EWALLET']),
  initialBalance: z.number().nullable(),
});
type WalletForm = z.infer<typeof walletFormSchema>;

function WalletStep({ onNext }: { onNext: () => void }) {
  const wallets = useWallets();
  const [created, setCreated] = useState(false);

  if (wallets.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat dompet">
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
      </div>
    );
  }
  if (wallets.isError) return <ErrorState onRetry={() => void wallets.refetch()} />;

  if (wallets.data.length > 0 && !created) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted">Kamu sudah punya dompet. Lanjut ke transaksi pertama.</p>
        <ul className="flex flex-col gap-2">
          {wallets.data.map((w) => (
            <li key={w.id} className="flex items-center gap-3">
              <IconBadge icon={WALLET_ICONS[w.type]} color={w.color} />
              <span className="font-medium text-fg">{w.name}</span>
              <Check className="ml-auto size-5 text-income-text" aria-label="Siap dipakai" />
            </li>
          ))}
        </ul>
        <Button size="lg" onClick={onNext}>
          Lanjut
        </Button>
      </div>
    );
  }

  return <WalletStepForm onCreating={() => setCreated(true)} onNext={onNext} />;
}

function WalletStepForm({ onCreating, onNext }: { onCreating: () => void; onNext: () => void }) {
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    setError,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<WalletForm>({
    resolver: zodResolver(walletFormSchema),
    defaultValues: { name: SUGGESTED_NAMES.CASH, type: 'CASH', initialBalance: null },
  });

  const onTypeChange = (type: WalletType) => {
    const prev = getValues('type');
    // Ganti nama hanya kalau masih saran bawaan, supaya ketikan pengguna tidak tertimpa.
    if (getValues('name').trim() === SUGGESTED_NAMES[prev]) setValue('name', SUGGESTED_NAMES[type]);
    setValue('type', type, { shouldDirty: true });
  };

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    onCreating();
    try {
      await api('/wallets', {
        method: 'POST',
        body: { ...v, initialBalance: v.initialBalance ?? 0, color: '#0F766E' },
      });
      await invalidateMoney(qc);
      onNext();
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ['name', 'type', 'initialBalance']));
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <p className="text-muted">
        Dompet adalah tempat uangmu berada: uang tunai, rekening bank, atau e-wallet.
      </p>
      <FormAlert message={formError} />
      <Segmented<WalletType>
        label="Jenis dompet"
        value={watch('type')}
        onChange={onTypeChange}
        options={[
          { value: 'CASH', label: 'Tunai' },
          { value: 'BANK', label: 'Bank' },
          { value: 'EWALLET', label: 'E-wallet' },
        ]}
      />
      <Field label="Nama dompet" error={errors.name?.message}>
        {(a) => <Input {...a} placeholder="Mis. BCA, GoPay, Tunai" {...register('name')} />}
      </Field>
      <Field
        label="Saldo saat ini"
        error={errors.initialBalance?.message}
        hint="Boleh dikosongkan dan diubah nanti."
      >
        {(a) => (
          <Controller
            control={control}
            name="initialBalance"
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
      <Button type="submit" size="lg" loading={isSubmitting}>
        Simpan & lanjut
      </Button>
    </form>
  );
}

function FirstTransactionStep({
  onBack,
  onDone,
  onLater,
}: {
  onBack: () => void;
  onDone: () => void;
  onLater: () => void;
}) {
  const wallets = useWallets();
  const noWallet = wallets.isSuccess && wallets.data.length === 0;

  useEffect(() => {
    if (noWallet) onBack();
  }, [noWallet, onBack]);

  if (noWallet) return null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">Coba catat pengeluaran terakhirmu, misalnya makan siang tadi.</p>
      <TransactionFormPanel onDone={onDone} initialKind="EXPENSE" />
      <Button variant="ghost" onClick={onLater}>
        Nanti saja
      </Button>
    </div>
  );
}
