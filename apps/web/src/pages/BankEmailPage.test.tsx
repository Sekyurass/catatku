import type {
  BankEmailInboxDTO,
  BankEmailPendingDTO,
  CategoryDTO,
  WalletDTO,
} from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickAddProvider } from '../components/transactions/QuickAdd';
import { ToastProvider } from '../components/ui/Toast';
import { BankEmailPage } from './BankEmailPage';

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
    lastUsedAt: '2026-10-05T00:00:00.000Z',
  },
  {
    id: 'w2',
    name: 'BCA',
    type: 'BANK',
    initialBalance: 0,
    balance: 1_000_000,
    color: '#2563EB',
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null,
  },
];

const CATEGORIES: CategoryDTO[] = [
  {
    id: 'cat_keluarga',
    name: 'Keluarga',
    type: 'EXPENSE',
    icon: 'users',
    color: '#DB2777',
    isDefault: true,
    archivedAt: null,
  },
];

const INBOX: BankEmailInboxDTO = {
  enabled: true,
  address: 'catat+abc123def4567890abcd@masuk.catatku.id',
  receiving: true,
  walletId: 'w2',
  sourceEmail: 'budi@gmail.com',
  forwardingCode: '123456789',
  forwardingCodeAt: '2026-10-08T03:00:00.000Z',
  lastReceivedAt: '2026-10-08T03:00:00.000Z',
  lastResult: 'forwarding_code',
  pendingCount: 1,
};

const PENDING: BankEmailPendingDTO = {
  id: 'p1',
  source: 'bca',
  kind: 'transfer',
  type: 'EXPENSE',
  amount: 152_500,
  fee: 2_500,
  date: '2026-10-08',
  time: '10:15',
  counterparty: 'BUDI SANTOSO',
  note: 'Transfer ke BUDI SANTOSO',
  accountHint: '1234****90',
  walletId: 'w2',
  confident: true,
  createdAt: '2026-10-08T03:16:00.000Z',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup({
  enabled = true,
  inbox = INBOX,
  checked = INBOX,
}: { enabled?: boolean; inbox?: BankEmailInboxDTO; checked?: BankEmailInboxDTO } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/features')) return json({ flags: { bank_email: enabled } });
    if (url.endsWith('/bank-email/check')) return json(checked);
    if (url.includes('/bank-email/pending/') && init?.method === 'POST') {
      return new Response(null, { status: 204 });
    }
    if (url.endsWith('/bank-email/pending')) return json({ items: [PENDING] });
    if (url.endsWith('/bank-email')) return json(inbox);
    if (url.includes('/wallets')) return json({ items: WALLETS });
    if (url.includes('/categories')) return json({ items: CATEGORIES });
    if (url.includes('/transactions') && init?.method === 'POST') return json({ id: 't1' }, 201);
    return json({ error: { code: 'NOT_FOUND', message: 'x' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ToastProvider>
          <QuickAddProvider>
            <BankEmailPage />
          </QuickAddProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const posts = () =>
    fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([url, init]) => ({
        url: String(url),
        body: init!.body ? (JSON.parse(String(init!.body)) as Record<string, unknown>) : null,
      }));
  return { posts };
}

describe('BankEmailPage', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('flag mati: fitur belum tersedia', async () => {
    setup({ enabled: false });
    expect(await screen.findByText('Fitur belum tersedia')).toBeInTheDocument();
  });

  it('menampilkan alamat penerusan dan kode konfirmasi Gmail', async () => {
    setup();
    expect(await screen.findByText(INBOX.address!)).toBeInTheDocument();
    expect(screen.getByText('123456789')).toBeInTheDocument();
    expect(screen.getByText(/Untuk budi@gmail\.com/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Terima email bank otomatis' })).toBeChecked();
  });

  it('Saya sudah menambahkan alamat: memeriksa kotak masuk sampai kode baru muncul', async () => {
    const noCode = { ...INBOX, sourceEmail: null, forwardingCode: null, forwardingCodeAt: null };
    const { posts } = setup({ inbox: noCode, checked: INBOX });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Saya sudah menambahkan alamat' }),
    );
    expect(await screen.findByText('123456789')).toBeInTheDocument();
    expect(posts().map((p) => p.url)).toContainEqual(expect.stringMatching(/\/bank-email\/check$/));
    expect(await screen.findByText('Kode konfirmasi Gmail sudah masuk.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saya sudah menambahkan alamat' })).toBeVisible();
  });

  it('Catat membuka form terisi; setelah disimpan, transaksi ditautkan ke email', async () => {
    const { posts } = setup();
    const item = (await screen.findByText('Transfer ke BUDI SANTOSO')).closest('li')!;
    expect(within(item).getByText(/152\.500/)).toBeInTheDocument();
    expect(within(item).getByText(/Termasuk biaya Rp\s?2\.500/)).toBeInTheDocument();

    await userEvent.click(within(item).getByRole('button', { name: 'Catat' }));
    const dialog = await screen.findByRole('dialog', { name: 'Catat transaksi' });
    expect(await within(dialog).findByLabelText('Nominal')).toHaveValue('152.500');
    expect(within(dialog).getByLabelText('Catatan (opsional)')).toHaveValue(
      'Transfer ke BUDI SANTOSO',
    );
    expect(within(dialog).getByRole('combobox', { name: 'Dompet' })).toHaveTextContent('BCA');

    await userEvent.click(
      within(within(dialog).getByRole('group', { name: 'Kategori' })).getByLabelText('Keluarga'),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }));

    await waitFor(() =>
      expect(posts().find((p) => p.url.includes('/confirm'))).toMatchObject({
        url: expect.stringMatching(/\/bank-email\/pending\/p1\/confirm$/),
        body: { transactionId: 't1' },
      }),
    );
    const tx = posts().find((p) => p.url.endsWith('/transactions'))!;
    expect(tx.body).toMatchObject({
      type: 'EXPENSE',
      amount: 152_500,
      walletId: 'w2',
      date: '2026-10-08',
      categoryId: 'cat_keluarga',
    });
  });

  it('Abaikan', async () => {
    const { posts } = setup();
    const item = (await screen.findByText('Transfer ke BUDI SANTOSO')).closest('li')!;
    await userEvent.click(within(item).getByRole('button', { name: 'Abaikan' }));
    await waitFor(() =>
      expect(posts().map((p) => p.url)).toContainEqual(
        expect.stringMatching(/\/bank-email\/pending\/p1\/dismiss$/),
      ),
    );
  });
});
