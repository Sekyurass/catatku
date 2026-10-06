import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPLASH_FADE_MS } from '../components/SplashScreen';
import { GuestOnly, INTRO_MS, RequireAuth } from './guards';

const auth = vi.hoisted(() => ({ status: 'authenticated' as string }));
vi.mock('../lib/auth', () => ({ useAuth: () => auth }));

function renderGuard() {
  return render(
    <MemoryRouter>
      <RequireAuth>
        <p>Isi aplikasi</p>
      </RequireAuth>
    </MemoryRouter>,
  );
}

describe('RequireAuth intro', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('menampilkan intro logo di atas aplikasi lalu memudar setelah ±2 detik', () => {
    auth.status = 'authenticated';
    renderGuard();
    expect(screen.getByText('Isi aplikasi')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Memuat Catatku' })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(INTRO_MS - SPLASH_FADE_MS - 1));
    expect(screen.getByRole('status', { name: 'Memuat Catatku' })).not.toHaveClass('opacity-0');

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status', { name: 'Memuat Catatku' })).toHaveClass('opacity-0');

    act(() => vi.advanceTimersByTime(SPLASH_FADE_MS));
    expect(screen.queryByRole('status', { name: 'Memuat Catatku' })).not.toBeInTheDocument();
  });

  it('waktu cek sesi ikut dihitung, intro tidak diulang dari nol', () => {
    auth.status = 'loading';
    const { rerender } = renderGuard();
    expect(screen.queryByText('Isi aplikasi')).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1500));
    auth.status = 'authenticated';
    rerender(
      <MemoryRouter>
        <RequireAuth>
          <p>Isi aplikasi</p>
        </RequireAuth>
      </MemoryRouter>,
    );
    act(() => vi.advanceTimersByTime(INTRO_MS - 1500));
    expect(screen.queryByRole('status', { name: 'Memuat Catatku' })).not.toBeInTheDocument();
  });
});

describe('GuestOnly', () => {
  const tree = () => (
    <MemoryRouter initialEntries={['/daftar']}>
      <Routes>
        <Route
          path="/daftar"
          element={
            <GuestOnly afterAuth="/mulai">
              <p>Form daftar</p>
            </GuestOnly>
          }
        />
        <Route path="/mulai" element={<p>Onboarding</p>} />
        <Route path="/" element={<p>Beranda</p>} />
      </Routes>
    </MemoryRouter>
  );

  it('baru daftar di halaman ini → ke afterAuth', () => {
    auth.status = 'anonymous';
    const { rerender } = render(tree());
    expect(screen.getByText('Form daftar')).toBeInTheDocument();
    auth.status = 'authenticated';
    rerender(tree());
    expect(screen.getByText('Onboarding')).toBeInTheDocument();
  });

  it('sudah masuk sejak awal → ke beranda, bukan onboarding', () => {
    auth.status = 'authenticated';
    render(tree());
    expect(screen.getByText('Beranda')).toBeInTheDocument();
  });
});
