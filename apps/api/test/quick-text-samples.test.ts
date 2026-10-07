import { FEATURE_FLAGS, type QuickTextValues } from '@catatku/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { purgeExpiredSamples } from '../src/modules/quickText/quickText.service';
import { authed, registerUser } from './helpers';

const KEY = FEATURE_FLAGS.NATURAL_INPUT;

beforeAll(async () => {
  await prisma.featureFlag.upsert({ where: { key: KEY }, create: { key: KEY }, update: {} });
});

afterAll(async () => {
  await prisma.featureFlag.update({
    where: { key: KEY },
    data: { enabled: false, plan: null, userIds: [] },
  });
});

async function newUser() {
  const user = await registerUser();
  await prisma.featureFlag.update({
    where: { key: KEY },
    data: { enabled: true, plan: 'PREMIUM', userIds: { push: user.id } },
  });
  return user;
}

const parsed: QuickTextValues = {
  type: 'EXPENSE',
  amount: 500_000,
  dateOffset: 0,
  wallet: null,
  toWallet: null,
  category: null,
  note: 'Tf ke 0812-3456-7890',
};
// Tanpa deret angka panjang: angka ≥ 10 digit ikut tersamar.
const marker = `uji-${Math.random().toString(36).slice(2, 10).replace(/\d/g, 'x')}`;
const sample = (over: Partial<{ text: string; final: Partial<QuickTextValues> }> = {}) => ({
  text: over.text ?? `tf 500rb ke 0812-3456-7890 ${marker}`,
  parsed,
  final: { ...parsed, category: 'Keluarga', wallet: { name: 'BCA', type: 'BANK' }, ...over.final },
});

describe('dataset ketikan cepat', () => {
  it('flag mati: 404', async () => {
    const user = await registerUser();
    expect((await authed(user).get('/api/v1/quick-text/sharing')).status).toBe(404);
  });

  it('opt-in wajib; sampel disimpan tanpa identitas & tersamar', async () => {
    const user = await newUser();
    expect((await authed(user).get('/api/v1/quick-text/sharing').expect(200)).body).toEqual({
      enabled: false,
    });
    await authed(user).post('/api/v1/quick-text/samples').send(sample()).expect(403);

    await authed(user).put('/api/v1/quick-text/sharing').send({ enabled: true }).expect(200);
    await authed(user).post('/api/v1/quick-text/samples').send(sample()).expect(204);

    const rows = await prisma.quickTextSample.findMany({ where: { text: { contains: marker } } });
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.text).toBe(`tf 500rb ke [nomor] ${marker}`);
    expect(row.text).not.toContain(user.email);
    expect((row.parsed as QuickTextValues).note).toBe('Tf ke [nomor]');
    expect(row.corrected).toEqual(['wallet', 'category']);
    expect(Object.keys(row)).not.toContain('userId');
    const days = (row.expiresAt.getTime() - row.createdOn.getTime()) / 86_400_000;
    expect(days).toBe(90);

    // Tanpa koreksi: diabaikan.
    await authed(user)
      .post('/api/v1/quick-text/samples')
      .send({ text: `persis ${marker}`, parsed, final: parsed })
      .expect(204);
    expect(await prisma.quickTextSample.count({ where: { text: `persis ${marker}` } })).toBe(0);

    await authed(user).put('/api/v1/quick-text/sharing').send({ enabled: false }).expect(200);
    await authed(user).post('/api/v1/quick-text/samples').send(sample()).expect(403);
  });

  it('validasi isian', async () => {
    const user = await newUser();
    await authed(user).put('/api/v1/quick-text/sharing').send({ enabled: true }).expect(200);
    await authed(user)
      .post('/api/v1/quick-text/samples')
      .send(sample({ text: 'x'.repeat(201) }))
      .expect(400);
    await authed(user)
      .post('/api/v1/quick-text/samples')
      .send({ ...sample(), final: { ...parsed, amount: -1 } })
      .expect(400);
  });

  it('sampel kedaluwarsa dihapus', async () => {
    const old = await prisma.quickTextSample.create({
      data: {
        text: `lama ${marker}`,
        parsed,
        final: parsed,
        corrected: ['amount'],
        createdOn: new Date('2025-01-01'),
        expiresAt: new Date('2025-04-01'),
      },
    });
    expect(await purgeExpiredSamples()).toBeGreaterThanOrEqual(1);
    expect(await prisma.quickTextSample.findUnique({ where: { id: old.id } })).toBeNull();
  });
});
