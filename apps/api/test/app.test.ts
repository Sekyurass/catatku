import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { evaluateFlag, parseForcedFlags } from '../src/modules/features/featureFlag.service';
import { app } from './helpers';

describe('infrastruktur', () => {
  it('GET /health melaporkan database', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
  });

  it('format error konsisten untuk endpoint tak dikenal', async () => {
    const res = await request(app).get('/tidak-ada');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });

  it('JSON rusak menjadi VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('memasang header keamanan helmet', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('feature flag', () => {
  const free = { id: 'u1', plan: 'FREE' as const };
  const premium = { id: 'u2', plan: 'PREMIUM' as const };
  const base = { key: 'x', enabled: true, plan: null, userIds: [] as string[] };
  const none = new Map<string, boolean>();

  it('nonaktif atau tidak ada = false', () => {
    expect(evaluateFlag(undefined, free, none)).toBe(false);
    expect(evaluateFlag({ ...base, enabled: false }, free, none)).toBe(false);
  });

  it('per paket dan allowlist pengguna', () => {
    expect(evaluateFlag(base, free, none)).toBe(true);
    const premiumOnly = { ...base, plan: 'PREMIUM' as const };
    expect(evaluateFlag(premiumOnly, free, none)).toBe(false);
    expect(evaluateFlag(premiumOnly, premium, none)).toBe(true);
    expect(evaluateFlag({ ...premiumOnly, userIds: ['u1'] }, free, none)).toBe(true);
  });

  it('override env menang', () => {
    const forced = parseForcedFlags('x:off, y:on, rusak');
    expect(forced.get('x')).toBe(false);
    expect(forced.get('y')).toBe(true);
    expect(forced.has('rusak')).toBe(false);
    expect(evaluateFlag(base, free, forced)).toBe(false);
  });
});
