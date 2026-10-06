import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { signUpViaApi, waitForApp } from './helpers';

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

    test('halaman aplikasi lolos axe (WCAG 2.1 AA)', async ({ page }) => {
      await auditAppPages(page);
    });
  });
}

async function auditAppPages(page: Page) {
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
  });
  await post('/transactions', {
    type: 'INCOME',
    amount: 300_000,
    walletId: wallet.id,
    categoryId: 'cat_gaji',
    date: today,
  });
  // Beranda (kartu konfirmasi), riwayat (lencana Berulang), dan /berulang ikut diaudit bila flag menyala.
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

  for (const path of [
    '/',
    '/transaksi',
    '/anggaran',
    '/dompet',
    '/kategori',
    '/berulang',
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
}
