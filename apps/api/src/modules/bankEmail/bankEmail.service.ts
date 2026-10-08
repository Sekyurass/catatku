import { createHash, randomBytes } from 'node:crypto';
import { promises as dns } from 'node:dns';
import {
  BANK_EMAIL_MAX_BYTES,
  type BankEmailInboxDTO,
  type BankEmailKind,
  type BankEmailPendingDTO,
  type BankEmailResult,
  type BankEmailUploadDTO,
  FEATURE_FLAGS,
  formatRupiah,
  toDateString,
  type UpdateBankEmailInput,
} from '@catatku/shared';
import { type EmailInbox, type InboundTransaction, Prisma } from '@prisma/client';
import { type AddressObject, simpleParser } from 'mailparser';
import { dkimVerify, type DNSResolver } from 'mailauth';
import { env } from '../../config/env';
import { conflict, notFound, validationError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { fromDbDate, toDbDate, toNumber } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { isFeatureEnabled } from '../features/featureFlag.service';
import { notify } from '../notifications/notification.service';
import { htmlToText, parseBankEmail } from './parsers';

const GMAIL_FORWARDING_SENDER = 'forwarding-noreply@google.com';

// ---------- DNS untuk DKIM ----------

const fallbackDns = new dns.Resolver();
fallbackDns.setServers(
  env.DNS_FALLBACK_SERVERS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const systemResolver: DNSResolver = async (name, rrtype) => {
  try {
    return (await dns.resolve(name, rrtype)) as string[][] | string[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOTFOUND') throw err;
    return (await fallbackDns.resolve(name, rrtype)) as string[][] | string[];
  }
};

let resolver: DNSResolver = systemResolver;

export function setDnsResolverForTests(next: DNSResolver | null): void {
  resolver = next ?? systemResolver;
}

// ---------- Alamat kotak masuk ----------

export const isReceivingConfigured = () =>
  env.INBOUND_EMAIL_ADDRESS !== '' &&
  (env.INBOUND_EMAIL_SECRET !== '' || env.INBOUND_IMAP_HOST !== '');

function addressFor(token: string): string {
  const [local, domain] = env.INBOUND_EMAIL_ADDRESS.split('@');
  return `${local}+${token}@${domain}`;
}

/** Token dari alamat "<lokal>+<token>@<domain>" yang cocok dengan INBOUND_EMAIL_ADDRESS. */
export function tokenFromRecipients(recipients: string[]): string | null {
  if (!env.INBOUND_EMAIL_ADDRESS) return null;
  const [local, domain] = env.INBOUND_EMAIL_ADDRESS.toLowerCase().split('@');
  for (const raw of recipients) {
    const m = raw.toLowerCase().match(/([a-z0-9._-]+)\+([a-z0-9]{8,32})@([a-z0-9.-]+)/);
    if (m && m[1] === local && m[3] === domain) return m[2]!;
  }
  return null;
}

const newToken = () => randomBytes(10).toString('hex');

/** Gmail mengabaikan titik dan +alias di bagian lokal. */
export function normalizeAddress(address: string): string {
  const [local = '', domain = ''] = address.trim().toLowerCase().split('@');
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return `${local.split('+')[0]!.replace(/\./g, '')}@gmail.com`;
  }
  return `${local}@${domain}`;
}

// ---------- DTO ----------

async function activeWalletId(userId: string, walletId: string | null): Promise<string | null> {
  if (!walletId) return null;
  const wallet = await prisma.wallet.findFirst({
    where: { id: walletId, userId, archivedAt: null },
    select: { id: true },
  });
  return wallet?.id ?? null;
}

function toPendingDTO(row: InboundTransaction, walletId: string | null): BankEmailPendingDTO {
  return {
    id: row.id,
    source: row.source,
    kind: row.kind as BankEmailKind,
    type: row.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
    amount: toNumber(row.amount),
    fee: toNumber(row.fee),
    date: fromDbDate(row.date),
    time: row.time,
    counterparty: row.counterparty,
    note: row.note,
    accountHint: row.accountHint,
    walletId,
    confident: row.confident,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getInbox(userId: string): Promise<BankEmailInboxDTO> {
  const [inbox, pendingCount] = await Promise.all([
    prisma.emailInbox.findUnique({ where: { userId } }),
    prisma.inboundTransaction.count({ where: { userId, status: 'PENDING' } }),
  ]);
  const enabled = inbox?.enabled ?? false;
  return {
    enabled,
    address: enabled && inbox && env.INBOUND_EMAIL_ADDRESS ? addressFor(inbox.token) : null,
    receiving: isReceivingConfigured(),
    walletId: await activeWalletId(userId, inbox?.walletId ?? null),
    sourceEmail: inbox?.sourceEmail ?? null,
    forwardingCode: inbox?.forwardingCode ?? null,
    forwardingCodeAt: inbox?.forwardingCodeAt?.toISOString() ?? null,
    lastReceivedAt: inbox?.lastReceivedAt?.toISOString() ?? null,
    lastResult: (inbox?.lastResult as BankEmailResult | null) ?? null,
    pendingCount,
  };
}

export async function updateInbox(
  userId: string,
  input: UpdateBankEmailInput,
): Promise<BankEmailInboxDTO> {
  if (input.walletId) {
    if (!(await activeWalletId(userId, input.walletId))) {
      throw validationError('Dompet tidak ditemukan', { walletId: 'Dompet tidak ditemukan' });
    }
  }
  const data = {
    ...(input.enabled !== undefined && { enabled: input.enabled }),
    ...(input.walletId !== undefined && { walletId: input.walletId }),
  };
  await prisma.emailInbox.upsert({
    where: { userId },
    create: { userId, token: newToken(), ...data },
    update: data,
  });
  return getInbox(userId);
}

/** Alamat lama berhenti berlaku (mis. bocor); filter Gmail perlu diarahkan ke alamat baru. */
export async function rotateAddress(userId: string): Promise<BankEmailInboxDTO> {
  await prisma.emailInbox.upsert({
    where: { userId },
    create: { userId, token: newToken() },
    update: { token: newToken(), sourceEmail: null, forwardingCode: null, forwardingCodeAt: null },
  });
  return getInbox(userId);
}

// ---------- Menunggu konfirmasi ----------

export async function listPending(userId: string): Promise<BankEmailPendingDTO[]> {
  const [rows, inbox] = await Promise.all([
    prisma.inboundTransaction.findMany({
      where: { userId, status: 'PENDING' },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    }),
    prisma.emailInbox.findUnique({ where: { userId }, select: { walletId: true } }),
  ]);
  const walletId = await activeWalletId(userId, inbox?.walletId ?? null);
  return rows.map((r) => toPendingDTO(r, walletId));
}

async function findPending(userId: string, id: string): Promise<InboundTransaction> {
  const row = await prisma.inboundTransaction.findFirst({ where: { id, userId } });
  if (!row) throw notFound('Transaksi dari email');
  if (row.status !== 'PENDING') throw conflict('Transaksi ini sudah diproses');
  return row;
}

/** Transaksinya dibuat lewat form biasa (pengguna bisa mengubah isinya), lalu ditautkan di sini. */
export async function confirmPending(userId: string, id: string, transactionId: string) {
  await findPending(userId, id);
  const tx = await prisma.transaction.findFirst({
    where: { id: transactionId, userId, deletedAt: null },
    select: { id: true },
  });
  if (!tx) throw validationError('Transaksi tidak ditemukan', { transactionId: 'Tidak ditemukan' });
  try {
    const { count } = await prisma.inboundTransaction.updateMany({
      where: { id, userId, status: 'PENDING' },
      data: { status: 'CONFIRMED', transactionId },
    });
    if (count === 0) throw conflict('Transaksi ini sudah diproses');
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('Transaksi itu sudah ditautkan ke email lain');
    }
    throw err;
  }
}

export async function dismissPending(userId: string, id: string): Promise<void> {
  await findPending(userId, id);
  await prisma.inboundTransaction.updateMany({
    where: { id, userId, status: 'PENDING' },
    data: { status: 'DISMISSED' },
  });
}

// ---------- Memproses email masuk ----------

const addresses = (field: AddressObject | AddressObject[] | undefined): string[] =>
  (Array.isArray(field) ? field : field ? [field] : [])
    .flatMap((a) => a.value)
    .map((v) => v.address?.toLowerCase())
    .filter((v): v is string => !!v);

const domainOf = (address: string) => address.split('@')[1] ?? '';

const aligned = (signing: string, from: string) =>
  signing === from || from.endsWith(`.${signing}`) || signing.endsWith(`.${from}`);

async function signedBy(raw: Buffer, fromDomain: string): Promise<boolean> {
  try {
    const res = await dkimVerify(raw, { resolver });
    return res.results.some(
      (r) => r.status.result === 'pass' && aligned(r.signingDomain.toLowerCase(), fromDomain),
    );
  } catch (err) {
    logger.warn({ err }, 'Verifikasi DKIM gagal');
    return false;
  }
}

function timeInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

async function recordResult(inbox: EmailInbox | null, result: BankEmailResult) {
  if (!inbox) return;
  await prisma.emailInbox.update({
    where: { userId: inbox.userId },
    data: { lastReceivedAt: new Date(), lastResult: result },
  });
}

/**
 * Satu email mentah untuk satu pengguna (dari unggahan .eml atau kotak masuk). Isi email tidak
 * disimpan: hanya hasil bacaannya, dan hanya bila tanda tangan DKIM pengirim valid dan email itu
 * memang dikirim ke email akun / Gmail yang meneruskan.
 */
export async function ingestEmail(userId: string, raw: Buffer): Promise<BankEmailUploadDTO> {
  const [user, inbox] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, timeZone: true },
    }),
    prisma.emailInbox.findUnique({ where: { userId } }),
  ]);
  const mail = await simpleParser(raw, { skipImageLinks: true });
  const from = addresses(mail.from)[0] ?? '';
  const fromDomain = domainOf(from);
  const done = async (result: BankEmailResult, pending: BankEmailPendingDTO | null = null) => {
    await recordResult(inbox, result);
    return { result, pending };
  };

  if (!fromDomain || !(await signedBy(raw, fromDomain))) return done('rejected_signature');

  if (from === GMAIL_FORWARDING_SENDER) {
    const subject = mail.subject ?? '';
    const body = mail.text || (typeof mail.html === 'string' ? htmlToText(mail.html) : '');
    const code =
      subject.match(/#\s*(\d{6,12})/)?.[1] ??
      body.match(
        /(?:confirmation code|verification code|kode (?:konfirmasi|verifikasi))\D{0,20}(\d{6,12})/i,
      )?.[1];
    const inboundLocal = env.INBOUND_EMAIL_ADDRESS.split('@')[0]?.toLowerCase() ?? '';
    const source =
      [
        ...(subject.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []),
        ...(body.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []),
      ]
        .map((a) => a.toLowerCase())
        .find((a) => a.split(/[+@]/)[0] !== inboundLocal && !a.endsWith('@google.com')) ?? null;
    if (!code || !inbox) {
      logger.warn({ subject, hasInbox: !!inbox }, 'Email penerusan Gmail tanpa kode terbaca');
      return done('unrecognized');
    }
    await prisma.emailInbox.update({
      where: { userId },
      data: { forwardingCode: code, forwardingCodeAt: new Date(), sourceEmail: source },
    });
    await notify(userId, {
      type: 'BANK_EMAIL',
      title: 'Kode konfirmasi penerusan Gmail',
      body: `Masukkan kode ${code} di setelan Gmail untuk mulai meneruskan email bank.`,
      link: '/email-bank',
      dedupeKey: `bank-forwarding:${code}`,
    });
    return done('forwarding_code');
  }

  const allowed = new Set(
    [user.email, inbox?.sourceEmail].filter((v): v is string => !!v).map(normalizeAddress),
  );
  const recipients = [...addresses(mail.to), ...addresses(mail.cc)].map(normalizeAddress);
  if (!recipients.some((r) => allowed.has(r))) return done('rejected_recipient');

  const parsed = parseBankEmail({
    fromDomain,
    subject: mail.subject ?? '',
    // mailparser meratakan tabel HTML menjadi satu baris saat mengisi text dari email HTML saja.
    text: typeof mail.html === 'string' ? htmlToText(mail.html) : (mail.text ?? ''),
  });
  if (!parsed) return done('unrecognized');

  const sentAt = mail.date ?? new Date();
  const reference =
    parsed.reference ??
    `msg:${createHash('sha256')
      .update(mail.messageId ?? raw)
      .digest('hex')
      .slice(0, 32)}`;
  const walletId = await activeWalletId(userId, inbox?.walletId ?? null);
  try {
    const row = await prisma.inboundTransaction.create({
      data: {
        userId,
        source: parsed.source,
        kind: parsed.kind,
        reference,
        type: parsed.type,
        amount: BigInt(parsed.amount),
        fee: BigInt(parsed.fee),
        date: toDbDate(parsed.date ?? toDateString(sentAt, user.timeZone)),
        time: parsed.time ?? (parsed.date ? null : timeInZone(sentAt, user.timeZone)),
        counterparty: parsed.counterparty,
        note: parsed.note,
        accountHint: parsed.accountHint,
        confident: parsed.confident,
      },
    });
    await notify(userId, {
      type: 'BANK_EMAIL',
      title: parsed.type === 'INCOME' ? 'Uang masuk dari email bank' : 'Transaksi dari email bank',
      body: `${formatRupiah(parsed.amount)} · ${parsed.note}. Ketuk untuk mengonfirmasi.`,
      link: '/email-bank',
      dedupeKey: `bank-email:${row.id}`,
    });
    return done('parsed', toPendingDTO(row, walletId));
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    const existing = await prisma.inboundTransaction.findFirst({
      where: { userId, source: parsed.source, reference, status: 'PENDING' },
    });
    return done('duplicate', existing ? toPendingDTO(existing, walletId) : null);
  }
}

