import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthPage } from './AuthPage';

const auth = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }));
vi.mock('../../lib/auth', () => ({ useAuth: () => auth }));

function LocationProbe() {
  const { pathname, state } = useLocation();
  return <output data-testid="location">{`${pathname} ${JSON.stringify(state)}`}</output>;
}

function renderAt(path: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route
          element={
            <>
              <AuthPage />
              <Outlet />
              <LocationProbe />
            </>
          }
        >
          <Route path="/masuk" element={null} />
          <Route path="/daftar" element={null} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AuthPage', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('tab Masuk/Daftar berganti tanpa memasang ulang halaman; form lama dilepas setelah animasi', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt('/masuk');
    const nav = screen.getByRole('navigation', { name: 'Masuk atau daftar' });
    expect(screen.getByRole('link', { name: 'Masuk' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Selamat datang kembali!');

    await user.click(screen.getByRole('link', { name: 'Daftar' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/daftar');
    expect(screen.getByRole('navigation', { name: 'Masuk atau daftar' })).toBe(nav);
    expect(screen.getByRole('link', { name: 'Daftar' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Buat akun gratis');

    // Selama geser, form Masuk masih ada tetapi tidak bisa difokus/dibaca.
    const leaving = screen.getByText('Selamat datang kembali!').closest('[inert]');
    expect(leaving).toHaveAttribute('aria-hidden', 'true');

    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByText('Selamat datang kembali!')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Email')).toHaveLength(1);
  });

  it('tujuan setelah masuk (state.from) ikut terbawa saat pindah tab', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt('/daftar', { from: '/anggaran' });
    await user.click(screen.getByRole('link', { name: 'Masuk' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/masuk {"from":"/anggaran"}');
  });
});
