import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

/**
 * E2E berjalan terhadap API + web dev server sungguhan (database dari apps/api/.env).
 * Setiap tes membuat akun baru, jadi aman dijalankan berulang di database dev.
 * PW_CHANNEL=msedge|chrome memakai browser terpasang; tanpa itu pakai Chromium Playwright
 * (`npx playwright install chromium`).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], channel: process.env.PW_CHANNEL },
    },
    {
      // Tata letak sidebar hanya muncul di layar lebar; cukup diaudit a11y-nya.
      name: 'desktop',
      testMatch: 'a11y.spec.ts',
      use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL },
    },
  ],
  webServer: {
    command: 'npm run dev',
    cwd: '../..',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
