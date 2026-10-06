import {
  type ForgotPasswordInput,
  forgotPasswordSchema,
  RESET_LINK_TTL_MINUTES,
  RESET_RESEND_COOLDOWN_SECONDS,
} from '@catatku/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, MailCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { api } from '../../lib/api';
import { applyServerErrors } from '../../lib/forms';
import { AuthLayout, FormAlert } from './AuthLayout';

const linkClass = 'font-semibold text-primary underline-offset-4 hover:underline';

function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft] as const;
}

export function ForgotPasswordPage() {
  const location = useLocation();
  const initialEmail = (location.state as { email?: string } | null)?.email ?? '';
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useCountdown();
  const [resending, setResending] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: initialEmail },
  });

  const send = async (email: string) => {
    await api('/auth/forgot-password', { method: 'POST', body: { email } });
    setSentTo(email);
    setCooldown(RESET_RESEND_COOLDOWN_SECONDS);
  };

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null);
    try {
      await send(email);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ['email']));
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

  if (sentTo) {
    return (
      <AuthLayout
        title="Cek email kamu"
        subtitle={`Kalau ${sentTo} terdaftar, kami sudah mengirim tautan untuk membuat kata sandi baru. Tautan berlaku ${RESET_LINK_TTL_MINUTES} menit.`}
        footer={footer}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-control bg-primary-soft p-4 text-sm">
            <MailCheck className="size-5 shrink-0 text-primary" aria-hidden />
            <p>Tidak ada di kotak masuk? Cek folder spam atau promosi.</p>
          </div>
          <FormAlert message={formError} />
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            loading={resending}
            disabled={cooldown > 0}
            onClick={async () => {
              setFormError(null);
              setResending(true);
              try {
                await send(sentTo);
              } catch (err) {
                setFormError(applyServerErrors(err, setError, []));
              } finally {
                setResending(false);
              }
            }}
          >
            {cooldown > 0 ? `Kirim ulang dalam ${cooldown} detik` : 'Kirim ulang email'}
          </Button>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setSentTo(null)}>
            Pakai email lain
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Lupa kata sandi?"
      subtitle="Masukkan email akunmu. Kami kirim tautan untuk membuat kata sandi baru."
      footer={footer}
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
              icon={Mail}
              placeholder="nama@email.com"
              className="min-h-12"
              {...register('email')}
            />
          )}
        </Field>
        <Button type="submit" size="lg" loading={isSubmitting} className="mt-2 w-full">
          Kirim tautan
        </Button>
      </form>
    </AuthLayout>
  );
}
