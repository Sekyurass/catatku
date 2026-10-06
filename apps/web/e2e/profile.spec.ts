import { expect, test } from '@playwright/test';
import { signUpViaApi, waitForApp } from './helpers';

test('foto profil: unggah → tampil → hapus, lalu keluar', async ({ page }) => {
  await signUpViaApi(page.request, 'Uji Foto');
  await page.goto('/profil');
  await waitForApp(page);

  // Foto asli 1200×800 dibuat di browser agar jalur kompres canvas ikut teruji.
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0f766e';
    ctx.fillRect(0, 0, 1200, 800);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(600, 400, 300, 0, Math.PI * 2);
    ctx.fill();
    return canvas.toDataURL('image/png').split(',')[1]!;
  });

  const trigger = page.getByRole('button', { name: 'Ubah foto profil' });
  await expect(trigger).toContainText('UF');
  await trigger.click();
  const upload = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/me/avatar') && r.request().method() === 'PUT',
  );
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  const response = await upload;
  expect(response.status()).toBe(200);
  expect(response.request().headers()['content-type']).toMatch(/^image\/(webp|jpeg)$/);

  await expect(page.getByText('Foto profil diperbarui')).toBeVisible();
  const img = trigger.locator('img');
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(384);
  const navProfile = page.getByRole('link', { name: 'Profil' });
  await expect(navProfile.locator('img')).toBeVisible();

  // Foto tetap ada setelah muat ulang (tersimpan di server).
  await page.reload();
  await waitForApp(page);
  await expect(page.getByRole('button', { name: 'Ubah foto profil' }).locator('img')).toBeVisible();

  await page.getByRole('button', { name: 'Ubah foto profil' }).click();
  await page.getByRole('button', { name: 'Hapus foto' }).click();
  await expect(page.getByText('Foto profil dihapus')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ubah foto profil' })).toContainText('UF');
  await expect(navProfile.locator('img')).toHaveCount(0);

  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  await expect(page).toHaveURL(/\/masuk$/);
  await expect(page.getByRole('heading', { name: 'Masuk', level: 1 })).toBeVisible();
});
