import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, type Page } from '@playwright/test';

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
    data: { name, email, password: PASSWORD },
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
  return { email, post, get };
}

/** Tunggu intro logo hilang dan skeleton selesai. */
export async function waitForApp(page: Page) {
  await expect(page.getByRole('status', { name: 'Memuat Catatku' })).toHaveCount(0);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}
