import type { ImportBatchDTO, WalletDTO } from '@catatku/shared';
import { expect, test } from '@playwright/test';
import { signUpViaApi, waitForApp } from './helpers';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
const [y, m, d] = today.split('-');
const dmy = `${d}/${m}/${y}`;

test('impor CSV: unggah → petakan → periksa duplikat → impor → batalkan', async ({ page }) => {
  test.slow();
  const { post, get } = await signUpViaApi(page.request, 'Uji Impor');
  const { flags } = await get<{ flags: Record<string, boolean> }>('/features');
  test.skip(!flags.csv_import, 'flag csv_import mati di DB ini');
  const wallet = await post<WalletDTO>('/wallets', {
    name: 'BCA',
    type: 'BANK',
    initialBalance: 1_000_000,
  });
  await post('/transactions', {
    type: 'EXPENSE',
    amount: 35_000,
    walletId: wallet.id,
    categoryId: 'cat_makan',
    date: today,
    note: 'Makan siang',
  });
  const balance = async () =>
    (await get<{ items: WalletDTO[] }>('/wallets')).items.find((w) => w.id === wallet.id)!.balance;

  await page.goto('/profil');
  await waitForApp(page);
  await page.getByRole('link', { name: /Impor CSV/ }).click();
  await expect(page.getByRole('heading', { name: 'Impor CSV', level: 1 })).toBeVisible();

  const csv = [
    'Tanggal;Keterangan;Kategori;Jumlah',
    `${dmy};Gaji Oktober;Gaji;2.000.000`,
    `${dmy};Makan siang;Makan;-35.000`,
    `${dmy};Parkir;Transport;-5.000`,
    'kemarin;Bensin;Transport;-20.000',
  ].join('\r\n');
  await page.getByLabel(/Pilih file CSV/).setInputFiles({
    name: 'mutasi-bca.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });

  await expect(page.getByRole('heading', { name: 'Cocokkan kolom' })).toBeVisible();
  const preview = page.getByRole('region', { name: /Pratinjau/ });
  await expect(preview).toContainText('Gaji Oktober');
  await expect(preview).toContainText('Tanggal "kemarin" tidak sesuai format');
  await expect(page.getByRole('combobox', { name: 'Masukkan ke dompet' })).toContainText('BCA');
  await page.getByRole('button', { name: 'Periksa data' }).click();

  await expect(page.getByRole('heading', { name: 'Periksa sebelum impor' })).toBeVisible();
  await expect(page.getByText('Baris 3')).toBeVisible();
  await expect(page.getByText('Baris 5')).toBeVisible();
  await page.getByRole('button', { name: 'Impor 2 transaksi' }).click();

  await expect(page.getByRole('heading', { name: 'Impor selesai' })).toBeVisible();
  await expect(page.getByText('2 transaksi masuk ke dompet BCA.')).toBeVisible();
  expect(await balance()).toBe(965_000 + 2_000_000 - 5_000);

  await page.getByRole('link', { name: 'Lihat transaksi' }).click();
  await waitForApp(page);
  await expect(page.getByRole('main')).toContainText('Gaji Oktober');
  await expect(page.getByRole('main')).toContainText('Parkir');

  await page.goto('/impor');
  await waitForApp(page);
  const history = page.getByRole('region', { name: 'Riwayat impor' });
  await expect(history).toContainText('mutasi-bca.csv');
  await expect(history).toContainText('2 berhasil · 1 dilewati · 1 gagal');
  await history.getByRole('button', { name: 'Batalkan impor mutasi-bca.csv' }).click();
  const dialog = page.getByRole('dialog', { name: 'Batalkan impor?' });
  await dialog.getByRole('button', { name: 'Hapus transaksinya' }).click();
  await expect(page.getByText('Impor dibatalkan, 2 transaksi dihapus')).toBeVisible();
  await expect(history).toContainText('Dibatalkan');
  expect(await balance()).toBe(965_000);

  const { items } = await get<{ items: ImportBatchDTO[] }>('/imports');
  expect(items[0]).toMatchObject({ status: 'ROLLED_BACK', stats: { imported: 2 } });
});
