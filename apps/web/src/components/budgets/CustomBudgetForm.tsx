import { BUDGET_SCOPES, type BudgetMonthDTO, CATEGORY_ICONS, MAX_AMOUNT } from '@catatku/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../../lib/api';
import { formatMonthLabel } from '../../lib/format';
import { applyServerErrors } from '../../lib/forms';
import { CATEGORY_ICON_COMPONENTS, CATEGORY_ICON_LABELS, swatchesWith } from '../../lib/icons';
import { queryKeys } from '../../lib/queries';
import { FormAlert } from '../../pages/auth/AuthLayout';
import { IconBadge } from '../IconBadge';
import { Button } from '../ui/Button';
import { ChoiceGrid } from '../ui/ChoiceGrid';
import { Field, Input } from '../ui/Field';
import { RupiahInput } from '../ui/RupiahInput';
import { Segmented } from '../ui/Segmented';
import { useToast } from '../ui/Toast';

const NAME_MAX = 30;
const ICON_OPTIONS = CATEGORY_ICONS.map((value) => ({ value, label: CATEGORY_ICON_LABELS[value] }));

const formSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: 'Nama anggaran wajib diisi' })
      .max(NAME_MAX, { error: `Nama maksimal ${NAME_MAX} karakter` }),
    limitAmount: z.number().nullable(),
    icon: z.enum(CATEGORY_ICONS),
    color: z.string(),
    scope: z.enum(BUDGET_SCOPES),
  })
  .superRefine((v, ctx) => {
    if (!v.limitAmount || v.limitAmount <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['limitAmount'],
        message: 'Masukkan batas lebih dari 0',
      });
    } else if (v.limitAmount > MAX_AMOUNT) {
      ctx.addIssue({ code: 'custom', path: ['limitAmount'], message: 'Nominal terlalu besar' });
    }
  });
type FormValues = z.infer<typeof formSchema>;

const FIELD_NAMES: Array<keyof FormValues> = ['name', 'limitAmount'];

/** Anggaran bernama sendiri; di balik layar menjadi kategori pengeluaran baru. */
export function CustomBudgetForm({ month, onDone }: { month: string; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const monthLabel = formatMonthLabel(month);

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
      name: '',
      limitAmount: null,
      icon: 'circle-ellipsis',
      color: '#64748B',
      scope: 'onward',
    },
  });

  const icon = watch('icon');
  const color = watch('color');
  const scope = watch('scope');

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      const data = await api<BudgetMonthDTO>('/budgets/custom', {
        method: 'POST',
        body: { ...v, month },
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      qc.setQueryData(queryKeys.budgets(month), data);
      void qc.invalidateQueries({ queryKey: ['budgets'] });
      void qc.invalidateQueries({ queryKey: queryKeys.categories });
      toast({
        message:
          v.scope === 'onward'
            ? `Anggaran ${v.name} berlaku mulai ${monthLabel}`
            : `Anggaran ${v.name} khusus ${monthLabel} disimpan`,
      });
      onDone();
    } catch (err) {
      setFormError(applyServerErrors(err, setError, FIELD_NAMES));
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormAlert message={formError} />
      <div className="flex items-end gap-3">
        <IconBadge icon={CATEGORY_ICON_COMPONENTS[icon]} color={color} className="mb-0.5 size-11" />
        <Field label="Nama anggaran" error={errors.name?.message} className="flex-1">
          {(a) => (
            <Input
              {...a}
              placeholder="Mis. Jajan kopi, Hobi"
              maxLength={NAME_MAX}
              enterKeyHint="next"
              data-autofocus
              {...register('name')}
            />
          )}
        </Field>
      </div>

      <Field
        label="Batas per bulan"
        error={errors.limitAmount?.message}
        hint="Nama ini juga muncul sebagai kategori saat mencatat pengeluaran."
      >
        {(a) => (
          <Controller
            control={control}
            name="limitAmount"
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

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium" aria-hidden>
          Berlaku untuk
        </p>
        <Segmented
          label="Berlaku untuk"
          value={scope}
          onChange={(s) => setValue('scope', s)}
          options={[
            { value: 'onward', label: 'Mulai bulan ini' },
            { value: 'month', label: 'Hanya bulan ini' },
          ]}
        />
      </div>

      <ChoiceGrid
        legend="Ikon"
        options={ICON_OPTIONS}
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

      <Button type="submit" size="lg" loading={isSubmitting}>
        Simpan anggaran
      </Button>
    </form>
  );
}
