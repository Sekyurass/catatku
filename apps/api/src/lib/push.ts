import webpush from 'web-push';
import { env } from '../config/env';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Dibaca oleh service worker web (`public/sw.js`). */
export interface PushPayload {
  title: string;
  body: string;
  link?: string | null;
  /** Notifikasi bertag sama saling menggantikan di perangkat. */
  tag?: string;
}

export interface PushTransport {
  /** 'gone' = langganan sudah tidak berlaku (404/410) dan sebaiknya dihapus. */
  send(target: PushTarget, payload: PushPayload): Promise<'ok' | 'gone'>;
}

function createWebPushTransport(): PushTransport | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  const vapidDetails = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  return {
    async send({ endpoint, p256dh, auth }, payload) {
      try {
        await webpush.sendNotification(
          { endpoint, keys: { p256dh, auth } },
          JSON.stringify(payload),
          {
            vapidDetails,
            TTL: 12 * 60 * 60,
            timeout: 10_000,
          },
        );
        return 'ok';
      } catch (err) {
        if (err instanceof webpush.WebPushError && [404, 410].includes(err.statusCode)) {
          return 'gone';
        }
        throw err;
      }
    },
  };
}

let transport: PushTransport | null = env.isTest ? null : createWebPushTransport();

export function pushTransport(): PushTransport | null {
  return transport;
}

/** Hanya untuk tes: ganti pengirim push dengan tiruan. */
export function setPushTransport(next: PushTransport | null) {
  transport = next;
}
