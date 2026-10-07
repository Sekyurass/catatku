import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterForm } from './RegisterForm';

const auth = vi.hoisted(() => ({ register: vi.fn() }));
vi.mock('../../lib/auth', () => ({ useAuth: () => auth }));

beforeEach(() => auth.register.mockReset().mockResolvedValue(undefined));

async function fillForm(
  confirm: string,
  { privacy = true, quickText = false }: { privacy?: boolean; quickText?: boolean } = {},
) {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/daftar']}>
      <RegisterForm />
    </MemoryRouter>,
  );
  await user.type(screen.getByLabelText('Nama panggilan'), 'Dina');
  await user.type(screen.getByLabelText('Email'), 'Dina@Contoh.id');
  await user.type(screen.getByLabelText('Kata sandi'), 'rahasia123');
  await user.type(screen.getByLabelText('Ulangi kata sandi'), confirm);
  if (privacy) await user.click(screen.getByRole('checkbox', { name: /menyetujui/ }));
  if (quickText) await user.click(screen.getByRole('checkbox', { name: /Ketik cepat/ }));
  await user.click(screen.getByRole('button', { name: 'Daftar' }));
}

describe('RegisterForm', () => {
  it('menolak bila konfirmasi kata sandi tidak sama', async () => {
    await fillForm('rahasia12');
    expect(await screen.findByText('Kata sandi tidak sama')).toBeVisible();
    expect(screen.getByLabelText('Ulangi kata sandi')).toHaveAttribute('aria-invalid', 'true');
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('wajib mencentang Kebijakan Privasi', async () => {
    await fillForm('rahasia123', { privacy: false });
    expect(await screen.findByText('Setujui Kebijakan Privasi untuk mendaftar')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /menyetujui/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('tautan kebijakan dibuka di tab baru agar isian tidak hilang', () => {
    render(
      <MemoryRouter>
        <RegisterForm />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Kebijakan Privasi' });
    expect(link).toHaveAttribute('href', '/privasi');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('mengirim tanpa kolom konfirmasi; Ketik cepat bawaannya tidak ikut', async () => {
    await fillForm('rahasia123');
    await waitFor(() =>
      expect(auth.register).toHaveBeenCalledWith({
        name: 'Dina',
        email: 'dina@contoh.id',
        password: 'rahasia123',
        acceptPrivacy: true,
        shareQuickText: false,
      }),
    );
  });

  it('ikut Ketik cepat bila dicentang', async () => {
    await fillForm('rahasia123', { quickText: true });
    await waitFor(() =>
      expect(auth.register).toHaveBeenCalledWith(
        expect.objectContaining({ acceptPrivacy: true, shareQuickText: true }),
      ),
    );
  });
});
