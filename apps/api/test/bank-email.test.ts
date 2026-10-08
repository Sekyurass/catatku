import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { type BankEmailInboxDTO, type BankEmailPendingDTO, FEATURE_FLAGS } from '@catatku/shared';
import { dkimSign } from 'mailauth';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import {
  runPendingDigest,
  setDnsResolverForTests,
} from '../src/modules/bankEmail/bankEmail.service';
import { app, authed, createWallet, registerUser, type TestUser } from './helpers';

const KEY = FEATURE_FLAGS.BANK_EMAIL;
const SECRET = 'rahasia-inbound-khusus-tes-123';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const dkimRecord = `v=DKIM1; k=rsa; p=${publicKey.export({ type: 'spki', format: 'der' }).toString('base64')}`;

beforeAll(async () => {
  await prisma.featureFlag.upsert({ where: { key: KEY }, create: { key: KEY }, update: {} });
  setDnsResolverForTests(async (name, rrtype) => {
    if (rrtype === 'TXT' && /^sel\._domainkey\./.test(name)) return [[dkimRecord]];
    throw Object.assign(new Error(`queryTxt ENOTFOUND ${name}`), { code: 'ENOTFOUND' });
  });
});

afterAll(async () => {
  setDnsResolverForTests(null);
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

interface MailOptions {
  from?: string;
  to: string;
  subject?: string;
  body?: string;
  headers?: string[];
  contentType?: string;
}

const bcaBody = (reference = `REF${randomUUID().slice(0, 8)}`) =>
  [
    'Transaction Date : 08 Oct 2026 10:15:22',
    'Source of Fund : 1234567890',
    'Beneficiary Name : BUDI SANTOSO',
    'Transfer Amount : IDR 150,000.00',
    'Transfer Fee : IDR 2,500.00',
    'Total : IDR 152,500.00',
    `Reference No : ${reference}`,
  ].join('\r\n');

function compose({
  from = 'BCA <bca@bca.co.id>',
  to,
  subject,
  body,
  headers = [],
  contentType = 'text/plain',
}: MailOptions) {
  return [
    ...headers,
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject ?? 'Internet Transaction Journal'}`,
    'Date: Thu, 08 Oct 2026 03:15:30 +0000',
    `Message-ID: <${randomUUID()}@contoh.id>`,
    'MIME-Version: 1.0',
    `Content-Type: ${contentType}; charset=utf-8`,
    '',
    body ?? bcaBody(),
    '',
  ].join('\r\n');
}

// Tipe bawaan mailauth tidak sesuai implementasinya: penanda tangan membaca signatureData[].
async function sign(raw: string, signingDomain: string): Promise<Buffer> {
  const signatureData = [
    {
      signingDomain,
      selector: 'sel',
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    },
  ];
  const { signatures } = await dkimSign(raw, { signatureData } as unknown as Parameters<
    typeof dkimSign
  >[1]);
  return Buffer.from(signatures + raw);
}

const signed = (opts: MailOptions) =>
  sign(compose(opts), (opts.from ?? 'bca.co.id').match(/@([^>\s]+)/)?.[1] ?? 'bca.co.id');

const upload = (user: TestUser, raw: Buffer) =>
  authed(user).post('/api/v1/bank-email/upload').set('Content-Type', 'message/rfc822').send(raw);

const enable = async (user: TestUser) =>
  (await authed(user).put('/api/v1/bank-email').send({ enabled: true }).expect(200))
    .body as BankEmailInboxDTO;

describe('email bank: pengaturan', () => {
  it('flag mati: 404', async () => {
    const user = await registerUser();
    await authed(user).get('/api/v1/bank-email').expect(404);
  });

  it('aktifkan → alamat unik; ganti alamat; dompet harus milik sendiri', async () => {
    const user = await newUser();
    const initial = (await authed(user).get('/api/v1/bank-email').expect(200))
      .body as BankEmailInboxDTO;
    expect(initial).toMatchObject({
      enabled: false,
      address: null,
      receiving: true,
      pendingCount: 0,
    });

    const on = await enable(user);
    expect(on.address).toMatch(/^catat\+[a-f0-9]{20}@masuk\.contoh\.id$/);

    const rotated = (await authed(user).post('/api/v1/bank-email/address').expect(200))
      .body as BankEmailInboxDTO;
    expect(rotated.address).not.toBe(on.address);

    const other = await registerUser();
    const foreign = await createWallet(other);
    await authed(user).put('/api/v1/bank-email').send({ walletId: foreign.id }).expect(400);
    const own = await createWallet(user, { name: 'BCA', type: 'BANK' });
    const res = await authed(user).put('/api/v1/bank-email').send({ walletId: own.id }).expect(200);
    expect(res.body.walletId).toBe(own.id);

    await authed(user).put('/api/v1/bank-email').send({}).expect(400);
  });

  it('periksa kode konfirmasi: mengembalikan keadaan kotak masuk terbaru', async () => {
    const user = await newUser();
    const off = (await authed(user).post('/api/v1/bank-email/check').expect(200))
      .body as BankEmailInboxDTO;
    expect(off).toMatchObject({ enabled: false, forwardingCode: null });

    const on = await enable(user);
    const checked = (await authed(user).post('/api/v1/bank-email/check').expect(200))
      .body as BankEmailInboxDTO;
    expect(checked).toMatchObject({ enabled: true, address: on.address, forwardingCode: null });
  });
});

describe('email bank: unggah .eml', () => {
  it('email BCA bertanda tangan → menunggu konfirmasi; unggah ulang = ganda', async () => {
    const user = await newUser();
    const raw = await signed({ to: user.email });
    const res = await upload(user, raw).expect(200);
    expect(res.body.result).toBe('parsed');
    expect(res.body.pending).toMatchObject({
      source: 'bca',
      kind: 'transfer',
      type: 'EXPENSE',
      amount: 152_500,
      fee: 2_500,
      date: '2026-10-08',
      time: '10:15',
      accountHint: '1234****90',
      note: 'Transfer ke BUDI SANTOSO',
      confident: true,
    });

    const again = await upload(user, raw).expect(200);
    expect(again.body.result).toBe('duplicate');
    expect(again.body.pending.id).toBe(res.body.pending.id);

    const list = await authed(user).get('/api/v1/bank-email/pending').expect(200);
    expect(list.body.items).toHaveLength(1);
  });

  it('email myBCA berisi HTML saja tetap terbaca', async () => {
    const user = await newUser();
    const row = (label: string, value: string) =>
      `<tr>\r\n<td width="198">${label}</td>\r\n<td width="2">: </td>\r\n<td>${value}</td>\r\n</tr>`;
    const body = [
      '<html><body><div class="table-box"><table>',
      row('Status', 'Berhasil'),
      row('Tanggal Transaksi', '29 Sep 2026 11:37:09'),
      row('Jenis Transaksi', 'Pembayaran QRIS'),
      row('Pembayaran Ke', 'WARUNG KOPI CONTOH'),
      row('Total Bayar', 'IDR 5,000.00'),
      row('Nomor Referensi', `QRS${randomUUID().slice(0, 8)}`),
      '</table></div></body></html>',
    ].join('\r\n');
    const res = await upload(
      user,
      await signed({ to: user.email, body, contentType: 'text/html' }),
    ).expect(200);
    expect(res.body.result).toBe('parsed');
    expect(res.body.pending).toMatchObject({
      kind: 'qris',
      amount: 5_000,
      date: '2026-09-29',
      note: 'WARUNG KOPI CONTOH',
      confident: true,
    });
  });

  it('isi diubah setelah ditandatangani → ditolak', async () => {
    const user = await newUser();
    const raw = (await signed({ to: user.email })).toString().replace('152,500.00', '1,152,500.00');
    expect((await upload(user, Buffer.from(raw)).expect(200)).body.result).toBe(
      'rejected_signature',
    );
  });

  it('tanpa tanda tangan / domain tidak selaras → ditolak', async () => {
    const user = await newUser();
    const unsigned = Buffer.from(compose({ to: user.email }));
    expect((await upload(user, unsigned).expect(200)).body.result).toBe('rejected_signature');

    const spoofed = await sign(compose({ to: user.email }), 'penipu.example');
    expect((await upload(user, spoofed).expect(200)).body.result).toBe('rejected_signature');
  });

  it('dikirim ke orang lain → ditolak', async () => {
    const user = await newUser();
    const raw = await signed({ to: 'orang.lain@contoh.id' });
    expect((await upload(user, raw).expect(200)).body.result).toBe('rejected_recipient');
  });

  it('bukan email transaksi → tidak terbaca', async () => {
    const user = await newUser();
    const raw = await signed({ to: user.email, subject: 'Promo', body: 'Cashback Rp 50.000!' });
    expect((await upload(user, raw).expect(200)).body.result).toBe('unrecognized');
  });

  it('file kosong → 400', async () => {
    const user = await newUser();
    await upload(user, Buffer.alloc(0)).expect(400);
  });
});

describe('email bank: penerusan Gmail & webhook', () => {
  it('kode konfirmasi Gmail ditangkap; email ke Gmail sumber diterima', async () => {
    const user = await newUser();
    const inbox = await enable(user);
    const code = await signed({
      from: 'Gmail Team <forwarding-noreply@google.com>',
      to: inbox.address!,
      subject:
        '(#123456789) Gmail Forwarding Confirmation - Receive Mail from budi.santoso@gmail.com',
      body: 'Confirmation code: 123456789',
    });
    const res = await request(app)
      .post('/api/v1/inbound/email')
      .set('Authorization', `Bearer ${SECRET}`)
      .set('X-Envelope-To', inbox.address!)
      .set('Content-Type', 'message/rfc822')
      .send(code)
      .expect(202);
    expect(res.body.result).toBe('forwarding_code');

    const after = (await authed(user).get('/api/v1/bank-email').expect(200))
      .body as BankEmailInboxDTO;
    expect(after).toMatchObject({
      forwardingCode: '123456789',
      sourceEmail: 'budi.santoso@gmail.com',
      lastResult: 'forwarding_code',
    });

    // Diteruskan Gmail: amplop ke alamat Catatku, header To tetap Gmail pengguna (tanpa titik pun sama).
    const forwarded = await signed({
      to: 'budisantoso@gmail.com',
      headers: [`Delivered-To: ${inbox.address}`],
    });
    const viaHeader = await request(app)
      .post('/api/v1/inbound/email')
      .set('Authorization', `Bearer ${SECRET}`)
      .set('Content-Type', 'message/rfc822')
      .send(forwarded)
      .expect(202);
    expect(viaHeader.body.result).toBe('parsed');
    const list = await authed(user).get('/api/v1/bank-email/pending').expect(200);
    expect(list.body.items).toHaveLength(1);
  });

  it('webhook: rahasia salah 401; alamat tak dikenal / nonaktif diabaikan', async () => {
    const raw = await signed({ to: 'siapa@contoh.id' });
    await request(app)
      .post('/api/v1/inbound/email')
      .set('Authorization', 'Bearer salah')
      .set('Content-Type', 'message/rfc822')
      .send(raw)
      .expect(401);

    const unknown = await request(app)
      .post('/api/v1/inbound/email')
      .set('Authorization', `Bearer ${SECRET}`)
      .set('X-Envelope-To', 'catat+00000000000000000000@masuk.contoh.id')
      .set('Content-Type', 'message/rfc822')
      .send(raw)
      .expect(202);
    expect(unknown.body.result).toBe('ignored');

    const user = await newUser();
    const inbox = await enable(user);
    await authed(user).put('/api/v1/bank-email').send({ enabled: false }).expect(200);
    const off = await request(app)
      .post('/api/v1/inbound/email')
      .set('Authorization', `Bearer ${SECRET}`)
      .set('X-Envelope-To', inbox.address!)
      .set('Content-Type', 'message/rfc822')
      .send(await signed({ to: user.email }))
      .expect(202);
    expect(off.body.result).toBe('ignored');
  });
});

describe('email bank: konfirmasi', () => {
  async function pendingFor(user: TestUser): Promise<BankEmailPendingDTO> {
    const res = await upload(user, await signed({ to: user.email })).expect(200);
    return res.body.pending;
  }

  it('catat → tautkan transaksi; tidak bisa dua kali; pengguna lain tidak bisa', async () => {
    const user = await newUser();
    const wallet = await createWallet(user, { initialBalance: 1_000_000 });
    const pending = await pendingFor(user);
    const tx = await authed(user)
      .post('/api/v1/transactions')
      .send({
        type: 'EXPENSE',
        walletId: wallet.id,
        categoryId: 'cat_makan',
        amount: pending.amount,
        date: pending.date,
        note: pending.note,
      })
      .expect(201);

    const intruder = await newUser();
    await authed(intruder)
      .post(`/api/v1/bank-email/pending/${pending.id}/confirm`)
      .send({ transactionId: tx.body.id })
      .expect(404);

    const foreignWallet = await createWallet(intruder);
    const foreignTx = await authed(intruder)
      .post('/api/v1/transactions')
      .send({
        type: 'EXPENSE',
        walletId: foreignWallet.id,
        categoryId: 'cat_makan',
        amount: 1_000,
        date: '2026-10-08',
      })
      .expect(201);
    await authed(user)
      .post(`/api/v1/bank-email/pending/${pending.id}/confirm`)
      .send({ transactionId: foreignTx.body.id })
      .expect(400);

    await authed(user)
      .post(`/api/v1/bank-email/pending/${pending.id}/confirm`)
      .send({ transactionId: tx.body.id })
      .expect(204);
    await authed(user)
      .post(`/api/v1/bank-email/pending/${pending.id}/confirm`)
      .send({ transactionId: tx.body.id })
      .expect(409);
    expect(
      (await authed(user).get('/api/v1/bank-email/pending').expect(200)).body.items,
    ).toHaveLength(0);

    const second = await pendingFor(user);
    await authed(user)
      .post(`/api/v1/bank-email/pending/${second.id}/confirm`)
      .send({ transactionId: tx.body.id })
      .expect(409);
  });

  it('abaikan', async () => {
    const user = await newUser();
    const pending = await pendingFor(user);
    await authed(user).post(`/api/v1/bank-email/pending/${pending.id}/dismiss`).expect(204);
    await authed(user).post(`/api/v1/bank-email/pending/${pending.id}/dismiss`).expect(409);
    const inbox = (await authed(user).get('/api/v1/bank-email').expect(200))
      .body as BankEmailInboxDTO;
    expect(inbox.pendingCount).toBe(0);
  });
});

describe('email bank: ringkasan harian antrean', () => {
  it('sekali sehari mulai 19.00, hanya untuk antrean yang sudah lewat 3 jam', async () => {
    const user = await newUser();
    await prisma.featureFlag.upsert({
      where: { key: FEATURE_FLAGS.REMINDERS },
      create: { key: FEATURE_FLAGS.REMINDERS, enabled: true, userIds: [user.id] },
      update: { enabled: true, userIds: { push: user.id } },
    });
    const first = (await upload(user, await signed({ to: user.email })).expect(200)).body
      .pending as BankEmailPendingDTO;
    await upload(user, await signed({ to: user.email })).expect(200);
    const digests = () =>
      prisma.notification.findMany({
        where: { userId: user.id, dedupeKey: { startsWith: 'bank-pending:' } },
      });

    const evening = new Date('2026-10-08T13:00:00Z'); // 20.00 WIB
    await prisma.inboundTransaction.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(evening.getTime() - 60 * 60 * 1000) },
    });
    await runPendingDigest(evening);
    expect(await digests()).toHaveLength(0);

    await prisma.inboundTransaction.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(evening.getTime() - 4 * 60 * 60 * 1000) },
    });
    await runPendingDigest(new Date('2026-10-08T11:00:00Z')); // 18.00 WIB
    expect(await digests()).toHaveLength(0);

    await runPendingDigest(evening);
    await runPendingDigest(new Date('2026-10-08T14:00:00Z'));
    const rows = await digests();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: '2 transaksi dari email BCA menunggu dicek',
      link: '/email-bank',
      dedupeKey: 'bank-pending:2026-10-08',
    });

    await authed(user).post(`/api/v1/bank-email/pending/${first.id}/dismiss`).expect(204);
    await runPendingDigest(new Date('2026-10-09T13:00:00Z'));
    expect((await digests()).map((n) => n.title)).toContain(
      '1 transaksi dari email BCA menunggu dicek',
    );
  }, 60_000);
});
