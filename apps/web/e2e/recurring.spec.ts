import { formatRupiah } from '@catatku/shared';
import { expect, test } from '@playwright/test';
import { signUpViaApi, waitForApp } from './helpers';

test('transaksi berulang: buat dengan konfirmasi → catat dari Beranda → lencana Berulang', async ({
  page,
}) => {
  const { post, get } = await signUpViaApi(page.request, 'Uji Berulang');
  const { flags } = await get<{ flags: Record<string, boolean> }>('/features');
  test.skip(!flags.recurring_transactions, 'flag recurring_transactions mati di DB ini');
  await post('/wallets', { name: 'BCA', type: 'BANK', initialBalance: 1_000_000 });

  await page.goto('/profil');
  await waitForApp(page);
  await page.getByRole('link', { name: /Transaksi berulang/ }).click();
  await expect(page.getByRole('heading', { name: 'Transaksi berulang', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Tambah', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Transaksi berulang baru' });
  await dialog.getByLabel('Nominal', { exact: true }).fill('180000');
  await dialog.getByRole('group', { name: 'Kategori' }).getByText('Tagihan').click();
  await dialog.getByLabel('Catatan (opsional)').fill('Listrik');
  await dialog.getByText('Minta konfirmasi dulu').click();
  await expect(dialog.getByRole('radio', { name: /Minta konfirmasi dulu/ })).toBeChecked();
  await dialog.getByRole('button', { name: 'Simpan' }).click();

  await expect(page.getByText('Transaksi berulang dibuat')).toBeVisible();
  const row = page.getByRole('button', { name: /Listrik/ });
  await expect(row).toContainText('Perlu konfirmasi');

  // Tanggal mulai hari ini → kejadian pertama langsung menunggu konfirmasi di Beranda.
  await page.getByRole('link', { name: 'Beranda' }).first().click();
  await expect(page.getByText('Menunggu konfirmasi (1)')).toBeVisible();
  await page.getByRole('button', { name: 'Catat Listrik' }).click();
  const confirm = page.getByRole('dialog', { name: 'Catat transaksi berulang' });
  await confirm.getByLabel('Nominal', { exact: true }).fill('195000');
  await confirm.getByRole('button', { name: 'Simpan' }).click();

  await expect(page.getByText('Transaksi tersimpan')).toBeVisible();
  await expect(page.getByText(/Menunggu konfirmasi/)).toHaveCount(0);
  const recent = page.getByRole('button', { name: /Tagihan \(berulang\)/ });
  await expect(recent).toContainText(formatRupiah(-195_000, { signed: true }));
  await expect(recent).toContainText('Berulang');
});
