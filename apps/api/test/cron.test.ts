import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from './helpers';

const SECRET = 'rahasia-cron-khusus-tes-12345';

describe('endpoint cron (pemicu pg_cron di Vercel)', () => {
  it('tanpa rahasia / rahasia salah → 404', async () => {
    await request(app).post('/api/v1/cron/recurring').expect(404);
    await request(app)
      .post('/api/v1/cron/reminders')
      .set('Authorization', 'Bearer rahasia-yang-salah-sama-sekali')
      .expect(404);
  });

  it('rahasia benar menjalankan job dan mengembalikan ringkasan', async () => {
    const recurring = await request(app)
      .post('/api/v1/cron/recurring')
      .set('Authorization', `Bearer ${SECRET}`)
      .expect(200);
    expect(recurring.body).toEqual({ created: expect.any(Number) });

    const reminders = await request(app)
      .post('/api/v1/cron/reminders')
      .set('Authorization', `Bearer ${SECRET}`)
      .expect(200);
    expect(reminders.body).toMatchObject({
      sent: expect.any(Number),
      debts: expect.any(Number),
      bankPending: expect.any(Number),
      pruned: expect.any(Number),
    });
  }, 120_000);
});
