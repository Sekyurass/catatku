import type { CategoryDTO, CategoryMapDTO, WalletDTO } from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../ui/Toast';
import { TransactionSheet } from './TransactionSheet';

const WALLETS: WalletDTO[] = [
  {
    id: 'w1',
    name: 'Tunai',
    type: 'CASH',
    initialBalance: 0,
    balance: 100_000,
    color: '#0F766E',
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null,
  },
];
const category = (id: string, name: string, type: CategoryDTO['type'] = 'EXPENSE') => ({
  id,
  name,
  type,
  icon: 'utensils' as const,
  color: '#EA580C',
  isDefault: true,
  archivedAt: null,
});
const CATEGORIES: CategoryDTO[] = [
  category('cat_makan', 'Makan'),
  category('cat_transport', 'Transport'),
  category('cat_belanja', 'Belanja'),
  category('cat_gaji', 'Gaji', 'INCOME'),
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup({ on = true, learned = [] as CategoryMapDTO[] } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/features')) return json({ flags: { auto_category: on } });
    if (url.includes('/categories/learned')) return json({ items: learned });
    if (url.includes('/categories')) return json({ items: CATEGORIES });
    if (url.includes('/wallets')) return json({ items: WALLETS });
    if (url.includes('/events')) return new Response(null, { status: 204 });
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
  const calls = (part: string) => fetchMock.mock.calls.filter(([u]) => String(u).includes(part));
  const events = () => calls('/events').map(([, i]) => JSON.parse(String(i!.body)) as unknown);
  return { onClose, calls, events };
}

const picker = () => within(screen.getByRole('group', { name: 'Kategori' }));
const note = () => screen.getByLabelText('Catatan (opsional)');

describe('saran kategori di form transaksi', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('memilih otomatis dari catatan dan mengikuti catatan selama belum diganti pengguna', async () => {
    const { calls } = setup();
    await screen.findByLabelText('Nominal');
    await waitFor(() => expect(calls('/categories/learned')).toHaveLength(1));

    await userEvent.type(note(), 'Isi bensin');
    expect(picker().getByLabelText('Transport')).toBeChecked();
    expect(screen.getByText(/Transport ditebak dari catatan\./)).toBeInTheDocument();

    await userEvent.clear(note());
    await userEvent.type(note(), 'Makan siang');
    expect(picker().getByLabelText('Makan')).toBeChecked();
  });

  it('pilihan manual tidak ditimpa; saran muncul sebagai tombol satu tap', async () => {
    setup();
    await screen.findByLabelText('Nominal');
    await waitFor(() =>
      expect(screen.getByRole('group', { name: 'Kategori' })).toBeInTheDocument(),
    );
    await userEvent.click(picker().getByLabelText('Makan'));
    await userEvent.type(note(), 'Parkir mall');
    expect(picker().getByLabelText('Makan')).toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Saran: Transport' }));
    expect(picker().getByLabelText('Transport')).toBeChecked();
    expect(screen.queryByRole('button', { name: /Saran:/ })).not.toBeInTheDocument();
  });

  it('pilihan pengguna sebelumnya menang atas kamus kata kunci', async () => {
    setup({ learned: [{ key: 'kopi tuku', type: 'EXPENSE', categoryId: 'cat_belanja' }] });
    await screen.findByLabelText('Nominal');
    await waitFor(() =>
      expect(screen.getByRole('group', { name: 'Kategori' })).toBeInTheDocument(),
    );
    await new Promise((r) => setTimeout(r, 0));
    await userEvent.type(note(), 'Kopi Tuku');
    await waitFor(() => expect(picker().getByLabelText('Belanja')).toBeChecked());
    expect(screen.getByText(/Belanja sesuai pilihanmu sebelumnya\./)).toBeInTheDocument();
  });

  it('mencatat apakah saran diterima saat menyimpan', async () => {
    const { events, onClose } = setup();
    const amount = await screen.findByLabelText('Nominal');
    await userEvent.type(amount, '15000');
    await userEvent.type(note(), 'gojek ke kantor');
    expect(picker().getByLabelText('Transport')).toBeChecked();
    await userEvent.click(picker().getByLabelText('Makan'));
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    await waitFor(() =>
      expect(events()).toEqual([
        { name: 'category_suggestion', source: 'keyword', accepted: false },
      ]),
    );
  });

  it('tanpa flag tidak ada saran dan tidak memuat riwayat', async () => {
    const { calls } = setup({ on: false });
    await screen.findByLabelText('Nominal');
    await userEvent.type(note(), 'Isi bensin');
    expect(picker().getByLabelText('Transport')).not.toBeChecked();
    expect(screen.queryByText(/ditebak dari catatan/)).not.toBeInTheDocument();
    expect(calls('/categories/learned')).toHaveLength(0);
  });
});
