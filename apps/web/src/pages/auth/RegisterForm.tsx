import { registerSchema } from '@catatku/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Checkbox } from '../../components/ui/Checkbox';
import { Button } from '../../components/ui/Button';
import { Field, Input, PasswordInput } from '../../components/ui/Field';
import { useAuth } from '../../lib/auth';
import { applyServerErrors } from '../../lib/forms';
import { PrivacyPolicyLink } from '../privacy/PrivacyPolicyLink';
import { FormAlert } from './AuthLayout';
import { AuthPanel } from './AuthPanel';

/** Konfirmasi hanya dicek di browser; server cukup menerima satu kata sandi. */
const registerFormSchema = registerSchema
  .extend({
    confirmPassword: z.string(),
    acceptPrivacy: z
      .boolean()
      .refine((v) => v, { error: 'Setujui Kebijakan Privasi untuk mendaftar' }),
    shareQuickText: z.boolean(),
  })
  .refine((v) => v.confirmPassword === v.password, {
    path: ['confirmPassword'],
    error: 'Kata sandi tidak sama',
  });
type RegisterForm = z.infer<typeof registerFormSchema>;

export function RegisterForm() {
  const { register: signUp } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const consentErrorId = useId();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { acceptPrivacy: false, shareQuickText: false },
  });

  const onSubmit = handleSubmit(async ({ name, email, password, shareQuickText }) => {
    setFormError(null);
    try {
      // Setelah status jadi 'authenticated', GuestOnly yang mengarahkan ke onboarding.
      await signUp({ name, email, password, acceptPrivacy: true, shareQuickText });
    } catch (err) {
      setFormError(
        applyServerErrors(err, setError, ['name', 'email', 'password', 'acceptPrivacy']),
      );
    }
  });

  return (
    <AuthPanel title="Buat akun gratis" subtitle="Cukup satu menit untuk mulai mencatat.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormAlert message={formError} />
        <Field label="Nama panggilan" error={errors.name?.message}>
          {(a) => (
            <Input
              {...a}
              autoComplete="given-name"
              icon={UserRound}
              placeholder="Mis. Dina atau Budi"
              className="min-h-12"
              {...register('name')}
            />
          )}
        </Field>
        <Field label="Email" error={errors.email?.message}>
          {(a) => (
            <Input
              {...a}
              type="email"
              autoComplete="email"
              inputMode="email"
              icon={Mail}
              placeholder="nama@email.com"
              className="min-h-12"
              {...register('email')}
            />
          )}
        </Field>
        <Field label="Kata sandi" hint="Minimal 8 karakter." error={errors.password?.message}>
          {(a) => (
            <PasswordInput
              {...a}
              autoComplete="new-password"
              icon={LockKeyhole}
              placeholder="Buat kata sandi"
              className="min-h-12"
              {...register('password')}
            />
          )}
        </Field>
        <Field label="Ulangi kata sandi" error={errors.confirmPassword?.message}>
          {(a) => (
            <PasswordInput
              {...a}
              autoComplete="new-password"
              icon={ShieldCheck}
              placeholder="Ketik ulang kata sandi"
              className="min-h-12"
              {...register('confirmPassword')}
            />
          )}
        </Field>
        <div className="flex flex-col gap-1">
          <Controller
            control={control}
            name="acceptPrivacy"
            render={({ field }) => (
              <Checkbox
                checked={field.value}
                onChange={field.onChange}
                invalid={!!errors.acceptPrivacy}
                describedBy={errors.acceptPrivacy ? consentErrorId : undefined}
                label={
                  <>
                    Saya sudah membaca dan menyetujui <PrivacyPolicyLink newTab />
                  </>
                }
              />
            )}
          />
          {errors.acceptPrivacy && (
            <p id={consentErrorId} className="text-sm text-expense-text" role="alert">
              {errors.acceptPrivacy.message}
            </p>
          )}
          <Controller
            control={control}
            name="shareQuickText"
            render={({ field }) => (
              <Checkbox
                checked={field.value}
                onChange={field.onChange}
                label="Bantu tingkatkan Ketik cepat (opsional)"
                description="Kirim kalimat ketik cepat yang kamu koreksi, tanpa identitas. Bisa dimatikan kapan saja di Profil."
              />
            )}
          />
        </div>
        <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
          Daftar
        </Button>
      </form>
    </AuthPanel>
  );
}
