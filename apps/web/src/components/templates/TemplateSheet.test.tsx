import type { CategoryDTO, TransactionTemplateDTO, WalletDTO } from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../ui/Toast';
import { TemplateSheet } from './TemplateSheet';

const wallet = (over: Partial<WalletDTO>): WalletDTO => ({
  id: 'w1',
  name: 'GoPay',
  type: 'EWALLET',
  initialBalance: 0,
  balance: 200_000,
  color: '#0EA5E9',
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastUsedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});
const WALLETS = [
  wallet({}),
  wallet({ id: 'w2', name: 'Lama', archivedAt: '2026-09-01T00:00:00.000Z', lastUsedAt: null }),
];
const CATEGORIES: CategoryDTO[] = [
  {
    id: 'cat_transport',
    name: 'Transport',
    type: 'EXPENSE',
    icon: 'bus',
    color: '#2563EB',
    isDefault: true,
    archivedAt: null,
  },
];
const TEMPLATE: TransactionTemplateDTO = {
  id: 'tpl1',
  name: 'Parkir',
  type: 'EXPENSE',
  amount: 5_000,
  walletId: 'w1',
  wallet: { id: 'w1', name: 'GoPay', color: '#0EA5E9' },
  categoryId: 'cat_transport',
  category: { id: 'cat_transport', name: 'Transport', icon: 'bus', color: '#2563EB' },
  usable: true,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(editing?: TransactionTemplateDTO) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/wallets')) return json({ items: WALLETS });
    if (url.includes('/categories')) return json({ items: CATEGORIES });
    if (url.includes('/templates') && init?.method === 'DELETE')
      return new Response(null, { status: 204 });
    if (url.includes('/templates')) return json(TEMPLATE, init?.method === 'POST' ? 201 : 200);
    return json({ error: { code: 'NOT_FOUND', message: 'x' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  const onClose = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ToastProvider>
          <TemplateSheet open onClose={onClose} editing={editing} />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const writes = () =>
    fetchMock.mock.calls
      .filter(([, init]) => init?.method && init.method !== 'GET')
      .map(([url, init]) => ({
        url: String(url),
        method: init!.method,
        body: init!.body ? (JSON.parse(String(init!.body)) as Record<string, unknown>) : null,
      }));
  return { onClose, writes };
}

describe('TemplateSheet', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('membuat template tanpa nominal (diisi saat dipakai)', async () => {
    const { writes, onClose } = setup();
    await userEvent.type(await screen.findByLabelText('Nama'), '  Makan siang ');
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Kategori' })).getByLabelText('Transport'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(writes()).toEqual([
      {
        url: expect.stringMatching(/\/api\/v1\/templates$/),
        method: 'POST',
        body: {
          name: 'Makan siang',
          type: 'EXPENSE',
          amount: null,
          walletId: 'w1',
          categoryId: 'cat_transport',
        },
      },
    ]);
  });

  it('nama wajib diisi', async () => {
    const { writes } = setup();
    await screen.findByLabelText('Nama');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Nama wajib diisi')).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('saat mengubah hanya mengirim kolom yang berubah, termasuk mengosongkan nominal', async () => {
    const { writes, onClose } = setup(TEMPLATE);
    const amount = await screen.findByLabelText(/Nominal/);
    expect(amount).toHaveValue('5.000');
    await userEvent.clear(amount);
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(writes()).toEqual([
      { url: expect.stringMatching(/\/templates\/tpl1$/), method: 'PATCH', body: { amount: null } },
    ]);
  });

  it('template dengan dompet diarsipkan meminta memilih dompet aktif', async () => {
    const { writes } = setup({ ...TEMPLATE, walletId: 'w2', usable: false });
    expect(await screen.findByText(/sudah diarsipkan/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Pilih dompet', { selector: 'p' })).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('menghapus setelah konfirmasi', async () => {
    const { writes, onClose } = setup(TEMPLATE);
    await userEvent.click(await screen.findByRole('button', { name: 'Hapus' }));
    const confirm = within(await screen.findByRole('dialog', { name: 'Hapus template?' }));
    await userEvent.click(confirm.getByRole('button', { name: 'Hapus' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(writes()).toEqual([
      { url: expect.stringMatching(/\/templates\/tpl1$/), method: 'DELETE', body: null },
    ]);
  });
});
