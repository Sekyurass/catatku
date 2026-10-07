import type { ImportBatchDTO, ImportPreviewDTO, WalletDTO } from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { ImportPage } from './ImportPage';

const WALLET: WalletDTO = {
  id: 'w1',
  name: 'BCA',
  type: 'BANK',
  initialBalance: 0,
  balance: 1_000_000,
  color: '#2563EB',
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastUsedAt: '2026-10-01T00:00:00.000Z',
};

const CSV = [
  'Tanggal;Keterangan;Jumlah',
  '01/10/2026;Gaji Oktober;8.500.000',
  '02/10/2026;Makan siang;-35.000',
  '03/10/2026;Bensin;-50.000',
].join('\n');

const PREVIEW: ImportPreviewDTO = {
  stats: { total: 3, ready: 2, duplicates: 1, failed: 0 },
  issues: [{ line: 3, kind: 'DUPLICATE', message: 'Sudah ada transaksi yang sama' }],
};

const batch = (over: Partial<ImportBatchDTO> = {}): ImportBatchDTO => ({
  id: 'imp1',
  filename: 'mutasi.csv',
  status: 'COMPLETED',
  walletId: 'w1',
  wallet: { id: 'w1', name: 'BCA', color: '#2563EB' },
  stats: { total: 3, imported: 2, skipped: 1, failed: 0 },
  issues: [{ line: 3, kind: 'DUPLICATE', message: 'Sudah ada transaksi yang sama' }],
  createdAt: '2026-10-07T03:00:00.000Z',
  rolledBackAt: null,
  ...over,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup({ enabled = true, history = [] as ImportBatchDTO[] } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/features')) return json({ flags: { csv_import: enabled } });
    if (url.includes('/wallets')) return json({ items: [WALLET] });
    if (url.includes('/imports/preview')) return json(PREVIEW);
    if (url.includes('/rollback')) {
      return json(batch({ status: 'ROLLED_BACK', rolledBackAt: '2026-10-07T04:00:00.000Z' }));
    }
    if (url.endsWith('/imports') && init?.method === 'POST') return json(batch(), 201);
    if (url.endsWith('/imports')) return json({ items: history });
    return json({ error: { code: 'NOT_FOUND', message: 'x' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ToastProvider>
          <ImportPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const writes = () =>
    fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([url, init]) => ({
        url: String(url),
        headers: init!.headers as Record<string, string>,
        body: init!.body ? (JSON.parse(String(init!.body)) as Record<string, unknown>) : null,
      }));
  return { writes };
}

const csvFile = (text = CSV, name = 'mutasi.csv') => new File([text], name, { type: 'text/csv' });

describe('ImportPage', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('unggah → pemetaan + pratinjau → periksa → impor → laporan hasil', async () => {
    const user = userEvent.setup();
    const { writes } = setup();

    await user.upload(await screen.findByLabelText(/Pilih file CSV/), csvFile());

    expect(await screen.findByRole('heading', { name: 'Cocokkan kolom' })).toHaveFocus();
    expect(screen.getByText('mutasi.csv')).toBeInTheDocument();
    expect(screen.getByText('3 baris data')).toBeInTheDocument();
    // Kolom terdeteksi dari judul; jumlah minus = pengeluaran.
    expect(screen.getByText('Makan siang')).toBeInTheDocument();
    expect(screen.getByText('-Rp 35.000')).toBeInTheDocument();
    expect(screen.getByText('+Rp 8.500.000')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Masukkan ke dompet' })).toHaveTextContent('BCA'),
    );

    await user.click(screen.getByRole('button', { name: 'Periksa data' }));
    expect(
      await screen.findByRole('heading', { name: 'Periksa sebelum impor' }),
    ).toBeInTheDocument();
    expect(writes()[0]).toMatchObject({
      url: expect.stringContaining('/imports/preview'),
      body: {
        filename: 'mutasi.csv',
        walletId: 'w1',
        hasHeader: true,
        columns: { date: 0, note: 1, amount: 2, type: null, category: null },
        dateOrder: 'DMY',
        decimal: 'comma',
        csv: CSV,
      },
    });
    expect(screen.getByText('Baris 3')).toBeInTheDocument();

    // Duplikat ikut diimpor bila centangnya dilepas.
    await user.click(screen.getByRole('checkbox', { name: /Lewati 1 baris duplikat/ }));
    expect(screen.getByRole('button', { name: 'Impor 3 transaksi' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Lewati 1 baris duplikat/ }));
    await user.click(screen.getByRole('button', { name: 'Impor 2 transaksi' }));

    expect(await screen.findByRole('heading', { name: 'Impor selesai' })).toBeInTheDocument();
    const submit = writes()[1]!;
    expect(submit.url).toMatch(/\/imports$/);
    expect(submit.body).toMatchObject({ skipDuplicates: true, walletId: 'w1' });
    expect(submit.headers['Idempotency-Key']).toMatch(/^[\w-]{8,}$/);
    expect(screen.getByText('2 transaksi masuk ke dompet BCA.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lihat transaksi' })).toHaveAttribute(
      'href',
      '/transaksi',
    );
  });

  it('menolak file yang bukan CSV', async () => {
    const user = userEvent.setup({ applyAccept: false });
    setup();
    await user.upload(
      await screen.findByLabelText(/Pilih file CSV/),
      new File(['x'], 'laporan.xlsx', { type: 'application/vnd.ms-excel' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Pilih file berformat CSV');
  });

  it('impor bisa dibatalkan dari riwayat', async () => {
    const user = userEvent.setup();
    const { writes } = setup({ history: [batch()] });

    const history = await screen.findByRole('region', { name: 'Riwayat impor' });
    expect(await within(history).findByText('mutasi.csv')).toBeInTheDocument();
    expect(within(history).getByText('2 berhasil · 1 dilewati')).toBeInTheDocument();

    await user.click(within(history).getByRole('button', { name: 'Batalkan impor mutasi.csv' }));
    const dialog = await screen.findByRole('dialog', { name: 'Batalkan impor?' });
    await user.click(within(dialog).getByRole('button', { name: 'Hapus transaksinya' }));

    await waitFor(() =>
      expect(writes().some((w) => w.url.endsWith('/imports/imp1/rollback'))).toBe(true),
    );
    expect(await screen.findByText('Impor dibatalkan, 2 transaksi dihapus')).toBeInTheDocument();
  });

  it('flag mati → fitur belum tersedia', async () => {
    setup({ enabled: false });
    expect(await screen.findByText('Fitur belum tersedia')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Pilih file CSV/)).not.toBeInTheDocument();
  });
});
