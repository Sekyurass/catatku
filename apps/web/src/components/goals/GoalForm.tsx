import {
  CATEGORY_ICONS,
  type CategoryIcon,
  formatRupiah,
  GOAL_NAME_MAX,
  type GoalDTO,
  MAX_AMOUNT,
} from '@catatku/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../../lib/api';
import { today } from '../../lib/format';
import { applyServerErrors } from '../../lib/forms';
import { CATEGORY_ICON_COMPONENTS, CATEGORY_ICON_LABELS, swatchesWith } from '../../lib/icons';
import { useInvalidateMoney, useWallets } from '../../lib/queries';
import { FormAlert } from '../../pages/auth/AuthLayout';
import { IconBadge } from '../IconBadge';
import { Button } from '../ui/Button';
import { ChoiceGrid } from '../ui/ChoiceGrid';
import { DeleteGoalButton } from './DeleteGoalButton';
import { DatePicker } from '../ui/DatePicker';
import { Field, Input } from '../ui/Field';
import { RupiahInput } from '../ui/RupiahInput';
import { ColorDot, Select, type SelectOption } from '../ui/Select';
import { useToast } from '../ui/Toast';

const GOAL_ICONS: CategoryIcon[] = [
  'piggy-bank',
  'plane',
  'home',
  'car',
  'graduation-cap',
  'smartphone',
  'gift',
  'baby',
  'heart-pulse',
  'shirt',
  'briefcase',
  'trending-up',
  'book-open',
  'paw-print',
  'dumbbell',
  'circle-ellipsis',
];

const NEW_WALLET = 'new';

const formSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: 'Nama target wajib diisi' })
      .max(GOAL_NAME_MAX, { error: `Nama maksimal ${GOAL_NAME_MAX} karakter` }),
    targetAmount: z.number().nullable(),
    /** '' = tanpa tenggat. */
    deadline: z.string(),
    icon: z.enum(CATEGORY_ICONS),
    color: z.string(),
    walletId: z.string(),
  })
  .superRefine((v, ctx) => {
    if (!v.targetAmount || v.targetAmount <= 0) {
      ctx.addIssue({ code: 'custom', path: ['targetAmount'], message: 'Masukkan nominal target' });
    } else if (v.targetAmount > MAX_AMOUNT) {
      ctx.addIssue({ code: 'custom', path: ['targetAmount'], message: 'Nominal terlalu besar' });
    }
  });
type FormValues = z.infer<typeof formSchema>;

const FIELD_NAMES: Array<keyof FormValues> = ['name', 'targetAmount', 'deadline', 'walletId'];

export function GoalForm({ goal, onDone }: { goal?: GoalDTO; onDone: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidateMoney();
  const wallets = useWallets();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: goal?.name ?? '',
      targetAmount: goal?.targetAmount ?? null,
      deadline: goal?.deadline ?? '',
      icon: goal?.icon ?? 'piggy-bank',
      color: goal?.color ?? '#0F766E',
      walletId: goal?.walletId ?? NEW_WALLET,
    },
  });

  const icon = watch('icon');
  const color = watch('color');
  const walletId = watch('walletId');
  const name = watch('name').trim();
  const newWalletName = `Tabungan ${name || 'nama target'}`.slice(0, 40);
  const iconOptions = (GOAL_ICONS.includes(icon) ? GOAL_ICONS : [icon, ...GOAL_ICONS]).map(
    (value) => ({ value, label: CATEGORY_ICON_LABELS[value] }),
  );

  const walletOptions: SelectOption[] = [
    { value: NEW_WALLET, label: `Buat dompet baru: ${newWalletName}` },
    ...(wallets.data ?? [])
      .filter((w) => !w.archivedAt || w.id === goal?.walletId)
      .map((w) => ({
        value: w.id,
        label: w.archivedAt ? `${w.name} (diarsipkan)` : w.name,
        detail: formatRupiah(w.balance),
        leading: <ColorDot color={w.color} />,
      })),
  ];

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    const body = {
      name: v.name,
      targetAmount: v.targetAmount,
      deadline: v.deadline || null,
      icon: v.icon,
      color: v.color,
      walletId: v.walletId === NEW_WALLET ? null : v.walletId,
    };
    try {
      if (goal) await api(`/goals/${goal.id}`, { method: 'PATCH', body });
      else {
        await api('/goals', {
          method: 'POST',
          body,
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        });
      }
      void invalidate();
      toast({
        message:
          body.walletId === null
            ? `${goal ? 'Perubahan tersimpan' : 'Target dibuat'}. Dompet ${newWalletName} siap dipakai.`
            : goal
              ? 'Perubahan tersimpan'
              : 'Target dibuat',
      });
      onDone();
    } catch (err) {
      setFormError(applyServerErrors(err, setError, FIELD_NAMES));
    }
  });

  const walletHint =
    goal?.walletId && goal.walletId !== walletId && goal.contributionCount > 0
      ? 'Setoran lama tetap tercatat di dompet sebelumnya.'
      : walletId === NEW_WALLET
        ? 'Setiap setor memindahkan uang dari dompetmu ke dompet tabungan baru ini, seperti transfer.'
        : 'Setiap setor memindahkan uang dari dompet lain ke dompet ini, seperti transfer.';

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormAlert message={formError} />
      <div className="flex items-end gap-3">
        <IconBadge icon={CATEGORY_ICON_COMPONENTS[icon]} color={color} className="mb-0.5 size-11" />
        <Field label="Nama target" error={errors.name?.message} className="flex-1">
          {(a) => (
            <Input
              {...a}
              placeholder="Mis. Dana darurat, Liburan"
              maxLength={GOAL_NAME_MAX}
              enterKeyHint="next"
              data-autofocus
              {...register('name')}
            />
          )}
        </Field>
      </div>

      <Field label="Jumlah target" error={errors.targetAmount?.message}>
        {(a) => (
          <Controller
            control={control}
            name="targetAmount"
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
        label="Tenggat (opsional)"
        error={errors.deadline?.message}
        hint="Dengan tenggat, Catatku menghitung saran setoran per bulan."
      >
        {(a) => (
          <Controller
            control={control}
            name="deadline"
            render={({ field }) => (
              <DatePicker
                {...a}
                value={field.value}
                onChange={field.onChange}
                min={today()}
                clearable
                placeholder="Tanpa tenggat"
              />
            )}
          />
        )}
      </Field>

      <Field label="Dompet tabungan" error={errors.walletId?.message} hint={walletHint}>
        {(a) => (
          <Controller
            control={control}
            name="walletId"
            render={({ field }) => (
              <Select
                {...a}
                ref={field.ref}
                value={field.value}
                onChange={field.onChange}
                options={walletOptions}
              />
            )}
          />
        )}
      </Field>

      <ChoiceGrid
        legend="Ikon"
        options={iconOptions}
        value={icon}
        onChange={(v) => setValue('icon', v, { shouldDirty: true })}
        render={(v, selected) => {
          const Icon = CATEGORY_ICON_COMPONENTS[v];
          return (
            <Icon className="size-5" style={{ color: selected ? color : undefined }} aria-hidden />
          );
        }}
      />
      <ChoiceGrid
        legend="Warna"
        options={swatchesWith(color)}
        value={color}
        onChange={(c) => setValue('color', c, { shouldDirty: true })}
        render={(c) => <span className="size-7 rounded-full" style={{ backgroundColor: c }} />}
      />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {goal && <DeleteGoalButton goal={goal} onDeleted={onDone} />}
        <Button type="submit" size="lg" loading={isSubmitting} className="min-w-32 flex-1">
          Simpan
        </Button>
      </div>
    </form>
  );
}