/** Unggahan .eml dari aplikasi. */
export async function uploadEmail(userId: string, raw: unknown): Promise<BankEmailUploadDTO> {
  if (!Buffer.isBuffer(raw) || raw.length === 0) {
    throw validationError('Pilih file email (.eml)');
  }
  if (raw.length > BANK_EMAIL_MAX_BYTES) throw validationError('File terlalu besar (maks. 1 MB)');
  return ingestEmail(userId, raw);
}

const RECIPIENT_HEADERS =
  /^(?:delivered-to|x-original-to|x-forwarded-to|envelope-to|to|cc):(.*)$/gim;

/** Alamat tujuan dari header (IMAP tidak membawa amplop SMTP). */
function headerRecipients(raw: Buffer): string[] {
  const head = raw.subarray(0, 64 * 1024).toString('latin1');
  const end = head.search(/\r?\n\r?\n/);
  const block = (end === -1 ? head : head.slice(0, end)).replace(/\r?\n[ \t]+/g, ' ');
  return [...block.matchAll(RECIPIENT_HEADERS)].map((m) => m[1]!);
}

/**
 * Email yang masuk ke kotak masuk server (webhook / IMAP). Penerimanya dikenali dari +token di
 * alamat tujuan. null = diabaikan (alamat tidak dikenal, nonaktif, atau fitur mati).
 */
export async function receiveEmail(
  raw: Buffer,
  recipients: string[],
): Promise<BankEmailResult | null> {
  if (raw.length === 0 || raw.length > BANK_EMAIL_MAX_BYTES) return null;
  const token = tokenFromRecipients(recipients) ?? tokenFromRecipients(headerRecipients(raw));
  if (!token) return null;
  const inbox = await prisma.emailInbox.findUnique({ where: { token } });
  if (!inbox?.enabled) return null;
  if (!(await isFeatureEnabled(FEATURE_FLAGS.BANK_EMAIL, inbox.userId))) return null;
  const { result } = await ingestEmail(inbox.userId, raw);
  return result;
}
