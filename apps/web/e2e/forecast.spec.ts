import { toDateString, type WalletDTO } from '@catatku/shared';
import { expect, test } from '@playwright/test';
import { signUpViaApi, waitForApp } from './helpers';

const daysAgo = (n: number) => toDateString(new Date(Date.now() - n * 86_400_000));

test('perkiraan akhir bulan: rentang di Beranda + cara menghitung', async ({ page }) => {
  test.slow();
  const { post, get } = await signUpViaApi(page.request, 'Uji Perkiraan');
  const { flags } = await get<{ flags: Record<string, boolean> }>('/features');
  test.skip(!flags.forecast, 'flag perkiraan mati');

  const wallet = await post<WalletDTO>('/wallets', {
    name: 'Utama',
    type: 'BANK',
    initialBalance: 10_000_000,
  });
  // 20 hari terakhir: minggu terbaru 80rb/hari, sebelumnya 40rb/hari.
  for (let n = 1; n <= 20; n++) {
    await post('/transactions', {
      type: 'EXPENSE',
      walletId: wallet.id,
      categoryId: 'cat_makan',
      amount: n <= 7 ? 80_000 : 40_000,
      date: daysAgo(n),
    });
  }

  await page.goto('/');
  await waitForApp(page);
  const card = page.getByRole('region', { name: 'Perkiraan akhir bulan' });
  await expect(card.getByText('Saldo di akhir bulan kira-kira')).toBeVisible();
  await expect(card.getByText(/cukup sampai akhir bulan/)).toBeVisible();

  await card.getByText('Cara menghitung').click();
  await expect(card.getByText(/minggu paling boros \(Rp 80\.000\/hari\)/)).toBeVisible();
  await expect(card.getByText(/minggu paling hemat \(Rp 40\.000\/hari\)/)).toBeVisible();
});
