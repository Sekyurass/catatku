import {
  currentMonth,
  formatRupiah,
  type GoalDTO,
  monthRange,
  shiftMonth,
  type WalletDTO,
} from '@catatku/shared';
import { expect, test } from '@playwright/test';
import { signUpViaApi, waitForApp } from './helpers';

test('target: tab Rencana → buat target → setor via transfer → saran bulanan → hapus setoran', async ({
  page,
}) => {
  test.slow();
  const { post, get } = await signUpViaApi(page.request, 'Uji Target');
  const { flags } = await get<{ flags: Record<string, boolean> }>('/features');
  test.skip(!flags.savings_goals, 'flag savings_goals mati di DB ini');
  const main = await post<WalletDTO>('/wallets', {
    name: 'Utama',
    type: 'BANK',
    initialBalance: 2_000_000,
  });

  await page.goto('/anggaran');
  await waitForApp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Rencana' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Bagian rencana' })
    .getByRole('link', { name: 'Target' })
    .click();
  await expect(page).toHaveURL(/\/anggaran\/target$/);
  await waitForApp(page);
  // Menu utama tetap menandai "Rencana" di sub-halaman Target.
  await expect(
    page
      .getByRole('navigation', { name: 'Navigasi utama' })
      .last()
      .getByRole('link', { name: 'Rencana' }),
  ).toHaveAttribute('aria-current', 'page');

  await page.getByRole('button', { name: 'Buat target' }).click();
  const form = page.getByRole('dialog', { name: 'Target baru' });
  await form.getByLabel('Nama target').fill('Liburan Bali');
  await form.getByLabel('Jumlah target').fill('3000000');
  // Default: dompet tabungan baru dibuatkan dengan nama target.
  await expect(form.getByLabel('Dompet tabungan')).toContainText(
    'Buat dompet baru: Tabungan Liburan Bali',
  );
  await form.getByRole('radio', { name: 'Perjalanan' }).check({ force: true });
  await form.getByRole('button', { name: 'Simpan' }).click();
  await expect(
    page.getByText('Target dibuat. Dompet Tabungan Liburan Bali siap dipakai.'),
  ).toBeVisible();
  await expect(form).toBeHidden();

  const list = page.getByRole('list', { name: 'Daftar target' });
  const bali = list.getByRole('listitem').filter({ hasText: 'Liburan Bali' });
  await expect(bali).toContainText('Tanpa tenggat');

  await bali.getByRole('button', { name: 'Setor ke Liburan Bali' }).click();
  const deposit = page.getByRole('dialog', { name: 'Liburan Bali' });
  await deposit.getByLabel('Nominal', { exact: true }).fill('500000');
  await expect(deposit.getByLabel('Dari dompet')).toContainText('Utama');
  await expect(
    deposit.getByText(
      'Saldo dompet ini berkurang dan pindah ke Tabungan Liburan Bali, seperti transfer.',
    ),
  ).toBeVisible();
  await deposit.getByRole('button', { name: 'Simpan setoran' }).click();
  await expect(
    page.getByText(`Setoran ${formatRupiah(500_000)} dipindah dari Utama ke Tabungan Liburan Bali`),
  ).toBeVisible();
  await expect(deposit).toBeHidden();
  await expect(bali).toContainText(`${formatRupiah(500_000)} dari ${formatRupiah(3_000_000)}`);
  const wallets = await get<{ items: WalletDTO[] }>('/wallets');
  expect(wallets.items.find((w) => w.id === main.id)?.balance).toBe(1_500_000);
  expect(wallets.items.find((w) => w.name === 'Tabungan Liburan Bali')?.balance).toBe(500_000);

  // Target dengan tenggat: 3 bulan termasuk bulan ini -> saran Rp400.000/bulan.
  const deadline = monthRange(shiftMonth(currentMonth(), 2)).end;
  await post<GoalDTO>('/goals', { name: 'Dana darurat', targetAmount: 1_200_000, deadline });
  await page.reload();
  await waitForApp(page);
  const darurat = list.getByRole('listitem').filter({ hasText: 'Dana darurat' });
  await expect(darurat).toContainText(`Saran setor ${formatRupiah(400_000)}/bulan`);
  await expect(darurat).toContainText('Sesuai rencana');
  await darurat.getByRole('button', { name: 'Setor ke Dana darurat' }).click();
  const quick = page.getByRole('dialog', { name: 'Dana darurat' });
  await quick.getByLabel('Dari dompet').click();
  await page.getByRole('option', { name: /^Utama/ }).click();
  await quick
    .getByRole('button', { name: `Pakai saran bulan ini · ${formatRupiah(400_000)}` })
    .click();
  await quick.getByRole('button', { name: 'Simpan setoran' }).click();
  await expect(quick).toBeHidden();
  await expect(darurat).toContainText('Setoran bulan ini sudah cukup');
  await expect(darurat).toContainText(`Saran setor ${formatRupiah(400_000)}/bulan`);

  // Detail: riwayat, lalu hapus setoran -> transfer ikut terhapus.
  await bali.getByRole('button', { name: 'Lihat target Liburan Bali' }).click();
  const detail = page.getByRole('dialog', { name: 'Liburan Bali' });
  await expect(detail.getByText('Setor · dari Utama')).toBeVisible();
  await detail.getByRole('button', { name: /^Hapus setor/ }).click();
  await page
    .getByRole('dialog', { name: 'Hapus setoran ini?' })
    .getByRole('button', { name: 'Hapus' })
    .click();
  await expect(page.getByText('Setoran dihapus')).toBeVisible();
  await expect(detail.getByText('Belum ada setoran')).toBeVisible();
  const after = await get<{ items: WalletDTO[] }>('/wallets');
  // Setoran Dana darurat (400.000) tetap memotong Utama.
  expect(after.items.find((w) => w.id === main.id)?.balance).toBe(1_600_000);
});
