import { PRIVACY_POLICY_VERSION } from '@catatku/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivacyGate } from './PrivacyGate';

const auth = vi.hoisted(() => ({
  user: { privacyVersion: null as string | null },
  agreePrivacy: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../../lib/auth', () => ({ useAuth: () => auth }));
vi.mock('../../lib/features', () => ({ useFeature: () => true }));

function renderGate() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <PrivacyGate>
          <p>Isi aplikasi</p>
        </PrivacyGate>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  auth.agreePrivacy.mockReset().mockResolvedValue(undefined);
  auth.user = { privacyVersion: null };
});

describe('PrivacyGate', () => {
  it('meloloskan pengguna yang sudah menyetujui versi terbaru', () => {
    auth.user = { privacyVersion: PRIVACY_POLICY_VERSION };
    renderGate();
    expect(screen.getByText('Isi aplikasi')).toBeInTheDocument();
  });

  it('pengguna lama wajib setuju dulu; Ketik cepat opsional', async () => {
    renderGate();
    expect(screen.queryByText('Isi aplikasi')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Satu langkah lagi' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Setuju & lanjutkan' }));
    expect(await screen.findByText('Setujui Kebijakan Privasi untuk melanjutkan')).toBeVisible();
    expect(auth.agreePrivacy).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('checkbox', { name: /menyetujui/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Setuju & lanjutkan' }));
    expect(auth.agreePrivacy).toHaveBeenCalledWith({ acceptPrivacy: true });
  });

  it('kebijakan yang diperbarui meminta persetujuan ulang dan bisa sekalian ikut Ketik cepat', async () => {
    auth.user = { privacyVersion: '2000-01-01' };
    renderGate();
    expect(
      screen.getByRole('heading', { name: 'Kebijakan Privasi diperbarui' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /menyetujui/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Ketik cepat/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Setuju & lanjutkan' }));
    expect(auth.agreePrivacy).toHaveBeenCalledWith({ acceptPrivacy: true, shareQuickText: true });
  });
});
