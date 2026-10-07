import { toDateString, type WalletDTO } from '@catatku/shared';
import { expect, test } from '@playwright/test';
import { signUpViaApi, waitForApp } from './helpers';

const yesterday = new Date(Date.parse(toDateString()) - 86_400_000).toISOString().slice(0, 10);

test('ketik cepat: satu kalimat → pratinjau → isi form → simpan', async ({ page }) => {
  test.slow();
  const { post, get } = await signUpViaApi(page.request, 'Uji Ketik Cepat');
  const { flags } = await get<{ flags: Record<string, boolean> }>('/features');
  test.skip(!flags.natural_input, 'flag ketik cepat mati');
  await post<WalletDTO>('/wallets', { name: 'Tunai', type: 'CASH', initialBalance: 100_000 });
  const bca = await post<WalletDTO>('/wallets', {
    name: 'BCA',
    type: 'BANK',
    initialBalance: 1_000_000,
  });

  await page.goto('/');
  await waitForApp(page);
  await page.getByRole('button', { name: 'Catat transaksi' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Catat transaksi' });
  const input = dialog.getByRole('textbox', { name: 'Ketik cepat' });
  await input.fill('makan siang 25rb di warteg pakai bca kemarin');
  const preview = dialog.getByRole('list', { name: 'Pratinjau ketik cepat' });
  await expect(preview.getByText('Rp 25.000')).toBeVisible();
  await expect(preview.getByText('Makan', { exact: true })).toBeVisible();
  await input.press('Enter');
  await expect(dialog.getByLabel('Catatan (opsional)')).toHaveValue('Makan siang di warteg');
  await expect(dialog.getByRole('button', { name: 'Simpan' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Transaksi tersimpan')).toBeVisible();

  const { items } = await get<{
    items: { amount: number; date: string; note: string; walletId: string; categoryId: string }[];
  }>('/transactions');
  expect(items[0]).toMatchObject({
    amount: -25_000,
    date: yesterday,
    note: 'Makan siang di warteg',
    walletId: bca.id,
    categoryId: 'cat_makan',
  });
});
