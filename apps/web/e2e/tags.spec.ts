import { formatRupiah } from '@catatku/shared';
import { expect, test } from '@playwright/test';
import { signUpViaApi, waitForApp } from './helpers';

test('tag: catat dengan tag → saran tag → laporan per tag → filter → ganti nama', async ({
  page,
}) => {
  test.slow();
  const { post, get } = await signUpViaApi(page.request, 'Uji Tag');
  const { flags } = await get<{ flags: Record<string, boolean> }>('/features');
  test.skip(!flags.tags, 'flag tags mati di DB ini');
  await post('/wallets', { name: 'Dompet', type: 'CASH', initialBalance: 1_000_000 });

  await page.goto('/');
  await waitForApp(page);
  const sheet = page.getByRole('dialog', { name: 'Catat transaksi' });

  await page.getByRole('button', { name: 'Catat transaksi' }).first().click();
  await sheet.getByLabel('Nominal', { exact: true }).fill('150000');
  await sheet.getByRole('group', { name: 'Kategori' }).getByText('Makan').click();
  const tagField = sheet.getByLabel('Tag (opsional)');
  await tagField.fill('#Liburan Bali');
  await tagField.press('Enter');
  await tagField.fill('kantor,');
  await expect(sheet.getByRole('button', { name: 'Hapus tag Liburan Bali' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Hapus tag kantor' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Transaksi tersimpan')).toBeVisible();
  await expect(sheet).toBeHidden();

  await page.getByRole('button', { name: 'Catat transaksi' }).first().click();
  await sheet.getByLabel('Nominal', { exact: true }).fill('50000');
  await sheet
    .getByRole('group', { name: 'Kategori' })
    .getByText('Transport', { exact: true })
    .click();
  await sheet
    .getByLabel('Tag yang pernah dipakai')
    .getByRole('button', { name: 'Liburan Bali' })
    .click();
  await sheet.getByRole('button', { name: 'Simpan' }).click();
  await expect(sheet).toBeHidden();

  await page.goto('/tag');
  await waitForApp(page);
  const list = page.getByRole('list', { name: /^Tag, total/ });
  const bali = list.getByRole('listitem').filter({ hasText: 'Liburan Bali' });
  await expect(bali).toContainText('2 transaksi');
  await expect(bali).toContainText(formatRupiah(200_000));
  await expect(list.getByRole('listitem').first()).toContainText('Liburan Bali');

  await bali.getByRole('link').click();
  await expect(page).toHaveURL(/\/transaksi\?tagId=/);
  await waitForApp(page);
  await expect(page.getByRole('main').getByText(formatRupiah(150_000))).toBeVisible();
  await expect(page.getByRole('main').getByText(formatRupiah(50_000))).toBeVisible();

  await page.goto('/tag');
  await waitForApp(page);
  await page.getByRole('button', { name: 'Ganti nama tag kantor' }).click();
  const rename = page.getByRole('dialog', { name: 'Ganti nama tag' });
  await rename.getByLabel('Nama tag').fill('liburan bali');
  await rename.getByRole('button', { name: 'Simpan' }).click();
  await expect(rename).toContainText('Nama sudah dipakai');
  await rename.getByLabel('Nama tag').fill('Dinas');
  await rename.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Nama tag diganti')).toBeVisible();
  await expect(list).toContainText('Dinas');
});
