import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../ui/Toast';
import { QuickTextSharingCard } from './QuickTextSharingCard';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('QuickTextSharingCard', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('mati secara default; menyalakan mengirim PUT dan menjelaskan privasi', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') return json(JSON.parse(String(init.body)));
      return String(input).includes('/quick-text/sharing')
        ? json({ enabled: false })
        : new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ToastProvider>
          <QuickTextSharingCard />
        </ToastProvider>
      </QueryClientProvider>,
    );

    const toggle = screen.getByRole('switch', { name: /Bantu tingkatkan Ketik cepat/ });
    await vi.waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/tanpa nama, email, atau akunmu/)).toBeInTheDocument();
    expect(screen.getByText(/setelah 90 hari/)).toBeInTheDocument();

    await userEvent.click(toggle);
    await vi.waitFor(() => expect(toggle).toBeChecked());
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(put?.[1]?.body).toBe(JSON.stringify({ enabled: true }));
    expect(await screen.findByText(/Terima kasih/)).toBeInTheDocument();
  });
});
