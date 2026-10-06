import {
  type CategoryDTO,
  describeRecurrence,
  type RecurringRuleDTO,
  type WalletDTO,
} from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { today } from '../../lib/format';
import { ToastProvider } from '../ui/Toast';
import { RecurringSheet } from './RecurringSheet';

const WALLETS: WalletDTO[] = [
  {
    id: 'w1',
    name: 'BCA',
    type: 'BANK',
    initialBalance: 0,
    balance: 5_000_000,
    color: '#2563EB',
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null,
  },
];
const CATEGORIES: CategoryDTO[] = [
  {
    id: 'cat_tagihan',
    name: 'Tagihan',
    type: 'EXPENSE',
    icon: 'receipt',
    color: '#7C3AED',
    isDefault: true,
    archivedAt: null,
  },
  {
    id: 'cat_gaji',
    name: 'Gaji',
    type: 'INCOME',
    icon: 'banknote',
    color: '#16A34A',
    isDefault: true,
    archivedAt: null,
  },
];
const RULE: RecurringRuleDTO = {
  id: 'rule1',
  type: 'EXPENSE',
  amount: 300_000,
  walletId: 'w1',
  wallet: { id: 'w1', name: 'BCA', color: '#2563EB' },
  categoryId: 'cat_tagihan',
  category: { id: 'cat_tagihan', name: 'Tagihan', icon: 'receipt', color: '#7C3AED' },
  note: 'Internet',
  frequency: 'MONTHLY',
  interval: 1,
  startDate: '2026-09-10',
  endDate: null,
  autoPost: true,
  paused: false,
  nextRunAt: '2026-10-10',
  createdAt: '2026-09-01T00:00:00.000Z',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(editing?: RecurringRuleDTO) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/wallets')) return json({ items: WALLETS });
    if (url.includes('/categories')) return json({ items: CATEGORIES });
    if (url.includes('/recurring') && init?.method === 'POST') return json(RULE, 201);
    if (url.includes('/recurring/') && init?.method === 'PATCH') return json(RULE);
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
          <RecurringSheet open onClose={onClose} editing={editing} />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const writes = () =>
    fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'POST' || init?.method === 'PATCH')
      .map(([url, init]) => ({
        url: String(url),
        method: init!.method,
        body: JSON.parse(String(init!.body)) as Record<string, unknown>,
      }));
  return { onClose, writes };
}

describe('RecurringSheet', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('membuat aturan bulanan dengan pratinjau jadwal dan mode konfirmasi', async () => {
    const { writes, onClose } = setup();
    const amount = await screen.findByLabelText('Nominal');
    expect(
      screen.getByText(
        describeRecurrence({ startDate: today(), frequency: 'MONTHLY', interval: 1 }),
      ),
    ).toBeInTheDocument();

    await userEvent.type(amount, '450000');
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Kategori' })).getByLabelText('Tagihan'),
    );
    await userEvent.type(screen.getByLabelText('Catatan (opsional)'), 'Listrik');
    await userEvent.click(screen.getByRole('radio', { name: /Minta konfirmasi dulu/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(writes()[0]).toEqual({
      url: expect.stringMatching(/\/api\/v1\/recurring$/),
      method: 'POST',
      body: {
        type: 'EXPENSE',
        amount: 450_000,
        walletId: 'w1',
        categoryId: 'cat_tagihan',
        note: 'Listrik',
        frequency: 'MONTHLY',
        interval: 1,
        startDate: today(),
        endDate: null,
        autoPost: false,
      },
    });
  });

  it('menolak interval di luar 1–99 tanpa memanggil API', async () => {
    const { writes } = setup(RULE);
    const interval = await screen.findByLabelText('Ulangi setiap');
    await userEvent.clear(interval);
    await userEvent.type(interval, '120');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Isi angka 1–99')).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('saat mengubah hanya mengirim kolom yang berubah', async () => {
    const { writes, onClose } = setup(RULE);
    const amount = await screen.findByLabelText('Nominal');
    await userEvent.clear(amount);
    await userEvent.type(amount, '350000');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(writes()).toEqual([
      {
        url: expect.stringMatching(/\/recurring\/rule1$/),
        method: 'PATCH',
        body: { amount: 350_000 },
      },
    ]);
  });

  it('menjeda aturan', async () => {
    const { writes, onClose } = setup(RULE);
    await userEvent.click(await screen.findByRole('button', { name: 'Jeda' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(writes()[0]!.body).toEqual({ paused: true });
  });
});
