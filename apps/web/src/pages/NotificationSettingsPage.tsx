import {
  FEATURE_FLAGS,
  type NotificationSettingsDTO,
  REMINDER_HOUR_MAX,
  REMINDER_HOUR_MIN,
} from '@catatku/shared';
import { useQueryClient } from '@tanstack/react-query';
import { BellRing, Send, Smartphone } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Field } from '../components/ui/Field';
import { Select } from '../components/ui/Select';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useToast } from '../components/ui/Toast';
import { api, ApiError } from '../lib/api';
import { cn } from '../lib/cn';
import { useFeatures } from '../lib/features';
import { notificationKeys, useNotificationSettings } from '../lib/notifications';
import {
  disablePush,
  enablePush,
  getPushStatus,
  isIosBrowser,
  PushPermissionError,
  type PushStatus,
} from '../lib/push';
import { FormAlert } from './auth/AuthLayout';

/** Senin dulu, sesuai kebiasaan kalender Indonesia. 0 = Minggu. */
const DAYS = [
  { value: 1, short: 'Sen', label: 'Senin' },
  { value: 2, short: 'Sel', label: 'Selasa' },
  { value: 3, short: 'Rab', label: 'Rabu' },
  { value: 4, short: 'Kam', label: 'Kamis' },
  { value: 5, short: 'Jum', label: 'Jumat' },
  { value: 6, short: 'Sab', label: 'Sabtu' },
  { value: 0, short: 'Min', label: 'Minggu' },
];

const HOUR_OPTIONS = Array.from({ length: REMINDER_HOUR_MAX - REMINDER_HOUR_MIN + 1 }, (_, i) => {
  const hour = REMINDER_HOUR_MIN + i;
  return { value: String(hour), label: `${String(hour).padStart(2, '0')}.00 WIB` };
});

export function NotificationSettingsPage() {
  const features = useFeatures();
  const enabled = features.data?.[FEATURE_FLAGS.REMINDERS] ?? false;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Pengingat & notifikasi</h1>
      {features.isError ? (
        <Card>
          <ErrorState message={features.error.message} onRetry={() => void features.refetch()} />
        </Card>
      ) : features.isPending ? (
        <Skeleton className="h-64" />
      ) : !enabled ? (
        <Card>
          <EmptyState
            icon={BellRing}
            title="Fitur belum tersedia"
            description="Pengingat dan notifikasi belum aktif untuk akunmu."
            action={
              <Link
                to="/"
                className="inline-flex min-h-11 items-center rounded-control bg-primary px-5 text-sm font-semibold text-on-primary hover:bg-primary-hover"
              >
                Kembali ke Beranda
              </Link>
            }
          />
        </Card>
      ) : (
        <SettingsContent />
      )}
    </div>
  );
}

function SettingsContent() {
  const settings = useNotificationSettings();
  if (settings.isPending) {
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-busy="true"
        aria-label="Memuat pengaturan"
      >
        <Skeleton className="h-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (settings.isError) {
    return (
      <Card>
        <ErrorState message={settings.error.message} onRetry={() => void settings.refetch()} />
      </Card>
    );
  }
  return (
    <>
      <ReminderCard settings={settings.data} />
      <PushCard push={settings.data.push} />
    </>
  );
}

function ReminderCard({ settings }: { settings: NotificationSettingsDTO }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const switchId = useId();
  const [reminderEnabled, setEnabled] = useState(settings.reminderEnabled);
  const [hour, setHour] = useState(settings.reminderHour);
  const [days, setDays] = useState(settings.reminderDays);
  const [formError, setFormError] = useState<string | null>(null);
  const [daysError, setDaysError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleDay = (day: number) =>
    setDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day],
    );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (reminderEnabled && days.length === 0) return setDaysError('Pilih minimal satu hari');
    setDaysError(null);
    setSaving(true);
    try {
      const saved = await api<NotificationSettingsDTO>('/notifications/settings', {
        method: 'PUT',
        body: { reminderEnabled, reminderHour: hour, reminderDays: days },
      });
      queryClient.setQueryData(notificationKeys.settings, saved);
      toast({ message: reminderEnabled ? 'Pengingat disimpan' : 'Pengingat dimatikan' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan. Coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor={switchId} className="block font-semibold">
              Pengingat harian
            </label>
            <p className="text-sm text-muted">
              Diingatkan mencatat bila sampai jam itu belum ada transaksi hari ini. Maksimal sekali
              sehari.
            </p>
          </div>
          <Switch id={switchId} checked={reminderEnabled} onChange={setEnabled} />
        </div>

        <FormAlert message={formError} />

        <div className="flex flex-col gap-4">
          <Field label="Jam">
            {(a) => (
              <Select
                {...a}
                value={String(hour)}
                onChange={(v) => setHour(Number(v))}
                options={HOUR_OPTIONS}
              />
            )}
          </Field>

          <fieldset aria-describedby={daysError ? `${switchId}-days` : undefined}>
            <legend className="mb-1.5 text-sm font-medium text-fg">Hari</legend>
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map((d) => (
                <label
                  key={d.value}
                  title={d.label}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-line text-sm font-semibold text-muted',
                    'hover:bg-surface-muted has-checked:border-primary has-checked:bg-primary-soft has-checked:text-primary',
                    'has-focus-visible:outline-2 has-focus-visible:outline-primary',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={days.includes(d.value)}
                    onChange={() => toggleDay(d.value)}
                    className="sr-only"
                    aria-label={d.label}
                  />
                  <span aria-hidden>{d.short}</span>
                </label>
              ))}
            </div>
            {daysError && (
              <p id={`${switchId}-days`} className="mt-1.5 text-sm text-expense-text" role="alert">
                {daysError}
              </p>
            )}
          </fieldset>
        </div>

        <Button type="submit" size="lg" loading={saving}>
          Simpan
        </Button>
      </form>
    </Card>
  );
}

