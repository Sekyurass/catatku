import { ImapFlow } from 'imapflow';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { receiveEmail } from './bankEmail.service';

const MAX_PER_POLL = 50;

export const isImapConfigured = () => env.INBOUND_IMAP_HOST !== '';

let running: Promise<number> | null = null;

/**
 * Baca email belum dibaca di kotak masuk server (mis. Gmail khusus Catatku + app password),
 * proses, lalu hapus: isi email tidak disimpan di mana pun. Email yang gagal diproses dibiarkan
 * agar dicoba lagi pada putaran berikutnya; yang sama tidak tercatat dua kali (kunci anti-ganda).
 */
export function pollImap(): Promise<number> {
  if (!isImapConfigured()) return Promise.resolve(0);
  running ??= poll().finally(() => (running = null));
  return running;
}

async function poll(): Promise<number> {
  const client = new ImapFlow({
    host: env.INBOUND_IMAP_HOST,
    port: env.INBOUND_IMAP_PORT,
    secure: env.INBOUND_IMAP_PORT === 993,
    auth: { user: env.INBOUND_IMAP_USER, pass: env.INBOUND_IMAP_PASS },
    logger: false,
  });
  await client.connect();
  let processed = 0;
  const lock = await client.getMailboxLock('INBOX');
  try {
    const uids = (await client.search({ seen: false }, { uid: true })) || [];
    for (const uid of uids.slice(0, MAX_PER_POLL)) {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !msg.source) continue;
      try {
        await receiveEmail(msg.source, []);
        processed++;
      } catch (err) {
        logger.error({ err, uid }, 'Gagal memproses email bank dari IMAP');
        continue;
      }
      await client.messageDelete(String(uid), { uid: true });
    }
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
  return processed;
}
