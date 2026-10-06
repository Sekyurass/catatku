import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { ApiError } from '../lib/api';
import { ProfilePage } from './ProfilePage';

const auth = vi.hoisted(() => ({
  user: {
    id: 'u1',
    name: 'Dina Lestari',
    email: 'dina@contoh.id',
    plan: 'FREE',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  updateProfile: vi.fn(),
  changePassword: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => auth }));

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
  auth.updateProfile.mockReset().mockResolvedValue(undefined);
  auth.changePassword.mockReset().mockResolvedValue(undefined);
});

describe('ProfilePage', () => {
  it('menampilkan inisial, nama, dan email', () => {
    renderPage();
    expect(screen.getByText('DL')).toBeInTheDocument();
    expect(screen.getByText('Dina Lestari')).toBeInTheDocument();
    expect(screen.getByText('dina@contoh.id')).toBeInTheDocument();
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
});
