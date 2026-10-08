import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { ApiError } from '../lib/api';
import type * as AvatarModule from '../lib/avatar';
import { AvatarImageError } from '../lib/avatar';
import { ProfilePage } from './ProfilePage';

const auth = vi.hoisted(() => ({
  user: {
    id: 'u1',
    name: 'Dina Lestari',
    email: 'dina@contoh.id',
    plan: 'FREE',
    createdAt: '2026-01-01T00:00:00.000Z',
    avatarUpdatedAt: null as string | null,
  },
  updateProfile: vi.fn(),
  changePassword: vi.fn(),
  uploadAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  logout: vi.fn(),
  deleteAccount: vi.fn(),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => auth }));

const features = vi.hoisted(() => ({ recurring: false }));
vi.mock('../lib/features', () => ({
  useFeature: (key: string) => key === 'recurring_transactions' && features.recurring,
}));

const compressAvatar = vi.hoisted(() => vi.fn());
vi.mock('../lib/avatar', async (importOriginal) => ({
  ...(await importOriginal<typeof AvatarModule>()),
  compressAvatar,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ProfilePage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  features.recurring = false;
  auth.user.avatarUpdatedAt = null;
  auth.updateProfile.mockReset().mockResolvedValue(undefined);
  auth.changePassword.mockReset().mockResolvedValue(undefined);
  auth.uploadAvatar.mockReset().mockResolvedValue(undefined);
  auth.removeAvatar.mockReset().mockResolvedValue(undefined);
  auth.deleteAccount.mockReset().mockResolvedValue(undefined);
  compressAvatar.mockReset();
});

describe('ProfilePage', () => {
  it('menampilkan inisial, nama, dan email', () => {
    renderPage();
    expect(screen.getByText('DL')).toBeInTheDocument();
    expect(screen.getByText('Dina Lestari')).toBeInTheDocument();
    expect(screen.getByText('dina@contoh.id')).toBeInTheDocument();
  });

  it('tautan Transaksi berulang hanya muncul bila flag menyala', () => {
    const { unmount } = renderPage();
    expect(screen.queryByRole('link', { name: /Transaksi berulang/ })).not.toBeInTheDocument();
    unmount();
    features.recurring = true;
    renderPage();
    expect(screen.getByRole('link', { name: /Transaksi berulang/ })).toHaveAttribute(
      'href',
      '/berulang',
    );
  });

  it('foto yang dipilih dikompres lalu diunggah', async () => {
    const compressed = new Blob(['x'], { type: 'image/webp' });
    compressAvatar.mockResolvedValue(compressed);
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Ubah foto profil' }));
    expect(screen.queryByRole('button', { name: 'Hapus foto' })).not.toBeInTheDocument();

    const file = new File(['foto'], 'foto.jpg', { type: 'image/jpeg' });
    await user.upload(container.ownerDocument.querySelector('input[type="file"]')!, file);
    await waitFor(() => expect(auth.uploadAvatar).toHaveBeenCalledWith(compressed));
    expect(compressAvatar).toHaveBeenCalledWith(file);
    expect(await screen.findByText('Foto profil diperbarui')).toBeInTheDocument();
  });

  it('foto yang gagal diproses menampilkan pesan dan tidak diunggah', async () => {
    compressAvatar.mockRejectedValue(new AvatarImageError('Format foto tidak didukung.'));
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Ubah foto profil' }));
    await user.upload(
      container.ownerDocument.querySelector('input[type="file"]')!,
      new File(['x'], 'foto.heic', { type: 'image/heic' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Format foto tidak didukung.');
    expect(auth.uploadAvatar).not.toHaveBeenCalled();
  });

  it('foto yang ada bisa dihapus', async () => {
    auth.user.avatarUpdatedAt = '2026-10-06T00:00:00.000Z';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(['x'], { type: 'image/webp' }))),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Ubah foto profil' }));
    expect(screen.getByRole('button', { name: 'Ganti foto' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hapus foto' }));
    await waitFor(() => expect(auth.removeAvatar).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });

  it('tombol Keluar memakai warna bahaya dan hanya tampil di HP', () => {
    renderPage();
    const button = screen.getByRole('button', { name: 'Keluar' });
    expect(button).toHaveClass('bg-expense', 'md:hidden');
  });

  it('zona waktu bawaan WIB dan bisa diganti', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole('radio', { name: 'WIB' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'WIT' }));
    await waitFor(() =>
      expect(auth.updateProfile).toHaveBeenCalledWith({ timeZone: 'Asia/Jayapura' }),
    );
    expect(await screen.findByText('Zona waktu diganti ke WIT')).toBeInTheDocument();
  });

  it('mengubah nama tanpa meminta kata sandi', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Ubah' }));
    const name = screen.getByLabelText('Nama panggilan');
    await user.clear(name);
    await user.type(name, 'Dina');
    expect(screen.queryByLabelText('Kata sandi saat ini')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Simpan' }));
    await waitFor(() =>
      expect(auth.updateProfile).toHaveBeenCalledWith({ name: 'Dina', email: 'dina@contoh.id' }),
    );
  });

  it('mengganti email memunculkan kolom kata sandi dan meneruskan error server', async () => {
    auth.updateProfile.mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Kata sandi saat ini salah', {
        currentPassword: 'Kata sandi saat ini salah',
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Ubah' }));
    const email = screen.getByLabelText('Email');
    await user.clear(email);
    await user.type(email, 'baru@contoh.id');

    await user.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Masukkan kata sandi untuk mengganti email')).toBeVisible();
    expect(auth.updateProfile).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Kata sandi saat ini'), 'salahsekali');
    await user.click(screen.getByRole('button', { name: 'Simpan' }));
    await waitFor(() =>
      expect(auth.updateProfile).toHaveBeenCalledWith({
        name: 'Dina Lestari',
        email: 'baru@contoh.id',
        currentPassword: 'salahsekali',
      }),
    );
    expect(await screen.findByText('Kata sandi saat ini salah')).toBeVisible();
  });

  it('ganti kata sandi memvalidasi konfirmasi sebelum mengirim', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /Ganti kata sandi/ }));
    await user.type(screen.getByLabelText('Kata sandi saat ini'), 'rahasia123');
    await user.type(screen.getByLabelText('Kata sandi baru'), 'sandibaru123');
    await user.type(screen.getByLabelText('Ulangi kata sandi baru'), 'sandibaru12');
    await user.click(screen.getByRole('button', { name: 'Ganti kata sandi' }));
    expect(await screen.findByText('Konfirmasi tidak sama dengan kata sandi baru')).toBeVisible();
    expect(auth.changePassword).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Ulangi kata sandi baru'), '3');
    await user.click(screen.getByRole('button', { name: 'Ganti kata sandi' }));
    await waitFor(() =>
      expect(auth.changePassword).toHaveBeenCalledWith({
        currentPassword: 'rahasia123',
        newPassword: 'sandibaru123',
      }),
    );
  });

  it('hapus akun wajib kata sandi dan ketik HAPUS sebelum mengirim', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Hapus akun' }));
    const submit = screen.getByRole('button', { name: 'Hapus akun permanen' });

    await user.click(submit);
    expect(await screen.findByText('Masukkan kata sandi')).toBeVisible();
    expect(auth.deleteAccount).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Kata sandi'), 'rahasia123');
    await user.type(screen.getByLabelText(/Ketik HAPUS/), 'hapu');
    await user.click(submit);
    expect(await screen.findByText('Ketik HAPUS untuk mengonfirmasi')).toBeVisible();
    expect(auth.deleteAccount).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Ketik HAPUS/), 's');
    await user.click(submit);
    await waitFor(() =>
      expect(auth.deleteAccount).toHaveBeenCalledWith({ password: 'rahasia123', confirm: 'hapus' }),
    );
  });

  it('kata sandi salah saat hapus akun ditampilkan di kolomnya', async () => {
    auth.deleteAccount.mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Kata sandi salah', { password: 'Kata sandi salah' }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Hapus akun' }));
    await user.type(screen.getByLabelText('Kata sandi'), 'salahsekali');
    await user.type(screen.getByLabelText(/Ketik HAPUS/), 'HAPUS');
    await user.click(screen.getByRole('button', { name: 'Hapus akun permanen' }));
    expect(await screen.findByText('Kata sandi salah')).toBeVisible();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
