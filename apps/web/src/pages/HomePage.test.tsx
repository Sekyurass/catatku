import {
  type CategoryBreakdownDTO,
  currentMonth,
  formatRupiah,
  type InsightDTO,
  monthRange,
  type NotificationDTO,
  type PendingOccurrenceDTO,
  type SummaryDTO,
  type TransactionDTO,
  type TransactionTemplateDTO,
  type TrendDTO,
  type WalletDTO,
} from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenterProvider } from '../components/notifications/NotificationCenter';
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
  recurringRuleId: null,
  debtId: null,
  tags: [],
  attachmentCount: 0,
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

const PENDING: PendingOccurrenceDTO = {
  id: 'occ1',
  ruleId: 'rule1',
  date: `${month}-05`,
  type: 'EXPENSE',
  amount: 350_000,
  note: 'Tagihan listrik',
  wallet: { id: 'w1', name: 'Tunai', color: '#0F766E' },
  category: { id: 'cat_tagihan', name: 'Tagihan', icon: 'receipt', color: '#7C3AED' },
};

const NOTIFICATIONS: NotificationDTO[] = [
  {
    id: 'n1',
    type: 'RECURRING_PENDING',
    title: 'Listrik menunggu konfirmasi',
    body: 'Rp350.000 jatuh tempo hari ini.',
    link: '/berulang',
    readAt: null,
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  },
  {
    id: 'n2',
    type: 'REMINDER',
    title: 'Sudah catat hari ini?',
    body: 'Belum ada transaksi hari ini.',
    link: '/?catat=1',
    readAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 26 * 3_600_000).toISOString(),
  },
];

const TEMPLATES: TransactionTemplateDTO[] = [
  {
    id: 'tpl1',
    name: 'Kopi susu',
    type: 'EXPENSE',
    amount: 25_000,
    walletId: 'w1',
    wallet: { id: 'w1', name: 'Tunai', color: '#0F766E' },
    categoryId: 'cat_makan',
    category: { id: 'cat_makan', name: 'Makan', icon: 'utensils', color: '#EA580C' },
    usable: true,
  },
  {
    id: 'tpl2',
    name: 'Makan siang',
    type: 'EXPENSE',
    amount: null,
    walletId: 'w1',
    wallet: { id: 'w1', name: 'Tunai', color: '#0F766E' },
    categoryId: 'cat_makan',
    category: { id: 'cat_makan', name: 'Makan', icon: 'utensils', color: '#EA580C' },
    usable: true,
  },
  {
    id: 'tpl3',
    name: 'Dompet lama',
    type: 'EXPENSE',
    amount: 10_000,
    walletId: 'w9',
    wallet: { id: 'w9', name: 'Arsip', color: '#000000' },
    categoryId: 'cat_makan',
    category: { id: 'cat_makan', name: 'Makan', icon: 'utensils', color: '#EA580C' },
    usable: false,
  },
];

const HIBURAN = { id: 'cat_hiburan', name: 'Hiburan', icon: 'clapperboard', color: '#8B5CF6' };

const SUBSCRIPTION: InsightDTO = {
  id: 'new_subscription:netflix',
  kind: 'new_subscription',
  priority: 'medium',
  tone: 'info',
  title: 'Sepertinya ada langganan: Netflix',
  body: 'Rp 54.000 tercatat 2 kali, sekitar sebulan sekali.',
  detail: {
    merchant: 'Netflix',
    amount: 54_000,
    averageGapDays: 31,
    lastDate: `${month}-02`,
    nextDate: `${month}-28`,
    category: HIBURAN,
    walletId: 'w1',
    note: 'Netflix',
    occurrences: [
      { id: 'n2', date: `${month}-02`, amount: 54_000, note: 'Netflix' },
      { id: 'n1', date: '2026-09-02', amount: 54_000, note: 'Netflix' },
    ],
  },
};

