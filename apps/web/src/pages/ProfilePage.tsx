import { registerSchema, type UserDTO } from '@catatku/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Camera,
  ChevronRight,
  ImageUp,
  KeyRound,
  LogOut,
  Pencil,
  Repeat,
  Tags,
  Trash2,
  WalletMinimal,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Avatar } from '../components/Avatar';
import { ExportButton } from '../components/ExportButton';
import { ThemePicker } from '../components/ThemePicker';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Dialog } from '../components/ui/Dialog';
import { Field, Input, PasswordInput } from '../components/ui/Field';
import { useToast } from '../components/ui/Toast';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { AvatarImageError, compressAvatar } from '../lib/avatar';
import { useFeature } from '../lib/features';
import { applyServerErrors } from '../lib/forms';
import { FormAlert } from './auth/AuthLayout';

const LINKS = [
  {
    to: '/dompet',
    label: 'Dompet',
    description: 'Tunai, rekening bank, dompet digital',
    icon: WalletMinimal,
  },
  {
    to: '/kategori',
    label: 'Kategori',
    description: 'Atur kategori pemasukan & pengeluaran',
    icon: Tags,
  },
];

const RECURRING_LINK = {
  to: '/berulang',
  label: 'Transaksi berulang',
  description: 'Gaji, sewa, langganan yang tercatat otomatis',
  icon: Repeat,
};

const rowClass =
  'flex min-h-14 w-full items-center gap-3 rounded-control px-3 py-2 text-left hover:bg-surface-muted';

export function ProfilePage() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'profile' | 'password' | 'photo' | null>(null);
  const close = () => setDialog(null);
  const recurringOn = useFeature('recurring_transactions');

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Profil</h1>
      <Card className="flex items-center gap-3">
        {user && (
          <button
            type="button"
            onClick={() => setDialog('photo')}
            aria-label="Ubah foto profil"
            className="relative shrink-0 rounded-full"
          >
            <Avatar user={user} className="size-16 text-xl" />
            <span className="absolute -right-0.5 -bottom-0.5 flex size-7 items-center justify-center rounded-full border-2 border-surface bg-primary text-on-primary">
              <Camera className="size-3.5" aria-hidden />
            </span>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{user?.name}</p>
          <p className="truncate text-sm text-muted">{user?.email}</p>
        </div>
        <Button
          variant="secondary"
          icon={<Pencil className="size-4" aria-hidden />}
          onClick={() => setDialog('profile')}
        >
          Ubah
        </Button>
      </Card>
      <Card className="p-1">
        <ul>
          {[...LINKS, ...(recurringOn ? [RECURRING_LINK] : [])].map(
            ({ to, label, description, icon: Icon }) => (
              <li key={to}>
                <Link to={to} className={rowClass}>
                  <Icon className="size-5 text-primary" aria-hidden />
                  <span className="flex-1">
                    <span className="block font-medium">{label}</span>
                    <span className="block text-sm text-muted">{description}</span>
                  </span>
                  <ChevronRight className="size-5 text-muted" aria-hidden />
                </Link>
              </li>
            ),
          )}
          <li>
            <button type="button" onClick={() => setDialog('password')} className={rowClass}>
              <KeyRound className="size-5 text-primary" aria-hidden />
              <span className="flex-1">
                <span className="block font-medium">Ganti kata sandi</span>
                <span className="block text-sm text-muted">
                  Perangkat lain akan otomatis dikeluarkan
                </span>
              </span>
              <ChevronRight className="size-5 text-muted" aria-hidden />
            </button>
          </li>
        </ul>
      </Card>
      <Card>
        <ThemePicker />
      </Card>
      <Card className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="font-medium">Ekspor data</p>
          <p className="text-sm text-muted">
            Unduh seluruh riwayat transaksi sebagai CSV untuk Excel atau Google Sheets.
          </p>
        </div>
        <ExportButton label="Unduh CSV" />
      </Card>
      {/* Di tablet & desktop tombol Keluar ada di sidebar; HP tidak punya sidebar. */}
      <Button
        variant="danger"
        size="lg"
        loading={busy}
        icon={<LogOut className="size-5" aria-hidden />}
        onClick={async () => {
          setBusy(true);
          await logout();
        }}
        className="w-full md:hidden"
      >
        Keluar
      </Button>

      <Dialog open={dialog === 'photo'} onClose={close} title="Foto profil">
        {dialog === 'photo' && user && <PhotoForm user={user} onDone={close} />}
      </Dialog>
      <Dialog open={dialog === 'profile'} onClose={close} title="Ubah profil">
        {dialog === 'profile' && user && <ProfileForm user={user} onDone={close} />}
      </Dialog>
      <Dialog
        open={dialog === 'password'}
        onClose={close}
        title="Ganti kata sandi"
        description="Setelah diganti, kamu tetap masuk di perangkat ini. Perangkat lain perlu masuk lagi."
      >
        {dialog === 'password' && <PasswordForm onDone={close} />}
      </Dialog>
    </div>
  );
}

