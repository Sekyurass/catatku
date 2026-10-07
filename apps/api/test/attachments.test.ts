import {
  ATTACHMENT_MAX_BYTES,
  type AttachmentDTO,
  FEATURE_FLAGS,
  MAX_ATTACHMENTS_PER_TRANSACTION,
} from '@catatku/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { createMemoryStorage, setStorageForTests } from '../src/lib/storage';
import { purgeOrphanAttachments } from '../src/modules/attachments/attachment.service';
import { authed, createWallet, registerUser, type TestUser } from './helpers';

const KEY = FEATURE_FLAGS.ATTACHMENTS;
let storage = createMemoryStorage();

async function enableFor(user: TestUser) {
  await prisma.featureFlag.upsert({
    where: { key: KEY },
    create: { key: KEY, enabled: true, plan: 'PREMIUM', userIds: [user.id] },
    update: { enabled: true, plan: 'PREMIUM', userIds: { push: user.id } },
  });
}

/** Header RIFF....WEBP cukup untuk lolos pemeriksaan jenis berkas. */
function webp(size = 64) {
  const buf = Buffer.alloc(size);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WEBP', 8, 'ascii');
  return buf;
}

beforeAll(async () => {
  await prisma.featureFlag.upsert({ where: { key: KEY }, create: { key: KEY }, update: {} });
});

beforeEach(() => {
  storage = createMemoryStorage();
  setStorageForTests(storage);
});

afterAll(async () => {
  await prisma.featureFlag.update({
    where: { key: KEY },
    data: { enabled: false, plan: null, userIds: [] },
  });
});

async function setup() {
  const user = await registerUser();
  await enableFor(user);
  const wallet = await createWallet(user, { initialBalance: 1_000_000 });
  const tx = await authed(user).post('/api/v1/transactions').send({
    type: 'EXPENSE',
    amount: 25_000,
    walletId: wallet.id,
    categoryId: 'cat_belanja',
    date: '2026-10-07',
    note: 'Indomaret',
  });
  return { user, wallet, txId: tx.body.id as string };
}

const upload = (user: TestUser, txId: string, body: Buffer, type = 'image/webp') =>
  authed(user)
    .post(`/api/v1/transactions/${txId}/attachments`)
    .set('Content-Type', type)
    .send(body);

describe('lampiran transaksi', () => {
  it('404 bila flag nonaktif', async () => {
    const user = await registerUser();
    const wallet = await createWallet(user);
    const tx = await authed(user).post('/api/v1/transactions').send({
      type: 'EXPENSE',
      amount: 1_000,
      walletId: wallet.id,
      categoryId: 'cat_makan',
      date: '2026-10-07',
    });
    expect((await upload(user, tx.body.id, webp())).status).toBe(404);
    expect((await authed(user).get(`/api/v1/transactions/${tx.body.id}/attachments`)).status).toBe(
      404,
    );
  });

  it('flag dianggap mati bila penyimpanan belum dikonfigurasi', async () => {
    const { user, txId } = await setup();
    setStorageForTests(null);
    const features = await authed(user).get('/api/v1/features');
    expect(features.body.flags[KEY]).toBe(false);
    expect((await upload(user, txId, webp())).status).toBe(404);
  });

  it('unggah, daftar dengan tautan bertanda tangan, jumlah di transaksi, lalu hapus', async () => {
    const { user, txId } = await setup();
    const res = await upload(user, txId, webp(200));
    expect(res.status).toBe(201);
    const att = res.body as AttachmentDTO;
    expect(att).toMatchObject({ transactionId: txId, mimeType: 'image/webp', size: 200 });
    expect(att.url).toMatch(/^memory:\/\//);

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: att.id } });
    expect(row.storageKey.startsWith(`${user.id}/${txId}/`)).toBe(true);
    expect(storage.objects.has(row.storageKey)).toBe(true);

    const list = await authed(user).get(`/api/v1/transactions/${txId}/attachments`);
    expect(list.body.items.map((a: AttachmentDTO) => a.id)).toEqual([att.id]);
    expect((await authed(user).get(`/api/v1/transactions/${txId}`)).body.attachmentCount).toBe(1);

    expect((await authed(user).delete(`/api/v1/attachments/${att.id}`)).status).toBe(204);
    expect(storage.objects.size).toBe(0);
    expect(await prisma.attachment.count({ where: { transactionId: txId } })).toBe(0);
  });

  it('jenis berkas dicek dari isinya, bukan header', async () => {
    const { user, txId } = await setup();
    const fake = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const res = await upload(user, txId, fake, 'image/png');
    expect(res.status).toBe(400);
    expect((await upload(user, txId, webp(), 'application/pdf')).status).toBe(400);
    expect(storage.objects.size).toBe(0);
  });

  it('menolak berkas terlalu besar dan lampiran melebihi batas', async () => {
    const { user, txId } = await setup();
    expect((await upload(user, txId, webp(ATTACHMENT_MAX_BYTES + 1))).status).toBe(413);
    for (let i = 0; i < MAX_ATTACHMENTS_PER_TRANSACTION; i++) {
      expect((await upload(user, txId, webp())).status).toBe(201);
    }
    expect((await upload(user, txId, webp())).status).toBe(400);
  });

  it('pengguna lain tidak bisa melihat, mengunggah, atau menghapus (IDOR)', async () => {
    const owner = await setup();
    const intruder = await registerUser();
    await enableFor(intruder);
    const att = (await upload(owner.user, owner.txId, webp())).body as AttachmentDTO;

    expect(
      (await authed(intruder).get(`/api/v1/transactions/${owner.txId}/attachments`)).status,
    ).toBe(404);
    expect((await upload(intruder, owner.txId, webp())).status).toBe(404);
    expect((await authed(intruder).delete(`/api/v1/attachments/${att.id}`)).status).toBe(404);
    expect(storage.objects.size).toBe(1);
  });

  it('transaksi terhapus permanen: berkas dibersihkan', async () => {
    const { user, txId } = await setup();
    await upload(user, txId, webp());
    await upload(user, txId, webp());
    expect(storage.objects.size).toBe(2);

    // Hapus biasa (bisa diurungkan) tidak menyentuh berkas.
    await authed(user).delete(`/api/v1/transactions/${txId}`);
    await purgeOrphanAttachments();
    expect(storage.objects.size).toBe(2);

    await prisma.transaction.delete({ where: { id: txId } });
    const orphans = await prisma.attachment.count({ where: { userId: user.id } });
    expect(orphans).toBe(2);
    expect(await purgeOrphanAttachments()).toBeGreaterThanOrEqual(2);
    expect(storage.objects.size).toBe(0);
    expect(await prisma.attachment.count({ where: { userId: user.id } })).toBe(0);
  });
});
