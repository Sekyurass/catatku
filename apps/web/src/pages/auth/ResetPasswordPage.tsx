import { resetPasswordSchema } from '@catatku/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '../../components/ui/Button';
import { Field, PasswordInput } from '../../components/ui/Field';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { applyServerErrors } from '../../lib/forms';
import { AuthLayout, FormAlert } from './AuthLayout';

const formSchema = resetPasswordSchema
  .pick({ password: true })
  .extend({ confirmPassword: z.string() })
  .refine((v) => v.confirmPassword === v.password, {
    path: ['confirmPassword'],
    error: 'Kata sandi tidak sama',
  });
type ResetForm = z.infer<typeof formSchema>;

const linkClass = 'font-semibold text-primary underline-offset-4 hover:underline';

function readToken(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
}

export function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [token] = useState(readToken);
  const [invalid, setInvalid] = useState<string | null>(
    token ? null : 'Tautan ini tidak lengkap. Buka lagi tautan dari email, atau minta tautan baru.',
  );
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetForm>({ resolver: zodResolver(formSchema) });

  // Token dibuang dari bilah alamat & riwayat begitu terbaca.
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, []);

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await resetPassword({ token, password });
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_RESET_TOKEN') {
        setInvalid(err.message);
        return;
      }
      setFormError(applyServerErrors(err, setError, ['password']));
    }
  });

  const footer = (
    <>
      Ingat kata sandimu?{' '}
      <Link to="/masuk" className={linkClass}>
        Masuk
      </Link>
    </>
  );

  if (invalid) {
    return (
      <AuthLayout title="Tautan tidak berlaku" subtitle={invalid} footer={footer}>
        <Link
          to="/lupa-kata-sandi"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-control bg-primary px-4 font-semibold text-on-primary hover:bg-primary-hover"
        >
          Minta tautan baru
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Buat kata sandi baru"
      subtitle="Setelah disimpan, perangkat lain yang masih masuk akan dikeluarkan."
      footer={footer}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormAlert message={formError} />
        <Field label="Kata sandi baru" hint="Minimal 8 karakter." error={errors.password?.message}>
          {(a) => (
            <PasswordInput
              {...a}
              autoComplete="new-password"
              icon={LockKeyhole}
              className="min-h-12"
              {...register('password')}
            />
          )}
        </Field>
        <Field label="Ulangi kata sandi baru" error={errors.confirmPassword?.message}>
          {(a) => (
            <PasswordInput
              {...a}
              autoComplete="new-password"
              icon={ShieldCheck}
              className="min-h-12"
              {...register('confirmPassword')}
            />
          )}
        </Field>
        <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
          Simpan dan masuk
        </Button>
      </form>
    </AuthLayout>
  );
}