function Switch({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <span className="relative inline-flex h-11 w-14 shrink-0 items-center justify-center">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 cursor-pointer opacity-0"
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none flex h-7 w-12 items-center rounded-full p-0.5 transition-colors',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary',
          checked ? 'bg-primary' : 'bg-line',
        )}
      >
        <span
          className={cn(
            'size-6 rounded-full bg-surface shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </span>
  );
}

function PushCard({ push }: { push: NotificationSettingsDTO['push'] }) {
  const toast = useToast();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState<'enable' | 'disable' | 'test' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void getPushStatus()
      .then(setStatus)
      .catch(() => setStatus('unsupported'));
  }, []);
  useEffect(refresh, [refresh]);

  const enable = async () => {
    if (!push.publicKey) return;
    setBusy('enable');
    setError(null);
    try {
      await enablePush(push.publicKey);
      toast({ message: 'Notifikasi aktif di perangkat ini' });
    } catch (err) {
      if (err instanceof PushPermissionError) {
        setError(
          err.permission === 'denied'
            ? 'Izin notifikasi ditolak. Izinkan lewat pengaturan situs di browser.'
            : 'Izin notifikasi belum diberikan.',
        );
      } else {
        setError(
          err instanceof ApiError ? err.message : 'Gagal mengaktifkan notifikasi. Coba lagi.',
        );
      }
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const disable = async () => {
    setBusy('disable');
    setError(null);
    try {
      await disablePush();
      toast({ message: 'Notifikasi di perangkat ini dimatikan', tone: 'info' });
    } catch {
      setError('Gagal mematikan notifikasi. Coba lagi.');
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      const { sent } = await api<{ sent: number }>('/notifications/push-test', { method: 'POST' });
      toast(
        sent > 0
          ? { message: 'Notifikasi uji dikirim' }
          : { message: 'Tidak ada perangkat yang menerima. Coba aktifkan ulang.', tone: 'error' },
      );
    } catch {
      toast({ message: 'Gagal mengirim notifikasi uji', tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  let body;
  if (!push.available) {
    body = <p className="text-sm text-muted">Notifikasi push belum disiapkan di server ini.</p>;
  } else if (status === null) {
    body = <Skeleton className="h-11" />;
  } else if (status === 'unsupported') {
    body = (
      <p className="text-sm text-muted">
        {isIosBrowser()
          ? 'Di iPhone/iPad, notifikasi hanya tersedia bila Catatku dipasang ke Layar Utama (iOS 16.4 ke atas).'
          : 'Browser ini belum mendukung notifikasi push.'}
      </p>
    );
  } else if (status === 'denied') {
    body = (
      <p className="text-sm text-muted">
        Izin notifikasi diblokir untuk situs ini. Izinkan lewat pengaturan situs di browser, lalu
        muat ulang halaman.
      </p>
    );
  } else if (status === 'on') {
    body = (
      <div className="flex flex-col gap-3">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-income/15 px-3 py-1 text-sm font-semibold text-income-text">
          <span className="size-2 rounded-full bg-income" aria-hidden />
          Aktif di perangkat ini
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={test}
            loading={busy === 'test'}
            icon={<Send className="size-4" aria-hidden />}
          >
            Kirim notifikasi uji
          </Button>
          <Button variant="ghost" onClick={disable} loading={busy === 'disable'}>
            Matikan
          </Button>
        </div>
      </div>
    );
  } else {
    body = (
      <Button
        onClick={enable}
        loading={busy === 'enable'}
        icon={<BellRing className="size-4" aria-hidden />}
        className="w-fit"
      >
        Aktifkan notifikasi
      </Button>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div>
          <h2 className="font-semibold">Notifikasi di perangkat ini</h2>
          <p className="text-sm text-muted">
            Pengingat dan tagihan yang perlu dikonfirmasi muncul di HP atau komputer walau Catatku
            sedang tidak dibuka. Tanpa ini, semuanya tetap ada di lonceng.
          </p>
        </div>
      </div>
      <FormAlert message={error} />
      {body}
    </Card>
  );
}
