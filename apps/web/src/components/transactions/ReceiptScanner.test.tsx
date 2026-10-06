import type { CategoryDTO, WalletDTO } from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ReceiptModule from '../../lib/receipt';
import type { ReceiptParser, ReceiptScanResult } from '../../lib/receipt';
import { ToastProvider } from '../ui/Toast';
import { TransactionSheet } from './TransactionSheet';

const parser = vi.hoisted(() => ({ parse: vi.fn<ReceiptParser['parse']>() }));

vi.mock('../../lib/receipt', async (importOriginal) => ({
  ...(await importOriginal<typeof ReceiptModule>()),
  loadReceiptParser: async () => parser,
}));

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
const CATEGORIES: CategoryDTO[] = [
  {
    id: 'cat_belanja',
    name: 'Belanja',
    type: 'EXPENSE',
    icon: 'shopping-bag',
    color: '#EC4899',
    isDefault: true,
    archivedAt: null,
  },
];

const RESULT: ReceiptScanResult = {
  text: 'INDOMARET\nTOTAL 54.300',
  total: { value: 54_300, confidence: 'high' },
  date: { value: '2026-10-06', confidence: 'low' },
  merchant: { value: 'Indomaret', confidence: 'high' },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup({ ocr = true } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/features')) return json({ flags: { receipt_ocr: ocr } });
    if (url.includes('/wallets')) return json({ items: WALLETS });
    if (url.includes('/categories')) return json({ items: CATEGORIES });
    if (url.includes('/events') && init?.method === 'POST')
      return new Response(null, { status: 204 });
    return json({ error: { code: 'NOT_FOUND', message: 'x' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:struk'),
      revokeObjectURL: vi.fn(),
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ToastProvider>
          <TransactionSheet open onClose={() => undefined} />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const events = () =>
    fetchMock.mock.calls
      .filter(([u]) => String(u).includes('/events'))
      .map(([, init]) => JSON.parse(String(init!.body)) as unknown);
  return { events };
}

const photo = () => new File(['x'], 'struk.jpg', { type: 'image/jpeg' });
const user = () => userEvent.setup({ applyAccept: false });

describe('Pindai struk di form transaksi', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    parser.parse.mockReset();
  });

  it('tidak tampil bila fitur mati atau jenisnya pemasukan', async () => {
    setup({ ocr: false });
    await screen.findByLabelText('Nominal');
    await waitFor(() => expect(screen.queryByText('Pindai struk')).not.toBeInTheDocument());
  });

  it('hanya untuk pengeluaran', async () => {
    setup();
    await screen.findByRole('button', { name: 'Pindai struk' });
    await user().click(screen.getByLabelText('Masuk'));
    expect(screen.queryByRole('button', { name: 'Pindai struk' })).not.toBeInTheDocument();
  });

  it('mengisi nominal, tanggal, dan catatan lalu menandai yang kurang yakin', async () => {
    let finish!: (r: ReceiptScanResult) => void;
    parser.parse.mockImplementation((_img, { onProgress }) => {
      onProgress?.({ stage: 'reading', progress: 0.42 });
      return new Promise((resolve) => (finish = resolve));
    });
    const { events } = setup();
    await screen.findByRole('button', { name: 'Pindai struk' });
    await user().upload(screen.getByTestId('receipt-input'), photo());

    expect(await screen.findByText('Membaca struk… 42%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Kemajuan pindai struk' })).toHaveAttribute(
      'aria-valuenow',
      '42',
    );
    expect(parser.parse.mock.calls[0]![1].today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    finish(RESULT);

    expect(
      await screen.findByText('Diisi dari struk, periksa lagi sebelum menyimpan'),
    ).toBeInTheDocument();
    expect(screen.getByText('Kurang yakin: tanggal.')).toBeInTheDocument();
    expect(
      screen.getByText('Foto dibaca di perangkat ini dan tidak diunggah.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Nominal')).toHaveValue('54.300');
    expect(screen.getByLabelText('Catatan (opsional)')).toHaveValue('Indomaret');
    expect(screen.getByRole('button', { name: 'Tanggal' })).toHaveTextContent('6 Okt 2026');
    expect(screen.getByText('Dari struk, kurang yakin. Cek lagi.')).toBeInTheDocument();
    expect(screen.getAllByText('Dari struk')).toHaveLength(2);
    await waitFor(() => expect(events()).toEqual([{ name: 'receipt_scanned', fields: 3 }]));

    // Setelah diubah pengguna, petunjuk "Dari struk" hilang.
    await user().clear(screen.getByLabelText('Catatan (opsional)'));
    await user().type(screen.getByLabelText('Catatan (opsional)'), 'Belanja bulanan');
    expect(screen.getAllByText('Dari struk')).toHaveLength(1);
  });

  it('tidak menimpa nominal yang sudah diketik', async () => {
    parser.parse.mockResolvedValue(RESULT);
    setup();
    const amount = await screen.findByLabelText('Nominal');
    await user().type(amount, '10000');
    await user().upload(screen.getByTestId('receipt-input'), photo());
    await screen.findByText('Diisi dari struk, periksa lagi sebelum menyimpan');
    expect(amount).toHaveValue('10.000');
    expect(screen.getByLabelText('Catatan (opsional)')).toHaveValue('Indomaret');
  });

  it('bila tidak terbaca, foto tetap tampil sebagai acuan isi manual', async () => {
    parser.parse.mockResolvedValue({ text: '', total: null, date: null, merchant: null });
    const { events } = setup();
    await screen.findByRole('button', { name: 'Pindai struk' });
    await user().upload(screen.getByTestId('receipt-input'), photo());

    expect(
      await screen.findByText('Struk tidak terbaca. Isi manual sambil melihat fotonya.'),
    ).toBeInTheDocument();
    await user().click(screen.getByRole('button', { name: 'Perbesar foto struk' }));
    expect(screen.getByRole('img', { name: 'Foto struk' })).toHaveAttribute('src', 'blob:struk');
    expect(screen.getByLabelText('Nominal')).toHaveValue('');
    await waitFor(() => expect(events()).toEqual([{ name: 'receipt_scanned', fields: 0 }]));

    await user().click(screen.getByRole('button', { name: 'Hapus foto struk' }));
    expect(screen.getByRole('button', { name: 'Pindai struk' })).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:struk');
  });

  it('menolak file yang bukan foto tanpa menjalankan OCR', async () => {
    setup();
    await screen.findByRole('button', { name: 'Pindai struk' });
    await user().upload(
      screen.getByTestId('receipt-input'),
      new File(['%PDF'], 'struk.pdf', { type: 'application/pdf' }),
    );
    expect(await screen.findByText('Pilih file foto (JPG, PNG, atau WebP).')).toBeInTheDocument();
    expect(parser.parse).not.toHaveBeenCalled();
  });

  it('bisa dibatalkan saat sedang membaca', async () => {
    let signal: AbortSignal | undefined;
    parser.parse.mockImplementation((_img, opts) => {
      signal = opts.signal;
      return new Promise(() => undefined);
    });
    setup();
    await screen.findByRole('button', { name: 'Pindai struk' });
    await user().upload(screen.getByTestId('receipt-input'), photo());
    const panel = within(await screen.findByRole('region', { name: 'Pindai struk' }));
    expect(panel.getByText('Menyiapkan pembaca struk…')).toBeInTheDocument();
    await user().click(panel.getByRole('button', { name: 'Batal' }));
    expect(signal?.aborted).toBe(true);
    expect(screen.getByRole('button', { name: 'Pindai struk' })).toBeInTheDocument();
  });
});
