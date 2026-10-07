import { randomUUID } from 'node:crypto';
import { type APIRequestContext, type Browser, expect, type Page } from '@playwright/test';

export const PASSWORD = 'rahasia12345';

export function uniqueEmail() {
  return `e2e-${randomUUID()}@contoh.id`;
}

/**
 * Daftar lewat API. Request memakai konteks browser yang sama, jadi cookie refresh ikut
 * tersimpan dan halaman berikutnya langsung masuk.
 */
export async function signUpViaApi(request: APIRequestContext, name = 'Penguji E2E') {
  const email = uniqueEmail();
  const res = await request.post('/api/v1/auth/register', {
    data: { name, email, password: PASSWORD, acceptPrivacy: true },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { accessToken } = (await res.json()) as { accessToken: string };

  const post = async <T>(path: string, data: unknown): Promise<T> => {
    const r = await request.post(`/api/v1${path}`, {
      data,
      headers: { Authorization: `Bearer ${accessToken}`, 'Idempotency-Key': randomUUID() },
    });
    expect(r.ok(), await r.text()).toBe(true);
    return (await r.json()) as T;
  };
  const get = async <T>(path: string): Promise<T> => {
    const r = await request.get(`/api/v1${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(r.ok(), await r.text()).toBe(true);
    return (await r.json()) as T;
  };
  const put = async <T>(path: string, data: unknown): Promise<T> => {
    const r = await request.put(`/api/v1${path}`, {
      data,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(r.ok(), await r.text()).toBe(true);
    return (await r.json()) as T;
  };
  return { email, post, get, put };
}

/** Tunggu intro logo hilang dan skeleton selesai. */
export async function waitForApp(page: Page) {
  // Cek sesi (refresh token) bisa > 10 detik saat database jarak jauh sedang lambat.
  await expect(page.getByRole('status', { name: 'Memuat Catatku' })).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 20_000 });
}

const pad = (n: number) => String(n).padStart(2, '0');

function receiptHtml(date: Date) {
  const stamp = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${String(date.getFullYear()).slice(2)}-19:42`;
  const row = (left: string, right: string) =>
    `<div class="row"><span>${left}</span><span>${right}</span></div>`;
  return `<!doctype html><html><head><style>
    body { margin: 0; background: #fff; }
    .paper { width: 360px; padding: 24px 20px; font: 600 15px/1.5 'Courier New', monospace; color: #111; }
    .center { text-align: center; }
    .row { display: flex; justify-content: space-between; gap: 12px; }
    hr { border: 0; border-top: 1px dashed #111; margin: 8px 0; }
  </style></head><body><div class="paper">
    <div class="center">INDOMARET<br>PT. INDOMARCO PRISMATAMA<br>JL. KEBON JERUK RAYA NO. 12</div>
    <hr>
    <div>${stamp} 2.0.31 T3PK/01</div>
    <hr>
    ${row('INDOMIE GORENG 2', '6,200')}
    ${row('AQUA 600ML 1', '3,500')}
    ${row('ROTI TAWAR 1', '16,900')}
    ${row('SUSU UHT 2', '20,900')}
    <hr>
    ${row('TOTAL ITEM', '6')}
    ${row('TOTAL :', '47,500')}
    ${row('TUNAI :', '50,000')}
    ${row('KEMBALI :', '2,500')}
    <hr>
    <div class="center">TERIMA KASIH</div>
  </div></body></html>`;
}

/** Struk minimarket bergaya printer thermal (TOTAL 47,500), dirender jadi PNG di tab terpisah. */
export async function renderReceiptPng(browser: Browser, date: Date) {
  const shooter = await browser.newPage({ viewport: { width: 400, height: 600 } });
  await shooter.setContent(receiptHtml(date));
  const image = await shooter.locator('.paper').screenshot({ type: 'png' });
  await shooter.close();
  return { name: 'struk.png', mimeType: 'image/png', buffer: image };
}
