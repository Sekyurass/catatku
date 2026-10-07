import type { CategoryDTO, WalletDTO } from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { yesterday } from '../../lib/format';
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
  wallet({ id: 'w1', name: 'Tunai' }),
  wallet({ id: 'w2', name: 'BCA', type: 'BANK', lastUsedAt: '2026-10-05T00:00:00.000Z' }),
];
const category = (id: string, name: string, type: CategoryDTO['type']): CategoryDTO => ({
  id,
  name,
  type,
  icon: 'utensils',
  color: '#EA580C',
  isDefault: true,
  archivedAt: null,
});
const CATEGORIES = [
  category('cat_makan', 'Makan', 'EXPENSE'),
  category('cat_transport', 'Transport', 'EXPENSE'),
  category('cat_gaji', 'Gaji', 'INCOME'),
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup({ enabled = true } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/features')) return json({ flags: { natural_input: enabled } });
    if (url.includes('/wallets')) return json({ items: WALLETS });
    if (url.includes('/categories')) return json({ items: CATEGORIES });
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
  const posts = (path: string) =>
    fetchMock.mock.calls
      .filter(([url, init]) => init?.method === 'POST' && String(url).endsWith(path))
      .map(([, init]) => JSON.parse(String(init!.body)) as Record<string, unknown>);
  return { onClose, posts };
}

describe('Ketik cepat di form catat', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('pratinjau → Enter mengisi form → Enter lagi menyimpan; tercatat diterima tanpa diubah', async () => {
    const user = userEvent.setup();
    const { onClose, posts } = setup();
    const input = await screen.findByLabelText('Ketik cepat');
    await user.type(input, 'makan siang 25rb pakai tunai kemarin');

    const preview = screen.getByRole('list', { name: 'Pratinjau ketik cepat' });
    for (const text of ['Keluar', 'Rp 25.000', 'Makan', 'Tunai', 'Kemarin', '“Makan siang”']) {
      expect(within(preview).getByText(text)).toBeInTheDocument();
    }

    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Nominal')).toHaveValue('25.000');
    expect(
      within(screen.getByRole('group', { name: 'Kategori' })).getByLabelText('Makan'),
    ).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Dompet' })).toHaveTextContent('Tunai');
    expect(screen.getByRole('button', { name: 'Kemarin' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Catatan (opsional)')).toHaveValue('Makan siang');
    expect(screen.getByText('Form terisi. Cek lagi lalu simpan.')).toHaveAttribute(
      'role',
      'status',
    );
    expect(input).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Simpan' })).toHaveFocus();

    await user.keyboard('{Enter}');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(posts('/transactions')[0]).toMatchObject({
      type: 'EXPENSE',
      amount: 25_000,
      walletId: 'w1',
      categoryId: 'cat_makan',
      date: yesterday(),
      note: 'Makan siang',
    });
    expect(posts('/events')).toContainEqual({ name: 'quick_text_used', fields: 4, accepted: true });
  });

  it('transfer antardompet mengganti jenis ke Transfer', async () => {
    const user = userEvent.setup();
    const { posts } = setup();
    await user.type(
      await screen.findByLabelText('Ketik cepat'),
      'transfer 200rb bca ke tunai{Enter}',
    );

    expect(screen.getByRole('radio', { name: 'Transfer' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Dari dompet' })).toHaveTextContent('BCA');
    expect(screen.getByRole('combobox', { name: 'Ke dompet' })).toHaveTextContent('Tunai');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(posts('/transactions/transfer')).toHaveLength(1));
    expect(posts('/transactions/transfer')[0]).toMatchObject({
      fromWalletId: 'w2',
      toWalletId: 'w1',
      amount: 200_000,
    });
  });

  it('isian yang belum terbaca diberitahukan; hasil yang diubah tercatat tidak diterima', async () => {
    const user = userEvent.setup();
    const { posts, onClose } = setup();
    await user.type(await screen.findByLabelText('Ketik cepat'), 'beli sesuatu{Enter}');
    expect(screen.getByText('Form terisi. Belum terbaca: nominal, kategori.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nominal')).toHaveFocus();

    await user.type(screen.getByLabelText('Nominal'), '40000');
    await user.click(
      within(screen.getByRole('group', { name: 'Kategori' })).getByLabelText('Transport'),
    );
    await user.click(screen.getByRole('button', { name: 'Simpan' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(posts('/events')).toContainEqual({
      name: 'quick_text_used',
      fields: 1,
      accepted: false,
    });
  });

  it('tidak tampil bila flag mati', async () => {
    setup({ enabled: false });
    await screen.findByLabelText('Nominal');
    expect(screen.queryByLabelText('Ketik cepat')).not.toBeInTheDocument();
  });
});
