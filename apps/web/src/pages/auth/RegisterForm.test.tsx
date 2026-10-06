import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterForm } from './RegisterForm';

const auth = vi.hoisted(() => ({ register: vi.fn() }));
vi.mock('../../lib/auth', () => ({ useAuth: () => auth }));

beforeEach(() => auth.register.mockReset().mockResolvedValue(undefined));

async function fillForm(confirm: string) {
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
  await user.click(screen.getByRole('button', { name: 'Daftar' }));
}

describe('RegisterForm', () => {
  it('menolak bila konfirmasi kata sandi tidak sama', async () => {
    await fillForm('rahasia12');
    expect(await screen.findByText('Kata sandi tidak sama')).toBeVisible();
    expect(screen.getByLabelText('Ulangi kata sandi')).toHaveAttribute('aria-invalid', 'true');
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('mengirim tanpa kolom konfirmasi bila sama', async () => {
    await fillForm('rahasia123');
    await waitFor(() =>
      expect(auth.register).toHaveBeenCalledWith({
        name: 'Dina',
        email: 'dina@contoh.id',
        password: 'rahasia123',
      }),
    );
  });
});