function PhotoForm({ user, onDone }: { user: UserDTO; onDone: () => void }) {
  const { uploadAvatar, removeAvatar } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasPhoto = Boolean(user.avatarUpdatedAt);

  const run = async (kind: 'upload' | 'remove', action: () => Promise<void>, message: string) => {
    setError(null);
    setBusy(kind);
    try {
      await action();
      toast({ message });
      onDone();
    } catch (err) {
      setError(
        err instanceof AvatarImageError || err instanceof ApiError
          ? err.message
          : 'Foto gagal diproses. Coba foto lain.',
      );
      setBusy(null);
    }
  };

  const onFile = (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    void run(
      'upload',
      async () => uploadAvatar(await compressAvatar(file)),
      'Foto profil diperbarui',
    );
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <FormAlert message={error} />
      <Avatar user={user} className="size-32 text-4xl" />
      <p className="text-center text-sm text-muted">
        Foto dipotong persegi dari bagian tengah dan diperkecil otomatis.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <div className="flex w-full flex-col gap-2">
        <Button
          size="lg"
          data-autofocus
          loading={busy === 'upload'}
          disabled={busy !== null}
          icon={<ImageUp className="size-5" aria-hidden />}
          onClick={() => fileRef.current?.click()}
        >
          {hasPhoto ? 'Ganti foto' : 'Pilih foto'}
        </Button>
        {hasPhoto && (
          <Button
            variant="secondary"
            size="lg"
            loading={busy === 'remove'}
            disabled={busy !== null}
            icon={<Trash2 className="size-5" aria-hidden />}
            onClick={() => void run('remove', removeAvatar, 'Foto profil dihapus')}
            className="text-expense-text"
          >
            Hapus foto
          </Button>
        )}
      </div>
    </div>
  );
}

const profileFormSchema = registerSchema
  .pick({ name: true, email: true })
  .extend({ currentPassword: z.string() });
type ProfileForm = z.infer<typeof profileFormSchema>;

function ProfileForm({ user, onDone }: { user: UserDTO; onDone: () => void }) {
  const { updateProfile } = useAuth();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { name: user.name, email: user.email, currentPassword: '' },
  });

  const emailChanged = watch('email').trim().toLowerCase() !== user.email;

  const onSubmit = handleSubmit(async ({ name, email, currentPassword }) => {
    setFormError(null);
    const changed = email !== user.email;
    if (changed && !currentPassword) {
      setError('currentPassword', { message: 'Masukkan kata sandi untuk mengganti email' });
      return;
    }
    if (name === user.name && !changed) return onDone();
    try {
      await updateProfile({ name, email, ...(changed && { currentPassword }) });
      toast({ message: 'Profil diperbarui' });
      onDone();
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ['name', 'email', 'currentPassword']));
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormAlert message={formError} />
      <Field label="Nama panggilan" error={errors.name?.message}>
        {(a) => <Input {...a} autoComplete="given-name" data-autofocus {...register('name')} />}
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
      {emailChanged && (
        <Field
          label="Kata sandi saat ini"
          hint="Demi keamanan, konfirmasi kata sandi untuk mengganti email."
          error={errors.currentPassword?.message}
        >
          {(a) => (
            <PasswordInput
              {...a}
              autoComplete="current-password"
              {...register('currentPassword')}
            />
          )}
        </Field>
      )}
      <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
        Simpan
      </Button>
    </form>
  );
}

const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, { error: 'Kata sandi saat ini wajib diisi' }),
    newPassword: registerSchema.shape.password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    error: 'Kata sandi baru harus berbeda dari yang lama',
  })
  .refine((v) => v.confirmPassword === v.newPassword, {
    path: ['confirmPassword'],
    error: 'Konfirmasi tidak sama dengan kata sandi baru',
  });
type PasswordForm = z.infer<typeof passwordFormSchema>;

function PasswordForm({ onDone }: { onDone: () => void }) {
  const { changePassword } = useAuth();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordForm>({ resolver: zodResolver(passwordFormSchema) });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setFormError(null);
    try {
      await changePassword({ currentPassword, newPassword });
      toast({ message: 'Kata sandi diganti. Perangkat lain sudah dikeluarkan.' });
      onDone();
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ['currentPassword', 'newPassword']));
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormAlert message={formError} />
      <Field label="Kata sandi saat ini" error={errors.currentPassword?.message}>
        {(a) => (
          <PasswordInput
            {...a}
            autoComplete="current-password"
            data-autofocus
            {...register('currentPassword')}
          />
        )}
      </Field>
      <Field label="Kata sandi baru" hint="Minimal 8 karakter." error={errors.newPassword?.message}>
        {(a) => <PasswordInput {...a} autoComplete="new-password" {...register('newPassword')} />}
      </Field>
      <Field label="Ulangi kata sandi baru" error={errors.confirmPassword?.message}>
        {(a) => (
          <PasswordInput {...a} autoComplete="new-password" {...register('confirmPassword')} />
        )}
      </Field>
      <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
        Ganti kata sandi
      </Button>
    </form>
  );
}
