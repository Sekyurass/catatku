import { expect, test } from '@playwright/test';
import { PASSWORD, signUpViaApi, waitForApp } from './helpers';

test('hapus akun dari Profil: kata sandi salah ditolak, lalu akun hilang', async ({ page }) => {
  test.slow();
  const { email } = await signUpViaApi(page.request, 'Uji Hapus Akun');
  await page.goto('/profil');
  await waitForApp(page);

  await page
    .getByRole('region', { name: 'Privasi & data' })
    .getByRole('button', { name: 'Hapus akun' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Hapus akun permanen?' });
  await dialog.getByLabel('Kata sandi', { exact: true }).fill('bukan-sandinya');
  await dialog.getByLabel('Ketik HAPUS').fill('hapus');
  await dialog.getByRole('button', { name: 'Hapus akun permanen' }).click();
  await expect(dialog.getByText('Kata sandi salah').first()).toBeVisible();

  await dialog.getByLabel('Kata sandi', { exact: true }).fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Hapus akun permanen' }).click();
  await expect(page).toHaveURL(/\/masuk/, { timeout: 20_000 });

  const login = await page.request.post('/api/v1/auth/login', {
    data: { email, password: PASSWORD },
  });
  expect(login.status()).toBe(401);
});
