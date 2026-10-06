import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';

export const app = createApp();

export function uniqueEmail() {
  return `tes-${randomUUID()}@contoh.id`;
}

export function refreshCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('catatku_rt='))?.split(';')[0];
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
  cookie: string;
}

export async function registerUser(name = 'Penguji'): Promise<TestUser> {
  const email = uniqueEmail();
  const password = 'rahasia123';
  const res = await request(app).post('/api/v1/auth/register').send({ name, email, password });
  if (res.status !== 201)
    throw new Error(`Gagal daftar: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    id: res.body.user.id,
    email,
    password,
    token: res.body.accessToken,
    cookie: refreshCookie(res)!,
  };
}

export function authed(user: TestUser) {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${user.token}`);
  return {
    get: (url: string) => auth(request(app).get(url)),
    post: (url: string) => auth(request(app).post(url)),
    patch: (url: string) => auth(request(app).patch(url)),
    put: (url: string) => auth(request(app).put(url)),
    delete: (url: string) => auth(request(app).delete(url)),
  };
}
