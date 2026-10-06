import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../lib/auth';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { ResetPasswordPage } from './ResetPasswordPage';

const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status });

function renderAt(path: string, page: ReactNode, state?: unknown) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[{ pathname: path, state }]}>
        <AuthProvider>
          <Routes>
            <Route path={path} element={page} />
            <Route path="/" element={<p>Beranda</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const calls = () =>
  vi.mocked(fetch).mock.calls.map(([url, init]) => ({
    url: String(url),
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }));

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/auth/refresh')
          ? json({ error: { code: 'UNAUTHORIZED' } }, 401)
          : json(null, 204),
      ),
    );
  });

  it('memakai email dari halaman masuk lalu menampilkan petunjuk cek email', async () => {
    renderAt('/lupa-kata-sandi', <ForgotPasswordPage />, { email: 'sari@contoh.id' });
    expect(screen.getByLabelText('Email')).toHaveValue('sari@contoh.id');

    await userEvent.click(screen.getByRole('button', { name: 'Kirim tautan' }));

    expect(await screen.findByRole('heading', { name: 'Cek email kamu' })).toBeInTheDocument();
    expect(screen.getByText(/sari@contoh\.id terdaftar/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Kirim ulang dalam \d+ detik/ })).toBeDisabled();
    expect(calls().find((c) => c.url.endsWith('/auth/forgot-password'))?.body).toEqual({
      email: 'sari@contoh.id',
    });
  });
});

describe('ResetPasswordPage', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('tanpa token langsung menawarkan tautan baru', () => {
    window.history.replaceState(null, '', '/atur-ulang-kata-sandi');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: { code: 'UNAUTHORIZED' } }, 401)),
    );
    renderAt('/atur-ulang-kata-sandi', <ResetPasswordPage />);
    expect(screen.getByRole('heading', { name: 'Tautan tidak berlaku' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Minta tautan baru' })).toHaveAttribute(
      'href',
      '/lupa-kata-sandi',
    );
  });

  it('mengirim token dari fragmen URL, membuangnya dari alamat, lalu masuk', async () => {
    window.history.replaceState(null, '', '/atur-ulang-kata-sandi#token=abc123');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/auth/reset-password')) {
          return json({
            accessToken: 'tok',
            user: {
              id: 'u1',
              email: 'sari@contoh.id',
              name: 'Sari',
              plan: 'FREE',
              createdAt: '2026-10-01T00:00:00.000Z',
              avatarUpdatedAt: null,
            },
          });
        }
        return json({ error: { code: 'UNAUTHORIZED' } }, 401);
      }),
    );
    renderAt('/atur-ulang-kata-sandi', <ResetPasswordPage />);
    expect(window.location.hash).toBe('');

    await userEvent.type(screen.getByLabelText('Kata sandi baru'), 'sandibaru123');
    await userEvent.type(screen.getByLabelText('Ulangi kata sandi baru'), 'sandibaru12');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan dan masuk' }));
    expect(await screen.findByText('Kata sandi tidak sama')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Ulangi kata sandi baru'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan dan masuk' }));

    expect(await screen.findByText('Beranda')).toBeInTheDocument();
    expect(calls().find((c) => c.url.endsWith('/auth/reset-password'))?.body).toEqual({
      token: 'abc123',
      password: 'sandibaru123',
    });
  });

  it('token kedaluwarsa dari server berpindah ke tampilan tautan tidak berlaku', async () => {
    window.history.replaceState(null, '', '/atur-ulang-kata-sandi#token=lama');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/auth/reset-password')
          ? json(
              { error: { code: 'INVALID_RESET_TOKEN', message: 'Tautan sudah tidak berlaku.' } },
              400,
            )
          : json({ error: { code: 'UNAUTHORIZED' } }, 401),
      ),
    );
    renderAt('/atur-ulang-kata-sandi', <ResetPasswordPage />);
    await userEvent.type(screen.getByLabelText('Kata sandi baru'), 'sandibaru123');
    await userEvent.type(screen.getByLabelText('Ulangi kata sandi baru'), 'sandibaru123');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan dan masuk' }));
    expect(
      await screen.findByRole('heading', { name: 'Tautan tidak berlaku' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Tautan sudah tidak berlaku.')).toBeInTheDocument();
  });
});
