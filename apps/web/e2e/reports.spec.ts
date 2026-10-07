import { currentMonth, formatRupiah, shiftMonth, type WalletDTO } from '@catatku/shared';
import { expect, test } from '@playwright/test';
import { signUpViaApi, waitForApp } from './helpers';

const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

test('laporan: bulanan dibanding bulan lalu → unduh PDF → tahunan → buka bulan', async ({
  page,
}) => {
  test.slow();
  const { post, get } = await signUpViaApi(page.request, 'Uji Laporan');
  const { flags } = await get<{ flags: Record<string, boolean> }>('/features');
  test.skip(!flags.advanced_reports, 'flag laporan mati');

  const month = shiftMonth(currentMonth(), -1);
  const before = shiftMonth(month, -1);
  const wallet = await post<WalletDTO>('/wallets', {
    name: 'Utama',
    type: 'BANK',
    initialBalance: 10_000_000,
  });
  const tx = (body: Record<string, unknown>) =>
    post('/transactions', { walletId: wallet.id, ...body });
  await tx({ type: 'INCOME', amount: 5_000_000, date: `${month}-01`, categoryId: 'cat_gaji' });
  await tx({ type: 'EXPENSE', amount: 100_000, date: `${before}-08`, categoryId: 'cat_makan' });
  await tx({ type: 'EXPENSE', amount: 220_000, date: `${month}-05`, categoryId: 'cat_makan' });
  await tx({
    type: 'EXPENSE',
    amount: 300_000,
    date: `${month}-05`,
    note: 'Sepatu lari',
    categoryId: 'cat_belanja',
  });

  await page.goto(`/laporan?bulan=${month}`);
  await waitForApp(page);
  await expect(page.getByRole('heading', { name: 'Laporan', level: 1 })).toBeVisible();
  await expect(page.getByText('+420%')).toBeVisible();
  const compare = page.getByRole('list', { name: 'Pengeluaran per kategori dibanding bulan lalu' });
  await expect(compare.getByText('+120%')).toBeVisible();
  await expect(compare.getByText('baru')).toBeVisible();
  await expect(page.getByText('Sepatu lari')).toBeVisible();

  // Isi PDF dicek dari Node: pengelola unduhan (mis. IDM) mengambil alih respons PDF ke browser
  // dan memberi 204 kosong, dan aplikasi lalu menampilkan pesan "diambil alih".
  const { accessToken } = (await (await page.request.post('/api/v1/auth/refresh')).json()) as {
    accessToken: string;
  };
  const pdf = await page.request.get(`/api/v1/export/report.pdf?month=${month}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(pdf.headers()['content-disposition']).toContain(`catatku-laporan-${month}.pdf`);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

  const pdfRequest = page.waitForRequest((r) => r.url().includes('/export/report.pdf'));
  await page.getByRole('button', { name: 'Unduh PDF' }).click();
  expect(new URL((await pdfRequest).url()).searchParams.get('month')).toBe(month);
  await expect(
    page.getByText(/Laporan PDF sudah diunduh|File diambil alih aplikasi lain/),
  ).toBeVisible();

  await page.goto(`/laporan?periode=tahunan&tahun=${month.slice(0, 4)}`);
  await waitForApp(page);
  await expect(page.getByText(formatRupiah(5_000_000)).first()).toBeVisible();
  const monthName = MONTH_NAMES[Number(month.slice(5)) - 1]!;
  await page
    .getByRole('list', { name: `Ringkasan per bulan ${month.slice(0, 4)}` })
    .getByRole('button', { name: new RegExp(`^${monthName}`) })
    .click();
  await expect(page).toHaveURL(new RegExp(`bulan=${month}`));
  await expect(page.getByText('Sepatu lari')).toBeVisible();
});
