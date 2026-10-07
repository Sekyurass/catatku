import type { QuickTextSampleInput, WalletDTO } from '@catatku/shared';
import { expect, test } from '@playwright/test';
import { signUpViaApi, waitForApp } from './helpers';

test('dataset ketik cepat: ikut dari Profil → koreksi nominal → sampel terkirim', async ({
  page,
}) => {
  test.slow();
  const { post, get } = await signUpViaApi(page.request, 'Uji Dataset');
  const { flags } = await get<{ flags: Record<string, boolean> }>('/features');
  test.skip(!flags.natural_input, 'flag ketik cepat mati');
  await post<WalletDTO>('/wallets', { name: 'Tunai', type: 'CASH', initialBalance: 100_000 });

  await page.goto('/profil');
  await waitForApp(page);
  const toggle = page.getByRole('switch', { name: /Bantu tingkatkan Ketik cepat/ });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(page.getByText(/Terima kasih/)).toBeVisible();
  await expect(toggle).toBeChecked();
  expect(await get<{ enabled: boolean }>('/quick-text/sharing')).toEqual({ enabled: true });

  await page.goto('/');
  await waitForApp(page);
  await page.getByRole('button', { name: 'Catat transaksi' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Catat transaksi' });
  const input = dialog.getByRole('textbox', { name: 'Ketik cepat' });
  await input.fill('bakso 15rb kirim ke 0812-3456-7890');
  await input.press('Enter');
  const amount = dialog.getByRole('textbox', { name: 'Nominal' });
  await expect(amount).toHaveValue(/15\.000/);
  await amount.fill('18000');

  const sent = page.waitForRequest((r) => r.url().endsWith('/quick-text/samples'));
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Transaksi tersimpan')).toBeVisible();
  const request = await sent;
  const body = request.postDataJSON() as QuickTextSampleInput;
  expect(body.text).toBe('bakso 15rb kirim ke 0812-3456-7890');
  expect(body.parsed.amount).toBe(15_000);
  expect(body.final.amount).toBe(18_000);
  expect((await request.response())?.status()).toBe(204);
});
