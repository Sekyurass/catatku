import { expect, test } from '@playwright/test';
import { signUpViaApi, waitForApp } from './helpers';

test('email bank: aktifkan dari Profil, unggah .eml tanpa tanda tangan ditolak', async ({
  page,
}) => {
  const { get } = await signUpViaApi(page.request, 'Uji Email Bank');
  const { flags } = await get<{ flags: Record<string, boolean> }>('/features');
  test.skip(!flags.bank_email, 'flag bank_email mati di DB ini');

  await page.goto('/profil');
  await waitForApp(page);
  await page.getByRole('link', { name: /Catat dari email bank/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Catat dari email bank', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Belum ada transaksi baru')).toBeVisible();

  const toggle = page.getByRole('switch', { name: 'Terima email bank otomatis' });
  await toggle.check({ force: true });
  await expect(toggle).toBeChecked();
  const inbox = await get<{ enabled: boolean; address: string | null }>('/bank-email');
  expect(inbox.enabled).toBe(true);
  if (inbox.address) await expect(page.getByText(inbox.address)).toBeVisible();

  await page.getByLabel('File email').setInputFiles({
    name: 'notifikasi.eml',
    mimeType: 'message/rfc822',
    buffer: Buffer.from(
      [
        'From: BCA <bca@bca.co.id>',
        'To: siapa@contoh.id',
        'Subject: Internet Transaction Journal',
        '',
        'Total : IDR 50,000.00',
      ].join('\r\n'),
    ),
  });
  await expect(page.getByText(/Ditolak: tanda tangan pengirim tidak valid/)).toBeVisible();
});
