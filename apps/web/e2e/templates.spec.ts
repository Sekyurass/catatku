import { formatRupiah } from '@catatku/shared';
import { expect, test } from '@playwright/test';
import { signUpViaApi, waitForApp } from './helpers';

test('template: simpan dari form → satu tap di Beranda + urungkan → atur & isi nominal', async ({
  page,
}) => {
  test.slow();
  const { post, get } = await signUpViaApi(page.request, 'Uji Template');
  const { flags } = await get<{ flags: Record<string, boolean> }>('/features');
  test.skip(!flags.templates, 'flag templates mati di DB ini');
  await post('/wallets', { name: 'GoPay', type: 'EWALLET', initialBalance: 500_000 });

  await page.goto('/');
  await waitForApp(page);
  await page.getByRole('button', { name: 'Catat transaksi' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Catat transaksi' });
  await sheet.getByLabel('Nominal', { exact: true }).fill('25000');
  await sheet.getByRole('group', { name: 'Kategori' }).getByText('Makan').click();
  await sheet.getByLabel('Catatan (opsional)').fill('Kopi susu');
  await sheet.getByText('Simpan juga sebagai template').click();
  await sheet.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Transaksi & template tersimpan')).toBeVisible();

  const summary = page.getByRole('region', { name: 'Ringkasan bulan ini' });
  await expect(summary).toContainText(formatRupiah(475_000));
  const chips = page.getByRole('group', { name: 'Cepat catat' });
  await chips.getByRole('button', { name: /Kopi susu/ }).click();
  await expect(page.getByText(`Kopi susu ${formatRupiah(25_000)} tercatat`)).toBeVisible();
  await expect(summary).toContainText(formatRupiah(450_000));
  await page.getByRole('button', { name: 'Urungkan' }).click();
  await expect(page.getByText('Dibatalkan')).toBeVisible();
  await expect(summary).toContainText(formatRupiah(475_000));

  await page.getByRole('link', { name: 'Atur', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Template', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Tambah', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Template baru' });
  await form.getByLabel('Nama').fill('Makan siang');
  await form.getByRole('group', { name: 'Kategori' }).getByText('Makan').click();
  await form.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Template dibuat')).toBeVisible();
  await expect(page.getByText('2 dari 20 template')).toBeVisible();

  const firstRow = page.getByRole('main').getByRole('listitem').first();
  await page.getByRole('button', { name: 'Naikkan Makan siang' }).click();
  await expect(firstRow).toContainText('Makan siang');
  await page.reload();
  await waitForApp(page);
  await expect(firstRow).toContainText('Makan siang');

  await page.getByRole('link', { name: 'Beranda' }).first().click();
  await chips.getByRole('button', { name: /Makan siang/ }).click();
  await expect(sheet.getByLabel('Catatan (opsional)')).toHaveValue('Makan siang');
  await sheet.getByLabel('Nominal', { exact: true }).fill('32000');
  await sheet.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Transaksi tersimpan')).toBeVisible();
  await expect(summary).toContainText(formatRupiah(443_000));
});
