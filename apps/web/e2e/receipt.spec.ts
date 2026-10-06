import { expect, test } from '@playwright/test';
import { renderReceiptPng, signUpViaApi, waitForApp } from './helpers';

test('pindai struk: foto → form terisi otomatis → tinjau → simpan', async ({ page, browser }) => {
  test.slow();
  const { post, get } = await signUpViaApi(page.request, 'Uji Struk');
  const { flags } = await get<{ flags: Record<string, boolean> }>('/features');
  test.skip(!flags.receipt_ocr, 'flag receipt_ocr mati di DB ini');
  await post('/wallets', { name: 'Tunai', type: 'CASH', initialBalance: 200_000 });

  const yesterday = new Date(Date.now() - 86_400_000);
  const image = await renderReceiptPng(browser, yesterday);

  await page.goto('/');
  await waitForApp(page);
  await page.getByRole('button', { name: 'Catat transaksi' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Catat transaksi' });
  await dialog.getByRole('button', { name: 'Pindai struk' }).waitFor();
  await dialog.getByTestId('receipt-input').setInputFiles(image);

  await expect(dialog.getByText('Diisi dari struk, periksa lagi sebelum menyimpan')).toBeVisible({
    timeout: 90_000,
  });
  await expect(dialog.getByLabel('Nominal', { exact: true })).toHaveValue('47.500');
  await expect(dialog.getByLabel('Catatan (opsional)')).toHaveValue('Indomaret');
  const expectedDate = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(yesterday);
  await expect(dialog.getByRole('button', { name: 'Tanggal' })).toContainText(expectedDate);
  await expect(dialog.getByRole('button', { name: 'Kemarin' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await dialog.getByRole('group', { name: 'Kategori' }).getByText('Belanja').click();
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Transaksi tersimpan')).toBeVisible();
  await expect(page.getByRole('button', { name: /Indomaret/ }).first()).toBeVisible({
    timeout: 30_000,
  });
});
