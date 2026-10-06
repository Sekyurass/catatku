import type { CategoryDTO, WalletDTO } from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../ui/Toast';
import { TransactionSheet } from './TransactionSheet';

const wallet = (over: Partial<WalletDTO>): WalletDTO => ({
  id: 'w1',
  name: 'Tunai',
  type: 'CASH',
  initialBalance: 0,
  balance: 100_000,
  color: '#0F766E',
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastUsedAt: null,
  ...over,
});

const WALLETS = [
  wallet({ id: 'w1', name: 'Tunai', lastUsedAt: '2026-10-01T00:00:00.000Z' }),
  wallet({ id: 'w2', name: 'BCA', type: 'BANK', lastUsedAt: '2026-10-05T00:00:00.000Z' }),
];
const CATEGORIES: CategoryDTO[] = [
  {
    id: 'cat_makan',
    name: 'Makan',
    type: 'EXPENSE',
    icon: 'utensils',
    color: '#EA580C',
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(budgets?: unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/wallets')) return json({ items: WALLETS });
    if (url.includes('/categories')) return json({ items: CATEGORIES });
    if (url.includes('/budgets') && budgets) return json(budgets);
    if (url.includes('/transactions') && init?.method === 'POST') return json({ id: 't1' }, 201);
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
          <TransactionSheet open onClose={onClose} />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
  return { onClose, posts };
}

describe('TransactionSheet (catat cepat)', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('fokus ke nominal, default dompet terakhir dipakai dan tanggal hari ini', async () => {
    setup();
    const amount = await screen.findByLabelText('Nominal');
    await waitFor(() => expect(amount).toHaveFocus());
    expect(screen.getByRole('combobox', { name: 'Dompet' })).toHaveTextContent('BCA');
    expect(screen.getByRole('button', { name: 'Hari ini' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('menampilkan error saat nominal/kategori kosong tanpa memanggil API', async () => {
    const { posts } = setup();
    await screen.findByLabelText('Nominal');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Masukkan nominal lebih dari 0')).toBeInTheDocument();
    expect(screen.getByText('Pilih kategori')).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it('Enter menyimpan dengan nominal positif + Idempotency-Key, lalu menutup sheet', async () => {
    const { posts, onClose } = setup();
    const amount = await screen.findByLabelText('Nominal');
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Kategori' })).getByLabelText('Makan'),
    );
    await userEvent.type(amount, '25000');
    expect(amount).toHaveValue('25.000');
    await userEvent.type(amount, '{Enter}');

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [url, init] = posts()[0]!;
    expect(String(url)).toMatch(/\/api\/v1\/transactions$/);
    expect(JSON.parse(String(init!.body))).toMatchObject({
      type: 'EXPENSE',
      amount: 25_000,
      walletId: 'w2',
      categoryId: 'cat_makan',
    });
    expect((init!.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^[\w-]{8,}$/);
  });

  it('memperingatkan bila pengeluaran membuat anggaran kategori ≥ 80%', async () => {
    setup({
      month: '2026-10',
      totalLimit: 1_000_000,
      totalSpent: 875_000,
      items: [
        {
          id: 'b1',
          categoryId: 'cat_makan',
          category: CATEGORIES[0],
          month: '2026-10',
          limitAmount: 1_000_000,
          spent: 875_000,
          remaining: 125_000,
          ratio: 0.875,
          status: 'warning',
        },
      ],
    });
    const amount = await screen.findByLabelText('Nominal');
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Kategori' })).getByLabelText('Makan'),
    );
    await userEvent.type(amount, '25000{Enter}');
    expect(
      await screen.findByText('Anggaran Makan sudah 87%, sisa Rp 125.000.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lihat' })).toBeInTheDocument();
  });

  it('mode transfer memakai endpoint transfer dan menolak dompet yang sama', async () => {
    const { posts } = setup();
    const amount = await screen.findByLabelText('Nominal');
    await userEvent.click(screen.getByLabelText('Transfer'));
    await userEvent.type(amount, '50000');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Pilih dompet tujuan', { selector: 'p' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Ke dompet' }));
    // Dompet asal (BCA) tidak ditawarkan sebagai tujuan.
    expect(screen.queryByRole('option', { name: /BCA/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: /Tunai/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    const [url, init] = posts()[0]!;
    expect(String(url)).toMatch(/\/transactions\/transfer$/);
    expect(JSON.parse(String(init!.body))).toMatchObject({
      fromWalletId: 'w2',
      toWalletId: 'w1',
      amount: 50_000,
    });
  });
});
