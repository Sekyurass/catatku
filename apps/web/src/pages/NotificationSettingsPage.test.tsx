import type { NotificationSettingsDTO } from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import type * as PushModule from '../lib/push';
import { NotificationSettingsPage } from './NotificationSettingsPage';

const push = vi.hoisted(() => ({
  status: 'off' as 'unsupported' | 'denied' | 'off' | 'on',
  enablePush: vi.fn(async () => undefined),
  disablePush: vi.fn(async () => undefined),
}));

vi.mock('../lib/push', async (importOriginal) => ({
  ...(await importOriginal<typeof PushModule>()),
  getPushStatus: async () => push.status,
  enablePush: push.enablePush,
  disablePush: push.disablePush,
  isIosBrowser: () => false,
}));

const SETTINGS: NotificationSettingsDTO = {
  reminderEnabled: false,
  reminderHour: 20,
  reminderDays: [0, 1, 2, 3, 4, 5, 6],
  push: { available: true, publicKey: 'BPublicKey' },
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

function setup({
  reminders = true,
  settings = SETTINGS,
}: { reminders?: boolean; settings?: NotificationSettingsDTO } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/features')) return json({ flags: { reminders } });
    if (url.pathname.endsWith('/notifications/settings')) {
      if (init?.method === 'PUT') {
        return json({ ...settings, ...(JSON.parse(String(init.body)) as object) });
      }
      return json(settings);
    }
    if (url.pathname.endsWith('/notifications/push-test')) return json({ sent: 1 });
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ToastProvider>
          <NotificationSettingsPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { fetchMock };
}

const putBody = (fetchMock: ReturnType<typeof setup>['fetchMock']) => {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
  return call ? (JSON.parse(String(call[1]?.body)) as unknown) : undefined;
};

describe('NotificationSettingsPage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    push.status = 'off';
    push.enablePush.mockClear();
    push.disablePush.mockClear();
  });

  it('memberi tahu bila fitur belum aktif', async () => {
    setup({ reminders: false });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Pengingat & notifikasi' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Fitur belum tersedia')).toBeInTheDocument();
  });

  it('menyalakan pengingat dengan jam dan hari pilihan', async () => {
    const { fetchMock } = setup();
    const toggle = await screen.findByRole('switch', { name: 'Pengingat harian' });
    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('combobox', { name: 'Jam' }));
    await userEvent.click(screen.getByRole('option', { name: '21.00 WIB' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sabtu' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Minggu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() =>
      expect(putBody(fetchMock)).toEqual({
        reminderEnabled: true,
        reminderHour: 21,
        reminderDays: [1, 2, 3, 4, 5],
      }),
    );
    expect(await screen.findByText('Pengingat disimpan')).toBeInTheDocument();
  });

  it('wajib memilih minimal satu hari saat pengingat aktif', async () => {
    const { fetchMock } = setup({
      settings: { ...SETTINGS, reminderEnabled: true, reminderDays: [1] },
    });
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Senin' }));
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Pilih minimal satu hari');
    expect(putBody(fetchMock)).toBeUndefined();
  });

  it('mengaktifkan notifikasi push dengan kunci publik dari server', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Aktifkan notifikasi' }));
    expect(push.enablePush).toHaveBeenCalledWith('BPublicKey');
    expect(await screen.findByText('Notifikasi aktif di perangkat ini')).toBeInTheDocument();
  });

  it('saat aktif bisa kirim notifikasi uji dan mematikannya', async () => {
    push.status = 'on';
    const { fetchMock } = setup();
    expect(await screen.findByText('Aktif di perangkat ini')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Kirim notifikasi uji' }));
    expect(await screen.findByText('Notifikasi uji dikirim')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/push-test'))).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Matikan' }));
    expect(push.disablePush).toHaveBeenCalled();
  });

  it('menjelaskan bila izin notifikasi diblokir', async () => {
    push.status = 'denied';
    setup();
    expect(await screen.findByText(/Izin notifikasi diblokir/)).toBeInTheDocument();
  });

  it('menjelaskan bila server belum menyiapkan push', async () => {
    setup({ settings: { ...SETTINGS, push: { available: false, publicKey: null } } });
    expect(await screen.findByText(/belum disiapkan di server/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aktifkan notifikasi' })).not.toBeInTheDocument();
  });
});
