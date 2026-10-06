import { type BudgetDTO, type BudgetMonthDTO, currentMonth, shiftMonth } from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { BudgetsPage } from './BudgetsPage';

const month = currentMonth();

const item = (
  categoryId: string,
  name: string,
  limitAmount: number,
  spent: number,
  status: BudgetDTO['status'],
): BudgetDTO => ({
  id: limitAmount > 0 ? `b-${categoryId}` : null,
  categoryId,
  category: { id: categoryId, name, icon: 'utensils', color: '#EA580C' },
  month,
  limitAmount,
  spent,
  remaining: limitAmount - spent,
  ratio: limitAmount > 0 ? spent / limitAmount : 0,
  status,
});

const DATA: BudgetMonthDTO = {
  month,
  items: [
    item('cat_hiburan', 'Hiburan', 200_000, 260_000, 'over'),
    item('cat_makan', 'Makan', 1_000_000, 850_000, 'warning'),
    item('cat_transport', 'Transport', 400_000, 120_000, 'ok'),
    item('cat_belanja', 'Belanja', 0, 75_000, 'ok'),
  ],
  totalLimit: 1_600_000,
  totalSpent: 1_230_000,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(data: BudgetMonthDTO = DATA) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/budgets') && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as {
        items: { categoryId: string; limitAmount: number }[];
      };
      const [change] = body.items;
      return json({
        ...data,
        items: data.items.map((i) =>
          i.categoryId === change!.categoryId
            ? item(i.categoryId, i.category.name, change!.limitAmount, i.spent, 'ok')
            : i,
        ),
      });
    }
    if (url.pathname.endsWith('/budgets')) {
      const m = url.searchParams.get('month')!;
      return json(m === month ? data : { month: m, items: [], totalLimit: 0, totalSpent: 0 });
    }
    return json({ error: { code: 'NOT_FOUND', message: 'x' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/anggaran']}>
        <ToastProvider>
          <BudgetsPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe('BudgetsPage', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('status selalu disertai teks: aman, hampir habis, terlampaui', async () => {
    setup();
    const makan = await screen.findByRole('button', { name: 'Ubah anggaran Makan' });
    expect(within(makan).getByText('Hampir habis')).toBeInTheDocument();
    expect(within(makan).getByText('Sisa Rp 150.000 · 85%')).toBeInTheDocument();

    const hiburan = screen.getByRole('button', { name: 'Ubah anggaran Hiburan' });
    expect(within(hiburan).getByText('Terlampaui')).toBeInTheDocument();
    expect(within(hiburan).getByText('Lewat Rp 60.000 · 130%')).toBeInTheDocument();

    const transport = screen.getByRole('button', { name: 'Ubah anggaran Transport' });
    expect(within(transport).getByText('Aman')).toBeInTheDocument();

    expect(screen.getByRole('progressbar', { name: 'Anggaran Hiburan terpakai' })).toHaveAttribute(
      'aria-valuetext',
      '130%',
    );
    // Total: sisa 370.000 dari 1,6 jt.
    expect(screen.getByText('Sisa Rp 370.000')).toBeInTheDocument();
  });

  it('kategori tanpa anggaran bisa langsung diatur lewat dialog', async () => {
    const fetchMock = setup();
    await userEvent.click(await screen.findByRole('button', { name: /Belanja/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Anggaran Belanja' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }));
    expect(within(dialog).getByText('Masukkan batas lebih dari 0')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Batas per bulan'), '300000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
      expect(JSON.parse(String(put![1]!.body))).toEqual({
        month,
        items: [{ categoryId: 'cat_belanja', limitAmount: 300_000 }],
      });
    });
    expect(await screen.findByText('Anggaran disimpan')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Ubah anggaran Belanja' }),
    ).toBeInTheDocument();
  });

  it('pindah bulan dan state kosong', async () => {
    const fetchMock = setup();
    await screen.findByRole('button', { name: 'Ubah anggaran Makan' });
    await userEvent.click(screen.getByRole('button', { name: 'Bulan sebelumnya' }));
    expect(
      await screen.findByText((text) => text.startsWith('Belum ada anggaran untuk')),
    ).toBeInTheDocument();
    const months = fetchMock.mock.calls.map(([input]) =>
      new URL(String(input), 'http://localhost').searchParams.get('month'),
    );
    expect(months).toContain(shiftMonth(month, -1));
  });
});
