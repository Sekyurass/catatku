import { type DebtDTO, toDateString, type WalletDTO } from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { DebtsPage } from './DebtsPage';

const today = toDateString();
const nextYear = Number(today.slice(0, 4)) + 1;

const debt = (patch: Partial<DebtDTO>): DebtDTO => ({
  id: 'd1',
  direction: 'PAYABLE',
  counterparty: 'Budi',
  principal: 600_000,
  interest: 60_000,
  total: 660_000,
  paid: 220_000,
  remaining: 440_000,
  startDate: today,
  dueDate: null,
  installments: 3,
  firstDueDate: `${nextYear}-01-15`,
  note: null,
  walletId: 'w-bca',
  wallet: { id: 'w-bca', name: 'BCA', color: '#0F766E' },
  settledAt: null,
  paymentCount: 1,
  createdAt: new Date().toISOString(),
  ...patch,
});

const DEBTS = [
  debt({}),
  debt({
    id: 'd2',
    direction: 'RECEIVABLE',
    counterparty: 'Sari',
    principal: 300_000,
    interest: 0,
    total: 300_000,
    paid: 0,
    remaining: 300_000,
    installments: null,
    firstDueDate: null,
    dueDate: `${nextYear}-03-01`,
    walletId: null,
    wallet: null,
  }),
];

const wallet = (id: string, name: string): WalletDTO => ({
  id,
  name,
  type: 'BANK',
  initialBalance: 0,
  balance: 1_000_000,
  color: '#0F766E',
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastUsedAt: null,
});

