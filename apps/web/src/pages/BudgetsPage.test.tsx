import {
  type BudgetDTO,
  type BudgetMonthDTO,
  currentMonth,
  shiftMonth,
  type TransactionDTO,
} from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickAddProvider } from '../components/transactions/QuickAdd';
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
  since: limitAmount > 0 ? shiftMonth(month, -1) : null,
  endsThisMonth: false,
  limitAmount,
  spent,
  txCount: spent > 0 ? 2 : 0,
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

const tx = (id: string, amount: number, note: string | null, day: string): TransactionDTO => ({
  id,
  type: 'EXPENSE',
  amount: -amount,
  date: `${month}-${day}`,
  note,
  walletId: 'w1',
  wallet: { id: 'w1', name: 'Tunai', color: '#0F766E' },
  categoryId: 'cat_makan',
  category: { id: 'cat_makan', name: 'Makan', icon: 'utensils', color: '#EA580C' },
  counterpartWallet: null,
  transferGroupId: null,
  recurringRuleId: null,
  tags: [{ id: 'tg1', name: 'Kantor' }],
  attachmentCount: 0,
  deletedAt: null,
  createdAt: `${month}-${day}T05:00:00.000Z`,
  updatedAt: `${month}-${day}T05:00:00.000Z`,
});

const MAKAN_TX = [
  tx('t1', 47_500, 'Indomaret: Indomie Goreng Rp6.200, Aqua 600ml, Roti Tawar', '05'),
  tx('t2', 802_500, null, '02'),
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup() {
  let data = DATA;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/budgets') && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as {
        items: { categoryId: string; limitAmount: number }[];
      };
      const [change] = body.items;
      data = {
        ...data,
        items: data.items.map((i) =>
          i.categoryId === change!.categoryId
            ? item(i.categoryId, i.category.name, change!.limitAmount, i.spent, 'ok')
            : i,
        ),
      };
      return json(data);
    }
    if (url.pathname.endsWith('/budgets/custom') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { name: string; limitAmount: number };
      if (body.name.toLowerCase() === 'makan') {
        const message = 'Kategori Makan sudah ada. Atur anggarannya dari daftar.';
        return json({ error: { code: 'CONFLICT', message, fields: { name: message } } }, 409);
      }
      data = {
        ...data,
        items: [item('cat_baru', body.name, body.limitAmount, 0, 'ok'), ...data.items],
      };
      return json(data, 201);
    }
    if (url.pathname.endsWith('/budgets')) {
      const m = url.searchParams.get('month')!;
      return json(m === month ? data : { month: m, items: [], totalLimit: 0, totalSpent: 0 });
    }
    if (url.pathname.endsWith('/transactions')) {
      return json({ items: MAKAN_TX, nextCursor: null });
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
          <QuickAddProvider>
            <BudgetsPage />
          </QuickAddProvider>
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
    expect(within(transport).getByText((t) => t.startsWith('Berlanjut sejak'))).toBeInTheDocument();

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
        items: [{ categoryId: 'cat_belanja', limitAmount: 300_000, scope: 'onward' }],
      });
    });
    expect(
      await screen.findByText((t) => t.startsWith('Anggaran Belanja berlaku mulai')),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Ubah anggaran Belanja' }),
    ).toBeInTheDocument();
  });

  it('"Hanya bulan ini" dikirim sebagai scope month', async () => {
    const fetchMock = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Ubah anggaran Makan' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anggaran Makan' });
    await userEvent.click(within(dialog).getByLabelText('Hanya bulan ini'));
    expect(
      within(dialog).getByText((t) => t.includes('Bulan berikutnya tetap memakai')),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Kosongkan bulan ini saja' }),
    ).toBeInTheDocument();

    const input = within(dialog).getByLabelText('Batas per bulan');
    await userEvent.clear(input);
    await userEvent.type(input, '1500000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
      expect(JSON.parse(String(put![1]!.body)).items).toEqual([
        { categoryId: 'cat_makan', limitAmount: 1_500_000, scope: 'month' },
      ]);
    });
    expect(
      await screen.findByText((t) => t.startsWith('Anggaran Makan khusus')),
    ).toBeInTheDocument();
  });

  it('anggaran dengan nama sendiri', async () => {
    const fetchMock = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Buat anggaran sendiri' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anggaran baru' });
    const submit = within(dialog).getByRole('button', { name: 'Simpan anggaran' });

    await userEvent.click(submit);
    expect(within(dialog).getByText('Nama anggaran wajib diisi')).toBeInTheDocument();
    expect(within(dialog).getByText('Masukkan batas lebih dari 0')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Nama anggaran'), 'Makan');
    await userEvent.type(within(dialog).getByLabelText('Batas per bulan'), '300000');
    await userEvent.click(submit);
    expect(
      await within(dialog).findByText('Kategori Makan sudah ada. Atur anggarannya dari daftar.'),
    ).toBeInTheDocument();

    const name = within(dialog).getByLabelText('Nama anggaran');
    await userEvent.clear(name);
    await userEvent.type(name, 'Jajan Kopi');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Kopi' }));
    await userEvent.click(submit);

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
      expect(JSON.parse(String(posts.at(-1)![1]!.body))).toMatchObject({
        month,
        name: 'Jajan Kopi',
        icon: 'coffee',
        limitAmount: 300_000,
        scope: 'onward',
      });
    });
    expect(
      await screen.findByText((t) => t.startsWith('Anggaran Jajan Kopi berlaku mulai')),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Ubah anggaran Jajan Kopi' }),
    ).toBeInTheDocument();
  });

  it('rincian pengeluaran per anggaran → detail transaksi → Ubah', async () => {
    const fetchMock = setup();
    await screen.findByRole('button', { name: 'Ubah anggaran Makan' });
    expect(screen.queryAllByText('Belum ada pengeluaran bulan ini')).toHaveLength(0);

    const toggle = screen.getAllByRole('button', { name: /Rincian pengeluaran · 2 transaksi/ })[1]!;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const list = await screen.findByRole('list', { name: /^Transaksi Makan/ });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Tanpa catatan')).toBeInTheDocument();
    const query = new URL(
      String(fetchMock.mock.calls.find(([u]) => String(u).includes('/transactions'))![0]),
      'http://localhost',
    ).searchParams;
    expect(query.get('categoryId')).toBe('cat_makan');
    expect(query.get('type')).toBe('EXPENSE');
    expect(query.get('from')).toBe(`${month}-01`);

    await userEvent.click(within(list).getByRole('button', { name: /Indomaret/ }));
    const detail = await screen.findByRole('dialog', { name: 'Detail transaksi' });
    expect(within(detail).getByText('Rincian dari Indomaret')).toBeInTheDocument();
    expect(within(detail).getByText('· 3 barang')).toBeInTheDocument();
    expect(within(detail).getByText('Aqua 600ml')).toBeInTheDocument();
    const indomie = within(detail).getByText('Indomie Goreng').closest('li')!;
    expect(within(indomie).getByText('Rp 6.200')).toBeInTheDocument();
    expect(within(detail).getByText('#Kantor')).toBeInTheDocument();

    await userEvent.click(within(detail).getByRole('button', { name: 'Ubah' }));
    expect(await screen.findByRole('dialog', { name: 'Ubah transaksi' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Detail transaksi' })).not.toBeInTheDocument();
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
