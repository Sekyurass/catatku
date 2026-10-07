import {
  type CompareDTO,
  formatRupiah,
  type MonthlyReportDTO,
  type YearlyReportDTO,
} from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { ReportsPage } from './ReportsPage';

const downloadFile = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  downloadFile: (...args: unknown[]) => downloadFile(...args),
}));
vi.mock('../components/charts/DailyChart', () => ({ default: () => <div data-testid="daily" /> }));
vi.mock('../components/charts/TrendChart', () => ({ default: () => <div data-testid="trend" /> }));

const MAKAN = { id: 'cat_makan', name: 'Makan', icon: 'utensils', color: '#EA580C' };
const WALLET = { id: 'w1', name: 'Tunai', color: '#0F766E' };

const days = (month: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    date: `${month}-${String(i + 1).padStart(2, '0')}`,
    income: 0,
    expense: 0,
  }));

const MONTHLY: MonthlyReportDTO = {
  month: '2025-04',
  income: 5_000_000,
  expense: 520_000,
  net: 4_480_000,
  daysCounted: 30,
  averageDaily: 17_333,
  busiestDay: { date: '2025-04-05', total: 350_000, count: 2 },
  daily: days('2025-04', 30),
  weekdays: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    total: weekday === 6 ? 350_000 : 20_000,
    average: weekday === 6 ? 87_500 : 5_000,
  })),
  topExpenses: [
    {
      id: 't1',
      date: '2025-04-05',
      amount: 300_000,
      note: 'Sepatu',
      category: null,
      wallet: WALLET,
    },
    { id: 't2', date: '2025-04-10', amount: 120_000, note: null, category: MAKAN, wallet: WALLET },
  ],
};

const COMPARE: CompareDTO = {
  type: 'EXPENSE',
  from: { month: '2025-03', income: 5_000_000, expense: 200_000, net: 4_800_000 },
  to: { month: '2025-04', income: 5_000_000, expense: 520_000, net: 4_480_000 },
  items: [
    {
      categoryId: null,
      name: 'Tanpa kategori',
      icon: 'circle-ellipsis',
      color: '#94A3B8',
      from: 0,
      to: 300_000,
      diff: 300_000,
      change: null,
    },
    {
      categoryId: 'cat_makan',
      name: 'Makan',
      icon: 'utensils',
      color: '#EA580C',
      from: 100_000,
      to: 220_000,
      diff: 120_000,
      change: 1.2,
    },
  ],
};

const YEARLY: YearlyReportDTO = {
  year: 2025,
  income: 15_000_000,
  expense: 820_000,
  net: 14_180_000,
  months: Array.from({ length: 12 }, (_, i) => {
    const month = `2025-${String(i + 1).padStart(2, '0')}`;
    const expense = month === '2025-03' ? 300_000 : month === '2025-04' ? 520_000 : 0;
    const income = month === '2025-03' || month === '2025-04' ? 7_500_000 : 0;
    return { month, income, expense, net: income - expense };
  }),
  averageMonthlyExpense: 68_333,
  monthsCounted: 12,
  topCategories: [
    {
      categoryId: 'cat_makan',
      name: 'Makan',
      icon: 'utensils',
      color: '#EA580C',
      total: 320_000,
      ratio: 0.39,
      count: 4,
    },
  ],
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function setup(path: string, { enabled = true }: { enabled?: boolean } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/features')) return json({ flags: { advanced_reports: enabled } });
    if (url.pathname.endsWith('/reports/monthly')) return json(MONTHLY);
    if (url.pathname.endsWith('/reports/compare')) return json(COMPARE);
    if (url.pathname.endsWith('/reports/yearly')) return json(YEARLY);
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <Routes>
            <Route path="/laporan" element={<ReportsPage />} />
            <Route path="/" element={<p>Beranda</p>} />
          </Routes>
          <LocationProbe />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { fetchMock };
}

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    downloadFile.mockClear();
  });

  it('menampilkan laporan bulanan, perbandingan kategori, dan mengunduh PDF', async () => {
    const user = userEvent.setup();
    const { fetchMock } = setup('/laporan?bulan=2025-04');

    expect(await screen.findByText(formatRupiah(17_333))).toBeInTheDocument();
    expect(screen.getByText('+160%')).toBeInTheDocument();
    expect(screen.getByText('dari 30 hari')).toBeInTheDocument();
    expect(screen.getByText(/2 transaksi/)).toBeInTheDocument();

    const compare = screen.getByRole('list', {
      name: 'Pengeluaran per kategori dibanding bulan lalu',
    });
    expect(within(compare).getByText('baru')).toBeInTheDocument();
    expect(within(compare).getByText('+120%')).toBeInTheDocument();
    expect(within(compare).getByRole('link', { name: /Makan/ })).toHaveAttribute(
      'href',
      '/transaksi?categoryId=cat_makan&from=2025-04-01&to=2025-04-30',
    );

    expect(screen.getByText(/paling besar di hari Sabtu/)).toBeInTheDocument();
    expect(screen.getByText('Sepatu')).toBeInTheDocument();

    const monthlyCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/reports/monthly'));
    expect(String(monthlyCall?.[0])).toContain('month=2025-04');

    await user.click(screen.getByRole('button', { name: /Unduh PDF/ }));
    expect(downloadFile).toHaveBeenCalledWith(
      '/export/report.pdf',
      { month: '2025-04' },
      'catatku-laporan-2025-04.pdf',
    );
    expect(await screen.findByText('Laporan PDF sudah diunduh')).toBeInTheDocument();
  });

  it('laporan tahunan: klik bulan membuka laporan bulanan bulan itu', async () => {
    const user = userEvent.setup();
    setup('/laporan?periode=tahunan&tahun=2025');

    expect(await screen.findByText(`Rata-rata ${formatRupiah(68_333)}/bulan`)).toBeInTheDocument();
    const months = screen.getByRole('list', { name: 'Ringkasan per bulan 2025' });
    expect(within(months).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Kategori pengeluaran terbesar')).toBeInTheDocument();

    await user.click(within(months).getByRole('button', { name: /^April/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/laporan?bulan=2025-04');
    expect(await screen.findByText(formatRupiah(17_333))).toBeInTheDocument();
  });

  it('kembali ke beranda bila fitur nonaktif', async () => {
    setup('/laporan', { enabled: false });
    expect(await screen.findByText('Beranda')).toBeInTheDocument();
  });
});
