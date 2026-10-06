import type { WalletDTO } from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { OnboardingPage } from './OnboardingPage';

vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { name: 'Rina' } }) }));

const WALLET: WalletDTO = {
  id: 'w1',
  name: 'Tunai',
  type: 'CASH',
  initialBalance: 0,
  balance: 0,
  color: '#0F766E',
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastUsedAt: null,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup({ wallets = [] as WalletDTO[], entry = '/mulai' } = {}) {
  const posted: { path: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      posted.push({ path: url.pathname, body });
      if (url.pathname.endsWith('/events')) return new Response(null, { status: 204 });
      if (url.pathname.endsWith('/wallets')) {
        wallets = [...wallets, { ...WALLET, ...body }];
        return json({ ...WALLET, ...body }, 201);
      }
    }
    if (url.pathname.endsWith('/wallets')) return json({ items: wallets });
    if (url.pathname.endsWith('/categories')) return json({ items: [] });
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[entry]}>
        <ToastProvider>
          <Routes>
            <Route path="/mulai" element={<OnboardingPage />} />
            <Route path="/" element={<p>Beranda</p>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { posted };
}

describe('OnboardingPage', () => {
  it('memandu dari sambutan, membuat dompet, sampai langkah transaksi', async () => {
    const user = userEvent.setup();
    const { posted } = setup();

    expect(screen.getByRole('heading', { name: 'Hai, Rina!' })).toBeInTheDocument();
    expect(screen.getByText(/Langkah 1 dari 3/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mulai' }));

    expect(
      await screen.findByRole('heading', { name: 'Buat dompet pertamamu' }),
    ).toBeInTheDocument();
    const name = await screen.findByLabelText('Nama dompet');
    expect(name).toHaveValue('Tunai');
    await user.click(screen.getByRole('radio', { name: 'Bank' }));
    expect(name).toHaveValue('Rekening bank');
    await user.click(screen.getByRole('button', { name: 'Simpan & lanjut' }));

    expect(
      await screen.findByRole('heading', { name: 'Catat transaksi pertamamu' }),
    ).toBeInTheDocument();
    expect(posted[0]).toMatchObject({
      path: '/api/v1/wallets',
      body: { name: 'Rekening bank', type: 'BANK', initialBalance: 0 },
    });

    await user.click(await screen.findByRole('button', { name: 'Nanti saja' }));
    expect(await screen.findByText('Beranda')).toBeInTheDocument();
    expect(posted.at(-1)).toEqual({
      path: '/api/v1/events',
      body: { name: 'onboarding_skipped', step: 3 },
    });
  });

  it('tidak membuat dompet ganda bila pengguna sudah punya', async () => {
    const user = userEvent.setup();
    setup({ wallets: [WALLET], entry: '/mulai?langkah=2' });
    expect(
      await screen.findByText('Kamu sudah punya dompet. Lanjut ke transaksi pertama.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Nama dompet')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(
      await screen.findByRole('heading', { name: 'Catat transaksi pertamamu' }),
    ).toBeInTheDocument();
  });

  it('"Lewati" mencatat langkah terakhir lalu ke beranda', async () => {
    const user = userEvent.setup();
    const { posted } = setup();
    await user.click(screen.getByRole('button', { name: 'Lewati' }));
    expect(await screen.findByText('Beranda')).toBeInTheDocument();
    await waitFor(() =>
      expect(posted).toContainEqual({
        path: '/api/v1/events',
        body: { name: 'onboarding_skipped', step: 1 },
      }),
    );
  });
});
