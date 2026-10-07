import type { CategoryDTO, TagDTO, WalletDTO } from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Attachments from '../../lib/attachments';
import { ToastProvider } from '../ui/Toast';
import { TransactionSheet } from './TransactionSheet';

vi.mock('../../lib/attachments', async (importOriginal) => ({
  ...(await importOriginal<typeof Attachments>()),
  compressAttachment: vi.fn(async () => new Blob(['foto'], { type: 'image/webp' })),
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
    id: 'cat_makan',
    name: 'Makan',
    type: 'EXPENSE',
    icon: 'utensils',
    color: '#EA580C',
    isDefault: true,
    archivedAt: null,
  },
];
const TAGS: TagDTO[] = [
  { id: 'tg1', name: 'Kantor', count: 4 },
  { id: 'tg2', name: 'Liburan', count: 1 },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup({ tags = true, attachments = true, uploadFails = false } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/features')) return json({ flags: { tags, attachments } });
    if (url.includes('/categories')) return json({ items: CATEGORIES });
    if (url.includes('/wallets')) return json({ items: WALLETS });
    if (url.includes('/tags')) return json({ items: TAGS });
    if (url.includes('/attachments') && init?.method === 'POST') {
      return uploadFails
        ? json({ error: { code: 'INTERNAL', message: 'x' } }, 500)
        : json({ id: 'a1' }, 201);
    }
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
  const posts = (part: string) =>
    fetchMock.mock.calls.filter(([u, i]) => String(u).includes(part) && i?.method === 'POST');
  return { onClose, posts };
}

async function fillRequired() {
  const amount = await screen.findByLabelText('Nominal');
  await userEvent.type(amount, '25000');
  await userEvent.click(
    within(screen.getByRole('group', { name: 'Kategori' })).getByLabelText('Makan'),
  );
}

describe('tag & lampiran di form transaksi', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    URL.createObjectURL = vi.fn(() => 'blob:pratinjau');
    URL.revokeObjectURL = vi.fn();
  });

  it('tag diketik (Enter/koma) atau dipilih dari saran, lalu ikut tersimpan', async () => {
    const { posts, onClose } = setup({ attachments: false });
    await fillRequired();
    const input = screen.getByLabelText('Tag (opsional)');
    await userEvent.type(input, '#Proyek A{Enter}');
    await userEvent.type(input, 'klien,');
    await userEvent.click(await screen.findByRole('button', { name: 'Kantor' }));
    expect(screen.getByRole('button', { name: 'Hapus tag Proyek A' })).toBeInTheDocument();

    // Backspace di kolom kosong menghapus tag terakhir.
    await userEvent.type(input, '{Backspace}');
    expect(screen.queryByRole('button', { name: 'Hapus tag Kantor' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const body = JSON.parse(String(posts('/transactions')[0]![1]!.body)) as { tags: string[] };
    expect(body.tags).toEqual(['Proyek A', 'klien']);
  });

  it('foto dipilih, dikompres, lalu diunggah setelah transaksi tersimpan', async () => {
    const { posts, onClose } = setup({ tags: false });
    await fillRequired();
    const file = new File(['x'.repeat(10)], 'struk.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByTestId('attachment-input'), file);
    expect(await screen.findByRole('button', { name: 'Lihat Foto baru 1' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const uploads = posts('/transactions/t1/attachments');
    expect(uploads).toHaveLength(1);
    expect(uploads[0]![1]!.body).toBeInstanceOf(Blob);
    expect((uploads[0]![1]!.headers as Record<string, string>)['Content-Type']).toBe('image/webp');
  });

  it('foto bisa dibatalkan sebelum disimpan', async () => {
    const { posts, onClose } = setup({ tags: false });
    await fillRequired();
    await userEvent.upload(
      screen.getByTestId('attachment-input'),
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Hapus Foto baru 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(posts('/attachments')).toHaveLength(0);
  });

  it('unggahan gagal: transaksi tetap tersimpan dengan peringatan', async () => {
    const { onClose } = setup({ tags: false, uploadFails: true });
    await fillRequired();
    await userEvent.upload(
      screen.getByTestId('attachment-input'),
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
    );
    await screen.findByRole('button', { name: 'Lihat Foto baru 1' });
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText(/1 foto gagal diproses/)).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it('flag mati: kolom tag dan lampiran tidak tampil', async () => {
    setup({ tags: false, attachments: false });
    await screen.findByLabelText('Nominal');
    expect(screen.queryByLabelText('Tag (opsional)')).not.toBeInTheDocument();
    expect(screen.queryByText('Lampiran foto (opsional)')).not.toBeInTheDocument();
  });
});
