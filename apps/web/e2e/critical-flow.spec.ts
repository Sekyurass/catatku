import { expect, test } from '@playwright/test';
import { PASSWORD, signUpViaApi, uniqueEmail, waitForApp } from './helpers';

test('daftar → buat dompet → catat → lihat dashboard', async ({ page }) => {
  await page.goto('/daftar');
  await page.getByLabel('Nama panggilan').fill('Uji E2E');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Kata sandi', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Ulangi kata sandi').fill(PASSWORD);
  await page.getByRole('button', { name: 'Daftar' }).click();

  // Onboarding langkah 1: sambutan.
  await expect(page).toHaveURL(/\/mulai/);
  await waitForApp(page);
  await expect(page.getByRole('heading', { name: 'Hai, Uji E2E!' })).toBeVisible();
  await page.getByRole('button', { name: 'Mulai' }).click();

  // Langkah 2: dompet pertama.
  await expect(page.getByRole('heading', { name: 'Buat dompet pertamamu' })).toBeVisible();
  await expect(page.getByLabel('Nama dompet')).toHaveValue('Tunai');
  await page.getByLabel('Saldo saat ini').fill('1000000');
  await expect(page.getByLabel('Saldo saat ini')).toHaveValue('1.000.000');
  await page.getByRole('button', { name: 'Simpan & lanjut' }).click();

  // Langkah 3: transaksi pertama.
  await expect(page.getByRole('heading', { name: 'Catat transaksi pertamamu' })).toBeVisible();
  await page.getByLabel('Nominal').fill('25000');
  await page.getByText('Makan', { exact: true }).click();
  await page.getByLabel('Catatan (opsional)').fill('Nasi goreng');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();

  // Dashboard mencerminkan dompet + transaksi barusan.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Transaksi tersimpan')).toBeVisible();
  await waitForApp(page);
  const summary = page.getByRole('region', { name: 'Ringkasan bulan ini' });
  await expect(summary).toContainText('Rp 975.000');
  await expect(
    page.getByRole('button', { name: /^Makan, -Rp 25\.000, Tunai · Nasi goreng/ }),
  ).toBeVisible();
});

test('hapus transaksi lalu urungkan', async ({ page }) => {
  const { post } = await signUpViaApi(page.request);
  const wallet = await post<{ id: string }>('/wallets', {
    name: 'Dompet Harian',
    type: 'CASH',
    initialBalance: 200_000,
  });
  await post('/transactions', {
    type: 'EXPENSE',
    amount: 18_000,
    walletId: wallet.id,
    categoryId: 'cat_makan',
    date: new Date().toISOString().slice(0, 10),
    note: 'Bakso',
  });

  await page.goto('/transaksi');
  await waitForApp(page);
  const row = page.getByRole('button', { name: /Bakso/ });
  await row.click();
  const detail = page.getByRole('dialog', { name: 'Detail transaksi' });
  await expect(detail).toContainText('Bakso');
  await expect(detail).toContainText('Dompet Harian');
  await detail.getByRole('button', { name: 'Hapus' }).click();

  await expect(page.getByText('Transaksi dihapus')).toBeVisible();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Urungkan' }).click();

  await expect(page.getByText('Transaksi dikembalikan')).toBeVisible();
  await expect(row).toBeVisible();
});
