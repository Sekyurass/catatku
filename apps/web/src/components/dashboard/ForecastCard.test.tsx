import { computeForecast, type ForecastDTO } from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForecastCard } from './ForecastCard';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const days = (n: number, amount: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.parse('2025-04-10T00:00:00Z') - (i + 1) * 86_400_000)
      .toISOString()
      .slice(0, 10),
    amount: amount(i),
  }));

function setup(forecast: ForecastDTO) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/reports/forecast')
        ? json(forecast)
        : new Response(null, { status: 404 }),
    ),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ForecastCard />
    </QueryClientProvider>,
  );
}

describe('ForecastCard', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('menampilkan rentang, rincian, dan cara menghitung', async () => {
    setup(
      computeForecast({
        today: '2025-04-10',
        balance: 3_000_000,
        expenses: days(30, (i) => (i < 7 ? 120_000 : 60_000)),
        firstActivityDate: '2025-01-01',
        upcoming: [
          {
            date: '2025-04-25',
            type: 'EXPENSE',
            amount: 400_000,
            note: 'Internet',
            category: null,
            status: 'scheduled',
          },
          {
            date: '2025-04-05',
            type: 'EXPENSE',
            amount: 150_000,
            note: null,
            category: { id: 'c', name: 'Streaming', icon: 'tv', color: '#000' },
            status: 'pending',
          },
        ],
      }),
    );
    // 3jt − 550rb − 120rb×20 = 50rb; 3jt − 550rb − 60rb×20 = 1,25jt
    expect(
      await screen.findByLabelText('antara Rp 50.000 sampai Rp 1.250.000'),
    ).toBeInTheDocument();
    expect(screen.getByText('Sisa 20 hari')).toBeInTheDocument();
    expect(screen.getByText(/cukup sampai akhir bulan/)).toBeInTheDocument();
    expect(screen.getByText('Tagihan berulang (2)')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Cara menghitung'));
    expect(screen.getByText(/minggu paling boros \(Rp 120\.000\/hari\)/)).toBeVisible();
    const list = screen.getByRole('list', { name: 'Transaksi terjadwal sampai akhir bulan' });
    expect(list).toHaveTextContent('Streaming · menunggu konfirmasi');
    expect(list).toHaveTextContent('Internet');
  });

  it('saldo diperkirakan kurang: pesan peringatan dengan angka minus', async () => {
    setup(
      computeForecast({
        today: '2025-04-10',
        balance: 500_000,
        expenses: days(30, () => 100_000),
        firstActivityDate: '2025-01-01',
        upcoming: [],
      }),
    );
    expect(await screen.findByText(/kurang sekitar Rp 1\.500\.000/)).toBeInTheDocument();
    expect(screen.getByLabelText('-Rp 1.500.000')).toBeInTheDocument();
  });

  it('data belum cukup: menjelaskan kapan perkiraan muncul', async () => {
    setup(
      computeForecast({
        today: '2025-04-10',
        balance: 500_000,
        expenses: [],
        firstActivityDate: '2025-04-07',
        upcoming: [],
      }),
    );
    expect(await screen.findByText(/minimal 7 hari.*baru 3 hari/)).toBeInTheDocument();
    expect(screen.queryByText('Cara menghitung')).not.toBeInTheDocument();
  });
});
