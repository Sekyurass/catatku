import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '../routes/guards';
import { AuthProvider, useAuth } from './auth';

const session = {
  accessToken: 'token',
  user: {
    id: 'u1',
    name: 'Dina',
    email: 'dina@contoh.id',
    plan: 'FREE',
    createdAt: '2026-01-01T00:00:00.000Z',
    avatarUpdatedAt: null,
  },
};

function mockFetch({ loggedIn }: { loggedIn: boolean }) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/auth/refresh')) {
      return loggedIn
        ? new Response(JSON.stringify(session), { status: 200 })
        : new Response('{}', { status: 401 });
    }
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function ProfileProbe() {
  const { logout } = useAuth();
  return (
    <>
      <p>Halaman profil</p>
      <button type="button" onClick={() => void logout()}>
        Keluar
      </button>
    </>
  );
}

function LoginProbe() {
  const from = (useLocation().state as { from?: string } | null)?.from;
  return <p>Halaman masuk: {from ?? 'tanpa asal'}</p>;
}

function renderApp() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/profil']}>
        <AuthProvider>
          <Routes>
            <Route path="/masuk" element={<LoginProbe />} />
            <Route
              element={
                <RequireAuth>
                  <Outlet />
                </RequireAuth>
              }
            >
              <Route path="/profil" element={<ProfileProbe />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AuthProvider logout', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('menampilkan layar "Sampai jumpa" lalu ke halaman masuk tanpa membawa halaman terakhir', async () => {
    const fetchMock = mockFetch({ loggedIn: true });
    renderApp();
    expect(await screen.findByText('Halaman profil')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keluar' }));
    expect(screen.getByRole('status', { name: 'Sampai jumpa, Dina!' })).toBeInTheDocument();

    expect(await screen.findByText('Halaman masuk: tanpa asal')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('status', { name: 'Sampai jumpa, Dina!' })).not.toBeInTheDocument(),
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/auth/logout'))).toBe(true);
  });

  it('sesi yang berakhir sendiri tetap mengingat halaman asal', async () => {
    mockFetch({ loggedIn: false });
    renderApp();
    expect(await screen.findByText('Halaman masuk: /profil')).toBeInTheDocument();
  });
});
