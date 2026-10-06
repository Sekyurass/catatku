import { expect, test } from '@playwright/test';
import { signUpViaApi, waitForApp } from './helpers';

test('pengingat: atur dari Profil → tersimpan setelah muat ulang → lonceng terbuka', async ({
  page,
}) => {
  const { get } = await signUpViaApi(page.request, 'Uji Pengingat');
  const { flags } = await get<{ flags: Record<string, boolean> }>('/features');
  test.skip(!flags.reminders, 'flag reminders mati di DB ini');

  await page.goto('/profil');
  await waitForApp(page);
  await page.getByRole('link', { name: /Pengingat & notifikasi/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Pengingat & notifikasi', level: 1 }),
  ).toBeVisible();

  const toggle = page.getByRole('switch', { name: 'Pengingat harian' });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.getByRole('combobox', { name: 'Jam' }).click();
  await page.getByRole('option', { name: '07.00 WIB' }).click();
  await page.getByText('Min', { exact: true }).click();
  await page.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Pengingat disimpan')).toBeVisible();

  await page.reload();
  await waitForApp(page);
  await expect(page.getByRole('switch', { name: 'Pengingat harian' })).toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Jam' })).toContainText('07.00 WIB');
  await expect(page.getByRole('checkbox', { name: 'Minggu' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Senin' })).toBeChecked();
  const settings = await get<{
    reminderEnabled: boolean;
    reminderHour: number;
    reminderDays: number[];
  }>('/notifications/settings');
  expect(settings).toMatchObject({
    reminderEnabled: true,
    reminderHour: 7,
    reminderDays: [1, 2, 3, 4, 5, 6],
  });

  await page.getByRole('link', { name: 'Beranda' }).first().click();
  await page
    .getByRole('button', { name: /^Notifikasi/ })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Notifikasi' });
  await expect(dialog.getByText('Belum ada notifikasi')).toBeVisible();
  await dialog.getByRole('link', { name: 'Atur pengingat & notifikasi' }).click();
  await expect(page).toHaveURL(/\/pengingat$/);
});
