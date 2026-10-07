import { toDateString, type WalletDTO } from '@catatku/shared';
import { expect, test } from '@playwright/test';
import { signUpViaApi, waitForApp } from './helpers';

const today = toDateString();
const daysAgo = (n: number) =>
  new Date(Date.parse(today) - n * 86_400_000).toISOString().slice(0, 10);

test('insight: langganan terdeteksi → detail → jadikan berulang → insight hilang', async ({
  page,
}) => {
  test.slow();
  const { post, get } = await signUpViaApi(page.request, 'Uji Insight');
  const { flags } = await get<{ flags: Record<string, boolean> }>('/features');
  test.skip(!flags.insights || !flags.recurring_transactions, 'flag insight/berulang mati');
  const wallet = await post<WalletDTO>('/wallets', {
    name: 'Utama',
    type: 'BANK',
    initialBalance: 5_000_000,
  });
  const expense = (body: Record<string, unknown>) =>
    post('/transactions', { type: 'EXPENSE', walletId: wallet.id, ...body });
  for (const n of [33, 3]) {
    await expense({ amount: 54_000, date: daysAgo(n), note: 'Netflix', categoryId: 'cat_hiburan' });
  }
  for (const n of [80, 65, 50, 35, 20]) {
    await expense({ amount: 100_000, date: daysAgo(n), categoryId: 'cat_belanja' });
  }
  await expense({ amount: 700_000, date: daysAgo(1), note: 'Kulkas', categoryId: 'cat_belanja' });

  await page.goto('/');
  await waitForApp(page);
  const section = page.getByRole('region', { name: 'Insight untukmu' });
  const list = section.getByRole('list', { name: 'Daftar insight' });
  await expect(list.getByText('Pengeluaran Belanja lebih besar dari biasanya')).toBeVisible();
  const subTitle = 'Sepertinya ada langganan: Netflix';
  await list.getByRole('button', { name: `Lihat detail: ${subTitle}` }).click();

  const detail = page.getByRole('dialog', { name: subTitle });
  await expect(detail.getByText('Transaksi yang mirip')).toBeVisible();
  await detail.getByRole('button', { name: 'Jadikan transaksi berulang' }).click();
  const form = page.getByRole('dialog', { name: 'Transaksi berulang baru' });
  await expect(form.getByLabel('Catatan (opsional)')).toHaveValue('Netflix');
  await form.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Transaksi berulang dibuat')).toBeVisible();
  await expect(detail).toBeHidden();
  await expect(list.getByText(subTitle)).toBeHidden();

  const rules = await get<{ items: { note: string; startDate: string; amount: number }[] }>(
    '/recurring',
  );
  expect(rules.items).toHaveLength(1);
  expect(rules.items[0]).toMatchObject({ note: 'Netflix', amount: 54_000 });
  expect(rules.items[0]!.startDate > today).toBe(true);

  // Sembunyikan insight lalu urungkan.
  const unusual = 'Pengeluaran Belanja lebih besar dari biasanya';
  await list.getByRole('button', { name: `Sembunyikan insight: ${unusual}` }).click();
  await expect(page.getByText(unusual)).toBeHidden();
  await page.getByRole('button', { name: 'Urungkan' }).click();
  await expect(list.getByText(unusual)).toBeVisible();
});
