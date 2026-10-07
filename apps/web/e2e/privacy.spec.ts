import { expect, test } from '@playwright/test';
import { PASSWORD, uniqueEmail, waitForApp } from './helpers';

test('daftar: setujui privasi + ikut Ketik cepat → atur ulang di Profil', async ({ page }) => {
  test.slow();
  await page.goto('/daftar');
  await page.getByLabel('Nama panggilan').fill('Uji Privasi');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Kata sandi', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Ulangi kata sandi').fill(PASSWORD);
  await expect(page.getByRole('link', { name: 'Kebijakan Privasi' })).toHaveAttribute(
    'target',
    '_blank',
  );
  await page.getByRole('checkbox', { name: /menyetujui/ }).check({ force: true });
  await page.getByRole('checkbox', { name: /Ketik cepat/ }).check({ force: true });
  const registered = page.waitForResponse((r) => r.url().endsWith('/auth/register'));
  await page.getByRole('button', { name: 'Daftar' }).click();
  const { accessToken } = (await (await registered).json()) as { accessToken: string };
  await expect(page).toHaveURL(/\/mulai/);

  const headers = { Authorization: `Bearer ${accessToken}` };
  const { flags } = (await (await page.request.get('/api/v1/features', { headers })).json()) as {
    flags: Record<string, boolean>;
  };
  await page.goto('/profil');
  await waitForApp(page);
  const section = page.getByRole('region', { name: 'Privasi & data' });
  await expect(section.getByText(/Kamu setujui versi/)).toBeVisible();
  if (flags.natural_input) {
    expect(
      await (await page.request.get('/api/v1/quick-text/sharing', { headers })).json(),
    ).toEqual({ enabled: true });
    const toggle = section.getByRole('switch', { name: /Bantu tingkatkan Ketik cepat/ });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(page.getByText('Berbagi dimatikan')).toBeVisible();
    await expect(toggle).not.toBeChecked();
  }

  await section.getByRole('link', { name: /Kebijakan Privasi/ }).click();
  await expect(page).toHaveURL(/\/privasi$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Kebijakan Privasi' })).toBeVisible();
  await page.getByRole('link', { name: 'Kembali' }).click();
  await expect(page).toHaveURL(/\/profil$/);
});
