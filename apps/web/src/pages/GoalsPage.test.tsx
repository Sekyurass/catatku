import {
  currentMonth,
  type GoalDTO,
  monthRange,
  shiftMonth,
  toDateString,
  type WalletDTO,
} from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { GoalsPage } from './GoalsPage';

const month = currentMonth();
const today = toDateString();

const goal = (patch: Partial<GoalDTO>): GoalDTO => ({
  id: 'g1',
  name: 'Liburan',
  targetAmount: 3_000_000,
  deadline: monthRange(shiftMonth(month, 2)).end,
  icon: 'plane',
  color: '#2563EB',
  walletId: 'w-tab',
  wallet: { id: 'w-tab', name: 'Tabungan', color: '#0F766E', archivedAt: null },
  saved: 0,
  savedThisMonth: 0,
  contributionCount: 0,
  createdAt: new Date().toISOString(),
  ...patch,
});

const GOALS = [
  goal({ id: 'g1', name: 'Liburan', saved: 400_000, savedThisMonth: 400_000 }),
  goal({ id: 'g2', name: 'Dana darurat', targetAmount: 1_000_000, saved: 1_000_000 }),
  goal({
    id: 'g3',
    name: 'Laptop',
    createdAt: `${shiftMonth(month, -2)}-10T05:00:00.000Z`,
    deadline: monthRange(shiftMonth(month, 1)).end,
  }),
  goal({
    id: 'g4',
    name: 'Rumah',
    targetAmount: 50_000_000,
    deadline: null,
    saved: 2_000_000,
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

function setup({ enabled = true, goals = GOALS } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/features')) return json({ flags: { savings_goals: enabled } }, 200);
    if (url.pathname.endsWith('/wallets')) {
      return json({ items: [wallet('w-tab', 'Tabungan'), wallet('w-bca', 'BCA')] }, 200);
    }
    const contrib = url.pathname.match(/\/goals\/(\w+)\/contributions$/);
    if (contrib && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { amount: number };
      const g = goals.find((x) => x.id === contrib[1])!;
      return json({ ...g, saved: g.saved + body.amount });
    }
    if (contrib) return json({ items: [] }, 200);
    if (url.pathname.endsWith('/goals')) return json({ items: goals }, 200);
    return json({ error: { code: 'NOT_FOUND', message: 'x' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/anggaran/target']}>
        <ToastProvider>
          <Routes>
            <Route path="/anggaran" element={<p>Halaman anggaran</p>} />
            <Route path="/anggaran/target" element={<GoalsPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

const card = async (name: string) =>
  (await screen.findByRole('button', { name: `Lihat target ${name}` })).closest('li')!;

const posted = (fetchMock: ReturnType<typeof setup>) => {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
  return {
    url: String(call[0]),
    body: JSON.parse(String(call[1]!.body)) as Record<string, unknown>,
    headers: call[1]!.headers as Record<string, string>,
  };
};

describe('GoalsPage', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('tab Rencana aktif di Target; status selalu disertai teks dan saran setoran', async () => {
    setup();
    expect(await screen.findByRole('heading', { level: 1, name: 'Rencana' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Target' })).toHaveAttribute('aria-current', 'page');

    const liburan = await card('Liburan');
    expect(within(liburan).getByText('Sesuai rencana')).toBeInTheDocument();
    expect(within(liburan).getByText('Saran setor Rp 1.000.000/bulan')).toBeInTheDocument();
    expect(within(liburan).getByText('Bulan ini kurang Rp 600.000')).toBeInTheDocument();
    expect(within(liburan).getByText(/3 bulan lagi$/)).toBeInTheDocument();
    expect(within(liburan).getByRole('progressbar')).toHaveAttribute('aria-valuetext', '13%');

    const darurat = await card('Dana darurat');
    expect(within(darurat).getByText('Tercapai')).toBeInTheDocument();
    expect(within(darurat).getByText('Target tercapai. Selamat!')).toBeInTheDocument();
    expect(within(darurat).queryByRole('button', { name: /^Setor/ })).not.toBeInTheDocument();

    const laptop = await card('Laptop');
    expect(within(laptop).getByText('Tertinggal')).toBeInTheDocument();

    const rumah = await card('Rumah');
    expect(within(rumah).getAllByText('Tanpa tenggat')).toHaveLength(2);
    expect(within(rumah).getByText('Kurang Rp 48.000.000 lagi')).toBeInTheDocument();

    expect(screen.getByText('Terkumpul dari 4 target')).toBeInTheDocument();
  });

  it('setor = transfer dari dompet lain: validasi, pakai saran, Idempotency-Key', async () => {
    const fetchMock = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Setor ke Liburan' }));
    const dialog = await screen.findByRole('dialog', { name: 'Liburan' });
    // Dompet tabungan sendiri tidak ditawarkan; BCA terpilih otomatis.
    expect(within(dialog).getByRole('combobox', { name: 'Dari dompet' })).toHaveTextContent('BCA');
    expect(
      within(dialog).getByText(
        'Saldo dompet ini berkurang dan pindah ke Tabungan, seperti transfer.',
      ),
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Simpan setoran' }));
    expect(within(dialog).getByText('Masukkan nominal lebih dari 0')).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Pakai saran bulan ini · Rp 600.000' }),
    );
    await userEvent.type(within(dialog).getByLabelText('Catatan (opsional)'), 'Sisa gaji');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Simpan setoran' }));

    await waitFor(() => expect(posted(fetchMock).url).toContain('/goals/g1/contributions'));
    const { body, headers } = posted(fetchMock);
    expect(body).toEqual({
      type: 'DEPOSIT',
      amount: 600_000,
      date: today,
      note: 'Sisa gaji',
      walletId: 'w-bca',
    });
    expect(headers['Idempotency-Key']).toMatch(/^[\w-]{8,}$/);
    expect(
      await screen.findByText('Setoran Rp 600.000 dipindah dari BCA ke Tabungan'),
    ).toBeInTheDocument();
  });

  it('target lama tanpa dompet: setor diarahkan memilih dompet tabungan dulu', async () => {
    setup({ goals: [goal({ walletId: null, wallet: null })] });
    await userEvent.click(await screen.findByRole('button', { name: 'Setor ke Liburan' }));
    const dialog = await screen.findByRole('dialog', { name: 'Liburan' });
    expect(within(dialog).getByText(/belum punya dompet tabungan/)).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'Simpan setoran' }),
    ).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Pilih dompet tabungan' }));
    const form = await screen.findByRole('dialog', { name: 'Ubah target' });
    expect(within(form).getByRole('combobox', { name: 'Dompet tabungan' })).toHaveTextContent(
      'Buat dompet baru: Tabungan Liburan',
    );
  });

  it('target dengan dompet tabungan: tarik dibatasi yang terkumpul dan mengirim dompet tujuan', async () => {
    const fetchMock = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Lihat target Rumah' }));
    const detail = await screen.findByRole('dialog', { name: 'Rumah' });
    expect(within(detail).getByText('Tabungan')).toBeInTheDocument();
    await userEvent.click(within(detail).getByRole('button', { name: 'Tarik' }));

    const dialog = await screen.findByRole('dialog', { name: 'Rumah' });
    expect(within(dialog).getByText('Ke dompet')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Uang dipindah dari Tabungan ke dompet ini, seperti transfer.'),
    ).toBeInTheDocument();
    // Dompet tabungan sendiri tidak ditawarkan; BCA terpilih otomatis.
    expect(within(dialog).getByRole('combobox', { name: 'Ke dompet' })).toHaveTextContent('BCA');

    await userEvent.type(within(dialog).getByLabelText('Nominal'), '2500000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Simpan penarikan' }));
    expect(
      within(dialog).getByText('Maksimal Rp 2.000.000 (yang sudah terkumpul)'),
    ).toBeInTheDocument();

    const input = within(dialog).getByLabelText('Nominal');
    await userEvent.clear(input);
    await userEvent.type(input, '500000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Simpan penarikan' }));
    await waitFor(() => expect(posted(fetchMock).body).toMatchObject({ walletId: 'w-bca' }));
    expect(posted(fetchMock).body).toMatchObject({ type: 'WITHDRAW', amount: 500_000 });
  });

  it('setoran yang mencapai target memberi ucapan selamat', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Setor ke Liburan' }));
    const dialog = await screen.findByRole('dialog', { name: 'Liburan' });
    await userEvent.type(within(dialog).getByLabelText('Nominal'), '2600000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Simpan setoran' }));
    expect(await screen.findByText('Selamat! Target Liburan tercapai')).toBeInTheDocument();
  });

  it('flag mati: dialihkan ke halaman anggaran', async () => {
    setup({ enabled: false });
    expect(await screen.findByText('Halaman anggaran')).toBeInTheDocument();
  });
});
