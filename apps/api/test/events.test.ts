import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { app, authed, createWallet, registerUser } from './helpers';

/** Event ditulis fire-and-forget, jadi tunggu sebentar sampai muncul. */
async function eventsOf(userId: string, minCount: number) {
  for (let i = 0; i < 40; i++) {
    const rows = await prisma.analyticsEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { name: true, props: true },
    });
    if (rows.length >= minCount) return rows;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Event untuk ${userId} kurang dari ${minCount}`);
}

describe('event analitik', () => {
  it('mencatat event server tanpa data sensitif', async () => {
    const user = await registerUser();
    await createWallet(user, { name: 'Gaji BCA', type: 'BANK', initialBalance: 2_500_000 });

    const rows = await eventsOf(user.id, 2);
    expect(rows.map((r) => r.name)).toEqual(['user_registered', 'wallet_created']);
    expect(rows[1]!.props).toEqual({ type: 'BANK' });
    const raw = JSON.stringify(rows);
    expect(raw).not.toContain('Gaji BCA');
    expect(raw).not.toContain('2500000');
    expect(raw).not.toContain(user.email);
  });

  it('POST /events menerima event klien yang dikenal', async () => {
    const user = await registerUser();
    const res = await authed(user)
      .post('/api/v1/events')
      .send({ name: 'onboarding_skipped', step: 2 });
    expect(res.status).toBe(204);

    const rows = await eventsOf(user.id, 2);
    expect(rows[1]).toEqual({ name: 'onboarding_skipped', props: { step: 2 } });
  });

  it('POST /events mencatat hasil pindai struk tanpa isi struknya', async () => {
    const user = await registerUser();
    const res = await authed(user)
      .post('/api/v1/events')
      .send({ name: 'receipt_scanned', fields: 2 });
    expect(res.status).toBe(204);
    const rows = await eventsOf(user.id, 2);
    expect(rows[1]).toEqual({ name: 'receipt_scanned', props: { fields: 2 } });

    const tooMany = await authed(user)
      .post('/api/v1/events')
      .send({ name: 'receipt_scanned', fields: 4 });
    expect(tooMany.status).toBe(400);
  });

  it('POST /events mencatat penerimaan saran kategori', async () => {
    const user = await registerUser();
    const res = await authed(user)
      .post('/api/v1/events')
      .send({ name: 'category_suggestion', source: 'keyword', accepted: true });
    expect(res.status).toBe(204);
    const rows = await eventsOf(user.id, 2);
    expect(rows[1]).toEqual({
      name: 'category_suggestion',
      props: { source: 'keyword', accepted: true },
    });
    const badSource = await authed(user)
      .post('/api/v1/events')
      .send({ name: 'category_suggestion', source: 'llm', accepted: true });
    expect(badSource.status).toBe(400);
  });

  it('POST /events menolak nama tak dikenal dan tanpa login', async () => {
    const user = await registerUser();
    const unknown = await authed(user).post('/api/v1/events').send({ name: 'wallet_created' });
    expect(unknown.status).toBe(400);
    const badStep = await authed(user)
      .post('/api/v1/events')
      .send({ name: 'onboarding_completed', step: 9 });
    expect(badStep.status).toBe(400);
    expect(
      (await request(app).post('/api/v1/events').send({ name: 'onboarding_completed' })).status,
    ).toBe(401);
  });
});
