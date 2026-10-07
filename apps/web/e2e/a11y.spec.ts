import AxeBuilder from '@axe-core/playwright';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { renderReceiptPng, signUpViaApi, waitForApp } from './helpers';

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    targets: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
  }));
  expect.soft(summary, JSON.stringify(summary, null, 2)).toEqual([]);
}

/** Target sentuh ≥ 44×44 px (kecuali tautan teks di dalam kalimat dan input sr-only). */
async function expectTouchTargets(page: Page) {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, select, input, a[href], [role="button"]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || el.classList.contains('sr-only')) return false;
        if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') return false;
        return r.width < 44 || r.height < 44;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40);
        return `${el.tagName.toLowerCase()} "${name}" ${Math.round(r.width)}×${Math.round(r.height)}`;
      }),
  );
  expect.soft(small, small.join('\n')).toEqual([]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`tema ${colorScheme === 'light' ? 'terang' : 'gelap'}`, () => {
    test.use({ colorScheme });

    test('halaman publik lolos axe (WCAG 2.1 AA)', async ({ page }) => {
      for (const path of [
        '/masuk',
        '/daftar',
        '/lupa-kata-sandi',
        '/atur-ulang-kata-sandi#token=contoh',
        '/atur-ulang-kata-sandi',
      ]) {
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expectNoViolations(page);
        await expectTouchTargets(page);
      }
    });

    test('halaman aplikasi lolos axe (WCAG 2.1 AA)', async ({ page, browser }) => {
      // Belasan halaman + OCR sungguhan, tiap query ke DB jarak jauh ±600 ms.
      test.setTimeout(360_000);
      await auditAppPages(page, browser);
    });
  });
}

async function auditAppPages(page: Page, browser: Browser) {
  const { post, get } = await signUpViaApi(page.request);
  const wallet = await post<{ id: string }>('/wallets', {
    name: 'Tunai',
    type: 'CASH',
    initialBalance: 500_000,
  });
  const today = new Date().toISOString().slice(0, 10);
  await post('/transactions', {
    type: 'EXPENSE',
    amount: 45_000,
    walletId: wallet.id,
    categoryId: 'cat_makan',
    date: today,
    tags: ['Liburan', 'Kantor'],
  });
  await post('/transactions', {
    type: 'INCOME',
    amount: 300_000,
    walletId: wallet.id,
    categoryId: 'cat_gaji',
    date: today,
  });
  // Beranda (kartu konfirmasi), riwayat (lencana Berulang), /berulang, dan lonceng ikut diaudit bila flag menyala.
  const { flags } = await get<{ flags: Record<string, boolean> }>('/features');
  const recurring = flags.recurring_transactions === true;
  if (recurring) {
    const rule = { walletId: wallet.id, frequency: 'MONTHLY', startDate: today };
    await post('/recurring', {
      ...rule,
      type: 'EXPENSE',
      amount: 200_000,
      categoryId: 'cat_tagihan',
      note: 'Listrik',
      autoPost: false,
    });
    await post('/recurring', {
      ...rule,
      type: 'EXPENSE',
      amount: 100_000,
      categoryId: 'cat_tagihan',
      note: 'Internet',
    });
  }
  if (flags.templates) {
    const tpl = { type: 'EXPENSE', walletId: wallet.id, categoryId: 'cat_makan' };
    await post('/templates', { ...tpl, name: 'Kopi susu', amount: 25_000 });
    await post('/templates', { ...tpl, name: 'Makan siang', amount: null });
  }

  for (const path of [
    '/',
    '/transaksi',
    '/anggaran',
    '/dompet',
    '/kategori',
    '/berulang',
    '/template',
    '/tag',
    '/impor',
    '/pengingat',
    '/profil',
    '/mulai',
    '/tidak-ada',
  ]) {
    await page.goto(path);
    await waitForApp(page);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await test.step(path, async () => {
      await expectNoViolations(page);
      await expectTouchTargets(page);
    });
  }

  if (recurring) {
    await page.goto('/berulang');
    await waitForApp(page);
    await page.getByRole('button', { name: 'Tambah' }).click();
    await expect(page.getByRole('dialog', { name: 'Transaksi berulang baru' })).toBeVisible();
    await waitForApp(page);
    await test.step('/berulang (form)', async () => {
      await expectNoViolations(page);
      await expectTouchTargets(page);
    });
  }

  if (flags.templates) {
    await page.goto('/template');
    await waitForApp(page);
    await page.getByRole('button', { name: /^Kopi susu/ }).click();
    await expect(page.getByRole('dialog', { name: 'Ubah template' })).toBeVisible();
    await waitForApp(page);
    await test.step('/template (form)', async () => {
      await expectNoViolations(page);
      await expectTouchTargets(page);
    });
  }

  if (flags.csv_import) {
    await page.goto('/impor');
    await waitForApp(page);
    await page.getByLabel(/Pilih file CSV/).setInputFiles({
      name: 'mutasi.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        `Tanggal;Keterangan;Jumlah\n01/10/2026;Kopi;-18.000\nkemarin;Roti;-9.000\n`,
      ),
    });
    await expect(page.getByRole('heading', { name: 'Cocokkan kolom' })).toBeVisible();
    await waitForApp(page);
    await test.step('/impor (pemetaan)', async () => {
      await expectNoViolations(page);
      await expectTouchTargets(page);
    });
    await page.getByRole('button', { name: 'Periksa data' }).click();
    await expect(page.getByRole('heading', { name: 'Periksa sebelum impor' })).toBeVisible({
      timeout: 30_000,
    });
    await test.step('/impor (periksa)', async () => {
      await expectNoViolations(page);
      await expectTouchTargets(page);
    });
  }

  if (flags.reminders) {
    await page.goto('/');
    await waitForApp(page);
    await page
      .getByRole('button', { name: /^Notifikasi/ })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page.getByRole('dialog', { name: 'Notifikasi' })).toBeVisible();
    await waitForApp(page);
    await test.step('lonceng notifikasi', async () => {
      await expectNoViolations(page);
      await expectTouchTargets(page);
    });
  }

  if (flags.tags) {
    await page.goto('/');
    await waitForApp(page);
    await page.getByRole('button', { name: 'Catat transaksi' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Catat transaksi' });
    await dialog.getByLabel('Tag (opsional)').fill('Dinas luar');
    await dialog.getByLabel('Tag (opsional)').press('Enter');
    await expect(dialog.getByRole('button', { name: 'Hapus tag Dinas luar' })).toBeVisible();
    await expect(dialog.getByLabel('Tag yang pernah dipakai')).toBeVisible();
    await test.step('form dengan tag', async () => {
      await expectNoViolations(page);
      await expectTouchTargets(page);
    });
  }

  if (flags.receipt_ocr) {
    await page.goto('/');
    await waitForApp(page);
    await page.getByRole('button', { name: 'Catat transaksi' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Catat transaksi' });
    await dialog
      .getByTestId('receipt-input')
      .setInputFiles(await renderReceiptPng(browser, new Date()));
    await expect(dialog.getByText('Diisi dari struk, periksa lagi sebelum menyimpan')).toBeVisible({
      timeout: 90_000,
    });
    await dialog.getByRole('button', { name: 'Perbesar foto struk' }).click();
    await expect(dialog.getByRole('img', { name: 'Foto struk' })).toBeVisible();
    await test.step('form pindai struk', async () => {
      await expectNoViolations(page);
      await expectTouchTargets(page);
    });
  }
}
