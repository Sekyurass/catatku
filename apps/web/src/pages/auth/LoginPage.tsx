import { type LoginInput, loginSchema } from '@catatku/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Field, Input, PasswordInput } from '../../components/ui/Field';
import { useAuth } from '../../lib/auth';
import { applyServerErrors } from '../../lib/forms';
import { AuthLayout, FormAlert } from './AuthLayout';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values);
      navigate(from, { replace: true });
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ['email', 'password']));
    }
  });

  return (
    <AuthLayout
      title="Masuk"
      subtitle="Selamat datang kembali!"
      footer={
        <>
          Belum punya akun?{' '}
          <Link
            to="/daftar"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Daftar gratis
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormAlert message={formError} />
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
        <Field label="Kata sandi" error={errors.password?.message}>
          {(a) => (
            <PasswordInput {...a} autoComplete="current-password" {...register('password')} />
          )}
        </Field>
        <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
          Masuk
        </Button>
      </form>
    </AuthLayout>
  );
}