const INSIGHTS: InsightDTO[] = [
  {
    id: `budget_pace:${month}:cat_makan`,
    kind: 'budget_pace',
    priority: 'high',
    tone: 'warning',
    title: 'Anggaran Makan bisa habis sekitar 20 Okt',
    body: 'Dengan laju sekarang, totalnya sekitar Rp 1.240.000 bulan ini.',
    detail: {
      category: TX.category!,
      month,
      limit: 1_000_000,
      spent: 600_000,
      projected: 1_240_000,
      daysElapsed: 15,
      daysInMonth: 31,
      runOutDate: `${month}-20`,
      dailyAllowance: 23_529,
    },
  },
  SUBSCRIPTION,
  ...['a', 'b'].map((k): InsightDTO => ({
    id: `unusual_expense:${k}`,
    kind: 'unusual_expense',
    priority: 'low',
    tone: 'info',
    title: `Pengeluaran ${k} lebih besar dari biasanya`,
    body: 'Rp 600.000 pada 10 Okt.',
    detail: {
      category: TX.category!,
      transaction: { id: k, date: `${month}-10`, amount: 600_000, note: null },
      median: 100_000,
      multiple: 6,
      sampleSize: 5,
    },
  })),
];

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function setup({
  wallets = [WALLET],
  recurring = false,
  reminders = false,
  pending = [PENDING],
  templates = false,
  insights = null,
}: {
  wallets?: WalletDTO[];
  recurring?: boolean;
  reminders?: boolean;
  pending?: PendingOccurrenceDTO[];
  templates?: boolean;
  insights?: InsightDTO[] | null;
} = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/features'))
      return json({
        flags: {
          recurring_transactions: recurring,
          reminders,
          templates,
          insights: insights !== null,
        },
      });
    if (url.pathname.includes('/insights/')) return new Response(null, { status: 204 });
    if (url.pathname.endsWith('/insights')) return json({ items: insights ?? [] });
    if (url.pathname.endsWith('/events')) return new Response(null, { status: 204 });
    if (init?.method === 'POST' && url.pathname.endsWith('/recurring'))
      return json({ id: 'rule9' });
    if (url.pathname.endsWith('/categories'))
      return json({
        items: [{ ...HIBURAN, type: 'EXPENSE', isDefault: true, archivedAt: null }],
      });
    if (url.pathname.endsWith('/templates')) return json({ items: TEMPLATES });
    if (init?.method === 'POST' && url.pathname.endsWith('/use')) return json({ id: 't7' });
    if (init?.method === 'DELETE' && url.pathname.includes('/transactions/'))
      return new Response(null, { status: 204 });
    if (url.pathname.endsWith('/notifications/unread-count')) return json({ count: 1 });
    if (url.pathname.endsWith('/notifications'))
      return json({ items: NOTIFICATIONS, nextCursor: null, unreadCount: 1 });
    if (init?.method === 'POST' && url.pathname.includes('/notifications/'))
      return new Response(null, { status: 204 });
    if (url.pathname.endsWith('/recurring/pending')) return json({ items: pending });
    if (init?.method === 'POST' && url.pathname.includes('/recurring/pending/')) {
      return url.pathname.endsWith('/confirm')
        ? json({ transactionId: 't9' })
        : new Response(null, { status: 204 });
    }
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
            <NotificationCenterProvider>
              <HomePage />
              <LocationProbe />
            </NotificationCenterProvider>
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

  it('total saldo bisa disembunyikan dan rincian dompet dibuka di kartu', async () => {
    setup({ wallets: [WALLET, { ...WALLET, id: 'w2', name: 'BCA', balance: 0 }] });
    const summary = within(await screen.findByRole('region', { name: 'Ringkasan bulan ini' }));

    const toggle = summary.getByRole('button', { name: 'Dompet' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = within(summary.getByRole('dialog', { name: 'Saldo per dompet' }));
    expect(panel.getByText('BCA')).toBeInTheDocument();
    expect(panel.getByText(formatRupiah(0))).toBeInTheDocument();
    expect(panel.getByRole('link', { name: /Kelola dompet/ })).toHaveAttribute('href', '/dompet');
    await userEvent.keyboard('{Escape}');
    expect(summary.queryByRole('dialog')).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();

    await userEvent.click(summary.getByRole('button', { name: 'Sembunyikan saldo' }));
    expect(summary.queryByText(formatRupiah(1_410_000))).not.toBeInTheDocument();
    expect(localStorage.getItem('catatku_hide_balance')).toBe('1');
    await userEvent.click(toggle);
    expect(
      within(summary.getByRole('dialog', { name: 'Saldo per dompet' })).getAllByText('Rp ••••••'),
    ).toHaveLength(2);

    await userEvent.click(summary.getByRole('button', { name: 'Tampilkan saldo' }));
    expect(summary.getAllByText(formatRupiah(1_410_000)).length).toBeGreaterThan(0);
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
    expect(screen.getByRole('link', { name: 'Buat dompet' })).toHaveAttribute(
      'href',
      '/mulai?langkah=2',
    );
  });

  it('tidak menampilkan kartu konfirmasi bila fitur berulang mati', async () => {
    const { fetchMock } = setup();
    await screen.findByRole('region', { name: 'Ringkasan bulan ini' });
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/features'))).toBe(true),
    );
    expect(screen.queryByText(/Menunggu konfirmasi/)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/recurring'))).toBe(false);
  });

  it('mencatat kejadian berulang dengan nominal yang disesuaikan', async () => {
    const { fetchMock } = setup({ recurring: true });
    expect(await screen.findByText('Menunggu konfirmasi (1)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Catat Tagihan listrik' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Catat transaksi berulang' }));
    const amount = dialog.getByLabelText('Nominal');
    await userEvent.clear(amount);
    await userEvent.type(amount, '412500');
    await userEvent.click(dialog.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/occ1/confirm'));
      expect(call?.[1]?.body).toBe(JSON.stringify({ amount: 412_500 }));
    });
  });

  it('tidak menampilkan lonceng bila fitur pengingat mati', async () => {
    const { fetchMock } = setup();
    await screen.findByRole('region', { name: 'Ringkasan bulan ini' });
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/features'))).toBe(true),
    );
    expect(screen.queryByRole('button', { name: /^Notifikasi/ })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/notifications'))).toBe(false);
  });

  it('lonceng menampilkan jumlah belum dibaca, membuka daftar, dan menandai dibaca', async () => {
    const { fetchMock } = setup({ reminders: true });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Notifikasi, 1 belum dibaca' }),
    );

    const dialog = within(await screen.findByRole('dialog', { name: 'Notifikasi' }));
    const list = within(await dialog.findByRole('list', { name: 'Daftar notifikasi' }));
    expect(list.getAllByRole('listitem')).toHaveLength(2);
    expect(list.getByText('5 menit yang lalu')).toBeInTheDocument();
    expect(list.getAllByText('Belum dibaca')).toHaveLength(1);
    expect(dialog.getByRole('link', { name: 'Atur pengingat & notifikasi' })).toHaveAttribute(
      'href',
      '/pengingat',
    );

    await userEvent.click(list.getByRole('button', { name: /Listrik menunggu konfirmasi/ }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, init]) => String(u).includes('/notifications/n1/read') && init?.method === 'POST',
        ),
      ).toBe(true),
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/berulang');
    expect(screen.queryByRole('dialog', { name: 'Notifikasi' })).not.toBeInTheDocument();
  });

  it('menandai semua notifikasi dibaca', async () => {
    const { fetchMock } = setup({ reminders: true });
    await userEvent.click(await screen.findByRole('button', { name: /^Notifikasi/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Notifikasi' }));
    await userEvent.click(await dialog.findByRole('button', { name: 'Tandai semua dibaca' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u]) => String(u).includes('/notifications/read-all')),
      ).toBe(true),
    );
  });

  it('tidak menampilkan cepat catat bila fitur template mati', async () => {
    const { fetchMock } = setup();
    await screen.findByRole('region', { name: 'Ringkasan bulan ini' });
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/features'))).toBe(true),
    );
    expect(screen.queryByRole('group', { name: 'Cepat catat' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/templates'))).toBe(false);
  });

  it('satu tap template mencatat hari ini dan bisa diurungkan', async () => {
    const { fetchMock } = setup({ templates: true });
    const chips = within(await screen.findByRole('group', { name: 'Cepat catat' }));
    expect(chips.queryByRole('button', { name: /Dompet lama/ })).not.toBeInTheDocument();

    await userEvent.click(chips.getByRole('button', { name: /Kopi susu/ }));
    expect(
      await screen.findByText(`Kopi susu ${formatRupiah(25_000)} tercatat`),
    ).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/templates/tpl1/use'))!;
    expect(JSON.parse(String(init!.body))).toEqual({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect((init!.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^[\w-]{8,}$/);

    await userEvent.click(screen.getByRole('button', { name: 'Urungkan' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) => String(u).includes('/transactions/t7') && i?.method === 'DELETE',
        ),
      ).toBe(true),
    );
  });

  it('template tanpa nominal membuka form yang sudah terisi', async () => {
    const { fetchMock } = setup({ templates: true });
    const chips = within(await screen.findByRole('group', { name: 'Cepat catat' }));
    await userEvent.click(chips.getByRole('button', { name: /Makan siang/ }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Catat transaksi' }));
    expect(await dialog.findByLabelText('Catatan (opsional)')).toHaveValue('Makan siang');
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/use'))).toBe(false);
  });

  it('insight: maks 3 kartu, lihat semua, sembunyikan lalu urungkan', async () => {
    const { fetchMock } = setup({ insights: INSIGHTS });
    const list = within(await screen.findByRole('list', { name: 'Daftar insight' }));
    expect(list.getAllByRole('article')).toHaveLength(3);

    await userEvent.click(screen.getByRole('button', { name: 'Lihat semua (4)' }));
    const all = within(await screen.findByRole('dialog', { name: 'Semua insight' }));
    expect(all.getAllByRole('article')).toHaveLength(4);
    await userEvent.keyboard('{Escape}');

    await userEvent.click(
      list.getByRole('button', { name: `Sembunyikan insight: ${INSIGHTS[0]!.title}` }),
    );
    expect(list.queryByText(INSIGHTS[0]!.title)).not.toBeInTheDocument();
    const dismissUrl = `/insights/${encodeURIComponent(INSIGHTS[0]!.id)}/dismiss`;
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) => String(u).includes(dismissUrl) && i?.method === 'POST',
        ),
      ).toBe(true),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Urungkan' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) => String(u).includes(dismissUrl) && i?.method === 'DELETE',
        ),
      ).toBe(true),
    );
  });

  it('detail langganan bisa langsung dijadikan transaksi berulang', async () => {
    const { fetchMock } = setup({ insights: [SUBSCRIPTION], recurring: true, pending: [] });
    await userEvent.click(
      await screen.findByRole('button', { name: `Lihat detail: ${SUBSCRIPTION.title}` }),
    );
    const detail = within(await screen.findByRole('dialog', { name: SUBSCRIPTION.title }));
    expect(detail.getByText('31 hari')).toBeInTheDocument();
    expect(detail.getByText('Cara menghitung')).toBeInTheDocument();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/events'));
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        name: 'insight_opened',
        kind: 'new_subscription',
      });
    });

    await userEvent.click(detail.getByRole('button', { name: 'Jadikan transaksi berulang' }));
    const form = within(await screen.findByRole('dialog', { name: 'Transaksi berulang baru' }));
    expect(await form.findByLabelText('Catatan (opsional)')).toHaveValue('Netflix');
    await userEvent.click(form.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([u, i]) => String(u).endsWith('/recurring') && i?.method === 'POST',
      );
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
        type: 'EXPENSE',
        amount: 54_000,
        walletId: 'w1',
        categoryId: 'cat_hiburan',
        note: 'Netflix',
        frequency: 'MONTHLY',
        startDate: `${month}-28`,
      });
    });
  });

  it('melewati kejadian berulang', async () => {
    const { fetchMock } = setup({ recurring: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Lewati Tagihan listrik' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/occ1/skip'))).toBe(true),
    );
  });
});
