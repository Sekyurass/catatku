import { type LoginInput, loginSchema } from '@catatku/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { LockKeyhole, Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Field, Input, PasswordInput } from '../../components/ui/Field';
import { useAuth } from '../../lib/auth';
import { applyServerErrors } from '../../lib/forms';
import { FormAlert } from './AuthLayout';
import { AuthPanel } from './AuthPanel';

export function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    watch,
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
    <AuthPanel title="Selamat datang kembali!" subtitle="Masuk untuk lanjut mencatat keuanganmu.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormAlert message={formError} />
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
        <Field label="Kata sandi" error={errors.password?.message}>
          {(a) => (
            <PasswordInput
              {...a}
              autoComplete="current-password"
              icon={LockKeyhole}
              placeholder="Masukkan kata sandi"
              className="min-h-12"
              {...register('password')}
            />
          )}
        </Field>
        <Link
          to="/lupa-kata-sandi"
          state={{ email: watch('email') }}
          className="-mt-2 inline-flex min-h-11 items-center self-end text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          Lupa kata sandi?
        </Link>
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Masuk
        </Button>
      </form>
    </AuthPanel>
  );
}