const json = (body: unknown, status = 201) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup({ path = '/anggaran/utang', debts = DEBTS } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/features')) return json({ flags: { debts: true } }, 200);
    if (url.pathname.endsWith('/wallets')) {
      return json({ items: [wallet('w-gopay', 'GoPay'), wallet('w-bca', 'BCA')] }, 200);
    }
    const payments = url.pathname.match(/\/debts\/(\w+)\/payments$/);
    if (payments && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { amount: number };
      const d = debts.find((x) => x.id === payments[1])!;
      return json({ ...d, paid: d.paid + body.amount, remaining: d.remaining - body.amount });
    }
    if (payments) return json({ items: [] }, 200);
    if (url.pathname.endsWith('/categories')) {
      return json(
        {
          items: [
            {
              id: 'c-food',
              name: 'Makan',
              type: 'EXPENSE',
              icon: 'utensils',
              color: '#EA580C',
              isDefault: true,
              archivedAt: null,
            },
          ],
        },
        200,
      );
    }
    if (url.pathname.endsWith('/debts/split')) {
      return json({ transactionId: 't1', debts: [] });
    }
    if (url.pathname.endsWith('/debts') && init?.method === 'POST') {
      return json(debt({ id: 'd3', ...(JSON.parse(String(init.body)) as Partial<DebtDTO>) }));
    }
    if (url.pathname.endsWith('/debts')) return json({ items: debts }, 200);
    return json({ error: { code: 'NOT_FOUND', message: 'x' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <Routes>
            <Route path="/anggaran/utang" element={<DebtsPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

const posted = (fetchMock: ReturnType<typeof setup>) => {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
  return {
    url: String(call[0]),
    body: JSON.parse(String(call[1]!.body)) as Record<string, unknown>,
    headers: call[1]!.headers as Record<string, string>,
  };
};

describe('DebtsPage', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('ringkasan sisa utang & piutang; tab memisahkan arah', async () => {
    setup();
    expect(await screen.findByRole('heading', { level: 1, name: 'Rencana' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Utang' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect((await screen.findByText('Sisa utang')).nextElementSibling).toHaveTextContent(
      'Rp 440.000',
    );
    expect(screen.getByText('Sisa piutang').nextElementSibling).toHaveTextContent('Rp 300.000');

    const budi = (await screen.findByRole('button', { name: 'Lihat Utang ke Budi' })).closest(
      'li',
    )!;
    expect(within(budi).getByText(/^Cicilan 2\/3 Rp 220\.000 jatuh tempo/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Lihat Piutang dari Sari' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Piutang saya' }));
    expect(screen.getByRole('button', { name: 'Lihat Piutang dari Sari' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Terima pembayaran dari Sari' })).toBeInTheDocument();
  });

  it('?debt= membuka detail dengan jadwal cicilan', async () => {
    setup({ path: '/anggaran/utang?debt=d1' });
    const dialog = await screen.findByRole('dialog', { name: 'Utang ke Budi' });
    expect(within(dialog).getByText('Jadwal cicilan')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Rp 220.000')).toHaveLength(3);
    expect(within(dialog).getByText('Lunas')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Belum')).toHaveLength(2);
  });

  it('bayar: nominal cicilan berikutnya, dompet utang terpilih, Idempotency-Key', async () => {
    const fetchMock = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Bayar utang ke Budi' }));
    const dialog = await screen.findByRole('dialog', { name: 'Utang ke Budi' });
    expect(within(dialog).getByRole('combobox', { name: 'Bayar dari dompet' })).toHaveTextContent(
      'BCA',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Simpan pembayaran' }));

    await waitFor(() => expect(posted(fetchMock).url).toContain('/debts/d1/payments'));
    const { body, headers } = posted(fetchMock);
    expect(body).toEqual({ amount: 220_000, date: today, walletId: 'w-bca' });
    expect(headers['Idempotency-Key']).toMatch(/^[\w-]{8,}$/);
    expect(await screen.findByText('Pembayaran Rp 220.000 dicatat')).toBeInTheDocument();
  });

  it('catat utang sekali bayar tanpa dompet', async () => {
    const fetchMock = setup({ debts: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Catat utang/piutang' }));
    const dialog = await screen.findByRole('dialog', { name: 'Catat utang/piutang' });
    await userEvent.type(within(dialog).getByLabelText('Pinjam dari'), 'Andi');
    await userEvent.type(within(dialog).getByLabelText('Jumlah pinjaman (pokok)'), '150000');
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Uang pinjaman masuk ke' }));
    await userEvent.click(await screen.findByRole('option', { name: /Tanpa dompet/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(posted(fetchMock).url).toMatch(/\/debts$/));
    expect(posted(fetchMock).body).toEqual({
      direction: 'PAYABLE',
      counterparty: 'Andi',
      principal: 150_000,
      interest: 0,
      startDate: today,
      dueDate: null,
      installments: null,
      firstDueDate: null,
      note: null,
      walletId: null,
    });
  });

  it('bagi tagihan: rata otomatis, bisa diubah per orang', async () => {
    const fetchMock = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Bagi tagihan' }));
    const dialog = await screen.findByRole('dialog', { name: 'Bagi tagihan' });
    await userEvent.type(within(dialog).getByLabelText('Total tagihan'), '300000');
    await userEvent.type(within(dialog).getByLabelText('Nama teman 1'), 'Budi');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tambah teman' }));
    await userEvent.type(within(dialog).getByLabelText('Nama teman 2'), 'Sari');
    expect(within(dialog).getByLabelText('Bagian saya')).toHaveValue('100.000');
    expect(within(dialog).getByLabelText('Bagian Sari')).toHaveValue('100.000');

    const budi = within(dialog).getByLabelText('Bagian Budi');
    await userEvent.clear(budi);
    await userEvent.type(budi, '150000');
    expect(within(dialog).getByText('Lebih Rp 50.000 dari total')).toBeInTheDocument();
    const sari = within(dialog).getByLabelText('Bagian Sari');
    await userEvent.clear(sari);
    await userEvent.type(sari, '50000');

    await userEvent.click(within(dialog).getByRole('radio', { name: /Makan/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(posted(fetchMock).url).toMatch(/\/debts\/split$/));
    expect(posted(fetchMock).body).toMatchObject({
      total: 300_000,
      categoryId: 'c-food',
      myShare: 100_000,
      participants: [
        { name: 'Budi', amount: 150_000 },
        { name: 'Sari', amount: 50_000 },
      ],
      dueDate: null,
      note: null,
    });
    expect(await screen.findByText('Tagihan dibagi ke 2 teman')).toBeInTheDocument();
  });
});
