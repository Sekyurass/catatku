import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { app, refreshCookie, registerUser, uniqueEmail } from './helpers';

describe('POST /auth/register', () => {
  it('membuat akun, mengembalikan access token, dan memasang cookie refresh httpOnly', async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Budi', email: email.toUpperCase(), password: 'rahasia123' });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email, name: 'Budi', plan: 'FREE' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(typeof res.body.accessToken).toBe('string');

    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('catatku_rt='),
    );
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('menolak email yang sudah terdaftar', async () => {
    const user = await registerUser();
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Lagi', email: user.email, password: 'rahasia123' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
    expect(res.body.error.fields.email).toBeDefined();
  });

  it('mengembalikan error validasi per field', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: '', email: 'bukan-email', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['email', 'name', 'password']);
  });
});

describe('POST /auth/login', () => {
  it('berhasil dengan kredensial benar', async () => {
    const user = await registerUser();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(refreshCookie(res)).toBeDefined();
  });

  it('pesan sama untuk sandi salah dan email tak dikenal', async () => {
    const user = await registerUser();
    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'salahsekali' });
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail(), password: 'salahsekali' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('POST /auth/refresh', () => {
  it('merotasi refresh token dan menolak token lama', async () => {
    const user = await registerUser();
    const first = await request(app).post('/api/v1/auth/refresh').set('Cookie', user.cookie);
    expect(first.status).toBe(200);
    expect(first.body.user.id).toBe(user.id);
    const rotated = refreshCookie(first);
    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(user.cookie);

    const reused = await request(app).post('/api/v1/auth/refresh').set('Cookie', user.cookie);
    expect(reused.status).toBe(401);

    const next = await request(app).post('/api/v1/auth/refresh').set('Cookie', rotated!);
    expect(next.status).toBe(200);
  });

  it('401 tanpa cookie', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('POST /auth/logout', () => {
  it('mencabut refresh token', async () => {
    const user = await registerUser();
    const out = await request(app).post('/api/v1/auth/logout').set('Cookie', user.cookie);
    expect(out.status).toBe(204);
    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', user.cookie);
    expect(res.status).toBe(401);
  });
});

describe('proteksi endpoint', () => {
  it('menolak tanpa token dan token palsu', async () => {
    expect((await request(app).get('/api/v1/features')).status).toBe(401);
    const fake = await request(app).get('/api/v1/features').set('Authorization', 'Bearer palsu');
    expect(fake.status).toBe(401);
  });

  it('mengizinkan dengan token valid; semua flag fase lanjut nonaktif', async () => {
    const user = await registerUser();
    const res = await request(app)
      .get('/api/v1/features')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(Object.values(res.body.flags).every((v) => v === false)).toBe(true);
  });
});

describe('rate limit auth', () => {
  it('membalas 429 setelah melewati batas', async () => {
    const limited = createApp({ authRateLimit: 3 });
    const body = { email: uniqueEmail(), password: 'salahsekali' };
    for (let i = 0; i < 3; i++) {
      expect((await request(limited).post('/api/v1/auth/login').send(body)).status).toBe(401);
    }
    const res = await request(limited).post('/api/v1/auth/login').send(body);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
