import { type RegisterInput, registerSchema } from '@catatku/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Field, Input, PasswordInput } from '../../components/ui/Field';
import { useAuth } from '../../lib/auth';
import { applyServerErrors } from '../../lib/forms';
import { AuthLayout, FormAlert } from './AuthLayout';

export function RegisterPage() {
  const { register: signUp } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      // Setelah status jadi 'authenticated', GuestOnly yang mengarahkan ke onboarding.
      await signUp(values);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ['name', 'email', 'password']));
    }
  });

  return (
    <AuthLayout
      title="Buat akun"
      subtitle="Gratis, cukup satu menit."
      footer={
        <>
          Sudah punya akun?{' '}
          <Link
            to="/masuk"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Masuk
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormAlert message={formError} />
        <Field label="Nama panggilan" error={errors.name?.message}>
          {(a) => <Input {...a} autoComplete="given-name" {...register('name')} />}
        </Field>
        <Field label="Email" error={errors.email?.message}>
          {(a) => (
            <Input
              {...a}
              type="email"
              autoComplete="email"
              inputMode="email"
              {...register('email')}
            />
          )}
        </Field>
        <Field label="Kata sandi" hint="Minimal 8 karakter." error={errors.password?.message}>
          {(a) => <PasswordInput {...a} autoComplete="new-password" {...register('password')} />}
        </Field>
        <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
          Daftar
        </Button>
      </form>
    </AuthLayout>
  );
}
