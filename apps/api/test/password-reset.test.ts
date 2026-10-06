import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { testOutbox } from '../src/lib/mailer';
import { prisma } from '../src/lib/prisma';
import { app, refreshCookie, registerUser, uniqueEmail } from './helpers';

const forgot = (email: string) => request(app).post('/api/v1/auth/forgot-password').send({ email });
const reset = (token: string, password: string) =>
  request(app).post('/api/v1/auth/reset-password').send({ token, password });

function tokenFromOutbox(to: string): string {
  const mail = testOutbox.findLast((m) => m.to === to);
  if (!mail) throw new Error(`Tidak ada email untuk ${to}`);
  const match = /#token=([\w-]+)/.exec(mail.text);
  if (!match) throw new Error('Tautan reset tidak ditemukan');
  return match[1]!;
}

beforeEach(() => {
  testOutbox.length = 0;
});

describe('POST /auth/forgot-password', () => {
  it('mengirim tautan reset dengan token di fragmen URL', async () => {
    const user = await registerUser('Sari');
    const res = await forgot(user.email.toUpperCase());
    expect(res.status).toBe(204);
    expect(testOutbox).toHaveLength(1);
    const mail = testOutbox[0]!;
    expect(mail.to).toBe(user.email);
    expect(mail.text).toContain('Halo Sari');
    expect(mail.text).toMatch(/\/atur-ulang-kata-sandi#token=[\w-]{20,}/);

    const stored = await prisma.passwordResetToken.findFirst({ where: { userId: user.id } });
    expect(stored?.tokenHash).not.toContain(tokenFromOutbox(user.email));
  });

  it('respons sama untuk email yang tidak terdaftar, tanpa mengirim email', async () => {
    const res = await forgot(uniqueEmail());
    expect(res.status).toBe(204);
    expect(testOutbox).toHaveLength(0);
  });

  it('tidak mengirim ulang dalam jeda satu menit', async () => {
    const user = await registerUser();
    await forgot(user.email);
    await forgot(user.email);
    expect(testOutbox).toHaveLength(1);
  });

  it('memvalidasi format email', async () => {
    const res = await forgot('bukan-email');
    expect(res.status).toBe(400);
    expect(res.body.error.fields.email).toBeDefined();
  });
});

describe('POST /auth/reset-password', () => {
  it('mengganti kata sandi, mencabut sesi lama, dan langsung masuk', async () => {
    const user = await registerUser();
    await forgot(user.email);
    const token = tokenFromOutbox(user.email);

    const res = await reset(token, 'sandibaru123');
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(typeof res.body.accessToken).toBe('string');
    expect(refreshCookie(res)).toBeDefined();

    const oldSession = await request(app).post('/api/v1/auth/refresh').set('Cookie', user.cookie);
    expect(oldSession.status).toBe(401);

    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'sandibaru123' });
    expect(newLogin.status).toBe(200);
  });

  it('token hanya bisa dipakai sekali', async () => {
    const user = await registerUser();
    await forgot(user.email);
    const token = tokenFromOutbox(user.email);
    expect((await reset(token, 'sandibaru123')).status).toBe(200);
    const again = await reset(token, 'sandilain123');
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('menolak token kedaluwarsa dan token asal-asalan', async () => {
    const user = await registerUser();
    await forgot(user.email);
    const token = tokenFromOutbox(user.email);
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await reset(token, 'sandibaru123')).body.error.code).toBe('INVALID_RESET_TOKEN');
    expect((await reset('token-palsu', 'sandibaru123')).body.error.code).toBe(
      'INVALID_RESET_TOKEN',
    );
  });

  it('permintaan baru membatalkan tautan sebelumnya', async () => {
    const user = await registerUser();
    await forgot(user.email);
    const first = tokenFromOutbox(user.email);
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });
    await forgot(user.email);
    const second = tokenFromOutbox(user.email);
    expect(second).not.toBe(first);
    expect((await reset(first, 'sandibaru123')).status).toBe(400);
    expect((await reset(second, 'sandibaru123')).status).toBe(200);
  });

  it('memvalidasi panjang kata sandi baru', async () => {
    const res = await reset('apa-saja', '123');
    expect(res.status).toBe(400);
    expect(res.body.error.fields.password).toBeDefined();
  });
});
