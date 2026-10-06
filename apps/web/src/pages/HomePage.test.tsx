import {
  type CategoryBreakdownDTO,
  currentMonth,
  formatRupiah,
  monthRange,
  type SummaryDTO,
  type TransactionDTO,
  type TrendDTO,
  type WalletDTO,
} from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickAddProvider } from '../components/transactions/QuickAdd';
import { ToastProvider } from '../components/ui/Toast';
import { HomePage } from './HomePage';

vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { name: 'Rina' } }) }));
vi.mock('../components/charts/CategoryDonut', () => ({
  default: () => <div data-testid="donut" />,
}));
vi.mock('../components/charts/TrendChart', () => ({ default: () => <div data-testid="trend" /> }));

const month = currentMonth();

const WALLET: WalletDTO = {
  id: 'w1',
  name: 'Tunai',
  type: 'CASH',
  initialBalance: 0,
  balance: 1_410_000,
  color: '#0F766E',
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastUsedAt: null,
};

const TX: TransactionDTO = {
  id: 't1',
  type: 'EXPENSE',
  amount: -45_000,
  date: `${month}-02`,
  note: 'Nasi padang',
  walletId: 'w1',
  wallet: { id: 'w1', name: 'Tunai', color: '#0F766E' },
  categoryId: 'cat_makan',
  category: { id: 'cat_makan', name: 'Makan', icon: 'utensils', color: '#EA580C' },
  counterpartWallet: null,
  transferGroupId: null,
  deletedAt: null,
  createdAt: '2026-10-02T05:00:00.000Z',
  updatedAt: '2026-10-02T05:00:00.000Z',
};

const SUMMARY: SummaryDTO = {
  month,
  totalBalance: 1_410_000,
  income: 500_000,
  expense: 120_000,
  net: 380_000,
  recent: [TX],
};

const breakdown = (type: 'EXPENSE' | 'INCOME'): CategoryBreakdownDTO =>
  type === 'EXPENSE'
    ? {
        month,
        type,
        total: 120_000,
        items: [
          {
            categoryId: 'cat_makan',
            name: 'Makan',
            icon: 'utensils',
            color: '#EA580C',
            total: 90_000,
            ratio: 0.75,
            count: 3,
          },
          {
            categoryId: 'cat_trans',
            name: 'Transportasi',
            icon: 'bus',
            color: '#2563EB',
            total: 30_000,
            ratio: 0.25,
            count: 1,
          },
        ],
      }
    : {
        month,
        type,
        total: 500_000,
        items: [
          {
            categoryId: 'cat_gaji',
            name: 'Gaji',
            icon: 'banknote',
            color: '#16A34A',
            total: 500_000,
            ratio: 1,
            count: 1,
          },
        ],
      };

const TREND: TrendDTO = {
  months: [
    { month: '2026-09', income: 0, expense: 0 },
    { month, income: 500_000, expense: 120_000 },
  ],
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

function setup({ wallets = [WALLET] }: { wallets?: WalletDTO[] } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/wallets')) return json({ items: wallets });
    if (url.pathname.endsWith('/categories')) return json({ items: [] });
    if (url.pathname.endsWith('/reports/summary')) return json(SUMMARY);
    if (url.pathname.endsWith('/reports/by-category'))
      return json(breakdown(url.searchParams.get('type') === 'INCOME' ? 'INCOME' : 'EXPENSE'));
    if (url.pathname.endsWith('/reports/trend')) return json(TREND);
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ToastProvider>
          <QuickAddProvider>
            <HomePage />
          </QuickAddProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { fetchMock };
}

describe('HomePage (dashboard)', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('menampilkan saldo, pemasukan/pengeluaran, kategori, tren, dan transaksi terakhir', async () => {
    setup();

    const summary = within(await screen.findByRole('region', { name: 'Ringkasan bulan ini' }));
    expect(summary.getByText(formatRupiah(1_410_000))).toBeInTheDocument();
    expect(summary.getByText(formatRupiah(500_000))).toBeInTheDocument();
    expect(summary.getByText(formatRupiah(120_000))).toBeInTheDocument();
    expect(summary.getByText(formatRupiah(380_000, { signed: true }))).toBeInTheDocument();

    const legend = await screen.findByRole('list', { name: 'Rincian pengeluaran per kategori' });
    const makan = within(legend).getByRole('link', { name: /Makan/ });
    const { start, end } = monthRange(month);
    expect(makan).toHaveAttribute(
      'href',
      `/transaksi?categoryId=cat_makan&from=${start}&to=${end}`,
    );
    expect(within(legend).getByText('75% · 3 transaksi')).toBeInTheDocument();
    expect(await screen.findByTestId('donut')).toBeInTheDocument();

    const table = await screen.findByRole('table', { name: /6 bulan terakhir/ });
    expect(within(table).getAllByRole('row')).toHaveLength(3);

    expect(screen.getByRole('button', { name: /Nasi padang/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lihat semua/ })).toHaveAttribute('href', '/transaksi');
  });

  it('berpindah ke rincian pemasukan', async () => {
    const { fetchMock } = setup();
    await screen.findByRole('list', { name: 'Rincian pengeluaran per kategori' });

    await userEvent.click(screen.getByRole('radio', { name: 'Pemasukan' }));

    const legend = await screen.findByRole('list', { name: 'Rincian pemasukan per kategori' });
    expect(within(legend).getByText('Gaji')).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('type=INCOME'))).toBe(true),
    );
  });

  it('mengarahkan pengguna baru untuk membuat dompet', async () => {
    setup({ wallets: [] });
    expect(await screen.findByText('Mulai dengan membuat dompet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buat dompet' })).toHaveAttribute('href', '/dompet');
  });
});
