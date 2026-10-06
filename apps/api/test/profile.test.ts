import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, authed, refreshCookie, registerUser, uniqueEmail } from './helpers';

describe('GET /me', () => {
  it('mengembalikan profil pengguna yang sedang masuk', async () => {
    const user = await registerUser('Sari');
    const res = await authed(user).get('/api/v1/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, email: user.email, name: 'Sari' });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('401 tanpa token', async () => {
    expect((await request(app).get('/api/v1/me')).status).toBe(401);
  });
});

describe('PATCH /me', () => {
  it('mengubah nama tanpa kata sandi', async () => {
    const user = await registerUser('Lama');
    const res = await authed(user).patch('/api/v1/me').send({ name: '  Nama Baru  ' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Nama Baru');
    expect((await authed(user).get('/api/v1/me')).body.user.name).toBe('Nama Baru');
  });

  it('mengganti email butuh kata sandi saat ini', async () => {
    const user = await registerUser();
    const email = uniqueEmail();

    const missing = await authed(user).patch('/api/v1/me').send({ email });
    expect(missing.status).toBe(400);
    expect(missing.body.error.fields.currentPassword).toBeDefined();

    const wrong = await authed(user)
      .patch('/api/v1/me')
      .send({ email, currentPassword: 'salahsekali' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.fields.currentPassword).toBe('Kata sandi saat ini salah');

    const ok = await authed(user)
      .patch('/api/v1/me')
      .send({ email: email.toUpperCase(), currentPassword: user.password });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe(email);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: user.password });
    expect(login.status).toBe(200);
  });

  it('email yang sama dengan sekarang tidak butuh kata sandi', async () => {
    const user = await registerUser();
    const res = await authed(user).patch('/api/v1/me').send({ email: user.email, name: 'Tetap' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Tetap');
  });

  it('menolak email milik akun lain', async () => {
    const a = await registerUser();
    const b = await registerUser();
    const res = await authed(a)
      .patch('/api/v1/me')
      .send({ email: b.email, currentPassword: a.password });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
    expect(res.body.error.fields.email).toBeDefined();
  });

  it('validasi per field', async () => {
    const user = await registerUser();
    const res = await authed(user).patch('/api/v1/me').send({ name: '', email: 'bukan-email' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['email', 'name']);
  });
});

const webp = (size = 64) => {
  const bytes = Buffer.alloc(size, 7);
  bytes.write('RIFF', 0, 'ascii');
  bytes.write('WEBP', 8, 'ascii');
  return bytes;
};

describe('/me/avatar', () => {
  it('menyimpan, mengembalikan, lalu menghapus foto profil', async () => {
    const user = await registerUser();
    expect((await authed(user).get('/api/v1/me')).body.user.avatarUpdatedAt).toBeNull();
    expect((await authed(user).get('/api/v1/me/avatar')).status).toBe(404);

    const image = webp();
    const put = await authed(user)
      .put('/api/v1/me/avatar')
      .set('Content-Type', 'image/webp')
      .send(image);
    expect(put.status).toBe(200);
    expect(typeof put.body.user.avatarUpdatedAt).toBe('string');

    const got = await authed(user).get('/api/v1/me/avatar').buffer(true);
    expect(got.status).toBe(200);
    expect(got.headers['content-type']).toBe('image/webp');
    expect(Buffer.compare(got.body as Buffer, image)).toBe(0);

    const del = await authed(user).delete('/api/v1/me/avatar');
    expect(del.status).toBe(200);
    expect(del.body.user.avatarUpdatedAt).toBeNull();
    expect((await authed(user).get('/api/v1/me/avatar')).status).toBe(404);
  });

  it('jenis file ditentukan dari isi, bukan dari Content-Type', async () => {
    const user = await registerUser();
    const fake = await authed(user)
      .put('/api/v1/me/avatar')
      .set('Content-Type', 'image/png')
      .send(Buffer.from('<svg onload="alert(1)"></svg>'));
    expect(fake.status).toBe(400);

    const json = await authed(user).put('/api/v1/me/avatar').send({ image: 'abc' });
    expect(json.status).toBe(400);
  });

  it('menolak file yang terlalu besar', async () => {
    const user = await registerUser();
    const res = await authed(user)
      .put('/api/v1/me/avatar')
      .set('Content-Type', 'image/webp')
      .send(webp(400_000));
    expect(res.status).toBe(413);
  });

  it('401 tanpa token', async () => {
    expect((await request(app).get('/api/v1/me/avatar')).status).toBe(401);
  });
});

describe('PUT /me/password', () => {
  it('mengganti kata sandi, mengakhiri sesi lain, dan memberi sesi baru', async () => {
    const user = await registerUser();
    const other = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password });
    const otherCookie = refreshCookie(other)!;

    const res = await authed(user)
      .put('/api/v1/me/password')
      .send({ currentPassword: user.password, newPassword: 'sandibaru123' });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    const fresh = refreshCookie(res);
    expect(fresh).toBeDefined();

    for (const cookie of [user.cookie, otherCookie]) {
      const r = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
      expect(r.status).toBe(401);
    }
    // Token lama yang dipakai ulang tidak boleh ikut mematikan sesi baru.
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', fresh!)).status).toBe(
      200,
    );

    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'sandibaru123' });
    expect(newLogin.status).toBe(200);
  });

  it('menolak kata sandi saat ini yang salah', async () => {
    const user = await registerUser();
    const res = await authed(user)
      .put('/api/v1/me/password')
      .send({ currentPassword: 'salahsekali', newPassword: 'sandibaru123' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.currentPassword).toBe('Kata sandi saat ini salah');
  });

  it('menolak sandi baru yang terlalu pendek atau sama dengan yang lama', async () => {
    const user = await registerUser();
    const short = await authed(user)
      .put('/api/v1/me/password')
      .send({ currentPassword: user.password, newPassword: '123' });
    expect(short.status).toBe(400);
    expect(short.body.error.fields.newPassword).toBeDefined();

    const same = await authed(user)
      .put('/api/v1/me/password')
      .send({ currentPassword: user.password, newPassword: user.password });
    expect(same.status).toBe(400);
    expect(same.body.error.fields.newPassword).toBeDefined();
  });
});
