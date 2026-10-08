import {
  DEFAULT_REMINDER_HOUR,
  FEATURE_FLAGS,
  type listNotificationsQuerySchema,
  type NotificationDTO,
  type NotificationPageDTO,
  type NotificationSettingsDTO,
  type NotificationType,
  type PushSubscriptionInput,
  TIME_ZONES,
  type TimeZoneId,
  toDateString,
  type updateNotificationSettingsSchema,
} from '@catatku/shared';
import type { Notification } from '@prisma/client';
import type { z } from 'zod';
import { env } from '../../config/env';
import { track } from '../../lib/analytics';
import { notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { toDbDate } from '../../lib/money';
import { prisma } from '../../lib/prisma';
import { type PushPayload, pushTransport } from '../../lib/push';
import { hourInZone, startOfDayInZone, weekdayOf } from '../../lib/time';
import { isFeatureEnabled } from '../features/featureFlag.service';

/** Pengingat yang terlewat (server mati/sibuk) masih dikirim paling lambat sekian jam setelahnya. */
const REMINDER_GRACE_HOURS = 2;
const RETENTION_DAYS = 90;
const MAX_SUBSCRIPTIONS_PER_USER = 10;

function toDTO(n: Notification): NotificationDTO {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

// ---------- Mengirim ----------

export interface NewNotification {
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  /** Sama → notifikasi tidak dibuat ulang (idempoten). */
  dedupeKey?: string;
  /** false = hanya masuk lonceng, tanpa push ke perangkat. */
  push?: boolean;
}

/** Kirim ke semua perangkat pengguna; langganan yang sudah kedaluwarsa dihapus. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const transport = pushTransport();
  if (!transport) return 0;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  const results = await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        if ((await transport.send(sub, payload)) === 'ok') return 1;
        await prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
      } catch (err) {
        logger.warn({ err, subscriptionId: sub.id }, 'Gagal mengirim notifikasi push');
      }
      return 0;
    }),
  );
  return results.reduce<number>((a, b) => a + b, 0);
}

/** Buat notifikasi (lonceng + push). Tidak melakukan apa pun bila fitur nonaktif untuk pengguna. */
export async function notify(userId: string, n: NewNotification): Promise<boolean> {
  if (!(await isFeatureEnabled(FEATURE_FLAGS.REMINDERS, userId))) return false;
  const { count } = await prisma.notification.createMany({
    data: [
      {
        userId,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link ?? null,
        dedupeKey: n.dedupeKey ?? null,
      },
    ],
    skipDuplicates: true,
  });
  if (count === 0) return false;
  if (n.push !== false) {
    await sendPushToUser(userId, {
      title: n.title,
      body: n.body,
      link: n.link,
      tag: n.dedupeKey ?? n.type,
    });
  }
  return true;
}

// ---------- Lonceng ----------

export async function listNotifications(
  userId: string,
  query: z.output<typeof listNotificationsQuerySchema>,
): Promise<NotificationPageDTO> {
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    }),
    countUnread(userId),
  ]);
  const hasMore = rows.length > query.limit;
  const items = rows.slice(0, query.limit);
  return {
    items: items.map(toDTO),
    nextCursor: hasMore ? items[items.length - 1]!.id : null,
    unreadCount,
  };
}

export function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(userId: string, id: string): Promise<void> {
  const { count } = await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
  if (count === 0 && !(await prisma.notification.findFirst({ where: { id, userId } }))) {
    throw notFound('Notifikasi');
  }
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

// ---------- Pengaturan ----------

function pushInfo(): NotificationSettingsDTO['push'] {
  const available = pushTransport() !== null;
  return { available, publicKey: available ? env.VAPID_PUBLIC_KEY || null : null };
}

export async function getSettings(userId: string): Promise<NotificationSettingsDTO> {
  const row = await prisma.notificationSetting.findUnique({ where: { userId } });
  return {
    reminderEnabled: row?.reminderEnabled ?? false,
    reminderHour: row?.reminderHour ?? DEFAULT_REMINDER_HOUR,
    reminderDays: row?.reminderDays ?? [0, 1, 2, 3, 4, 5, 6],
    push: pushInfo(),
  };
}

export async function updateSettings(
  userId: string,
  input: z.output<typeof updateNotificationSettingsSchema>,
): Promise<NotificationSettingsDTO> {
  const data = {
    reminderEnabled: input.reminderEnabled,
    reminderHour: input.reminderHour,
    reminderDays: input.reminderDays,
  };
  await prisma.notificationSetting.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return getSettings(userId);
}

// ---------- Langganan push ----------

/** Satu browser = satu endpoint. Bila endpoint itu sebelumnya milik akun lain, kini pindah ke akun ini. */
export async function subscribe(userId: string, input: PushSubscriptionInput): Promise<void> {
  const keys = { p256dh: input.keys.p256dh, auth: input.keys.auth };
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: { userId, endpoint: input.endpoint, ...keys },
    update: { userId, ...keys },
  });
  const stale = await prisma.pushSubscription.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    skip: MAX_SUBSCRIPTIONS_PER_USER,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }
  track(userId, 'push_subscribed');
}

export async function unsubscribe(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

export function sendTestPush(userId: string): Promise<number> {
  return sendPushToUser(userId, {
    title: 'Notifikasi Catatku aktif',
    body: 'Begini tampilannya saat ada pengingat atau tagihan yang perlu dikonfirmasi.',
    link: '/pengingat',
    tag: 'test',
  });
}

// ---------- Job pengingat harian ----------

/**
 * Kirim pengingat ke pengguna yang jamnya sudah tiba hari ini dan belum mencatat apa pun.
 * Baris pengaturan "diklaim" dengan lastReminderDate sebelum diproses, jadi maksimal satu
 * pengingat per hari walau job berjalan di beberapa instance atau diulang.
 */
export async function runReminders(now: Date = new Date()): Promise<number> {
  let sent = 0;
  for (const zone of TIME_ZONES) sent += await runRemindersInZone(now, zone);
  return sent;
}

/** Jam pengingat, "hari ini", dan hari dalam pekan dihitung di zona waktu masing-masing pengguna. */
async function runRemindersInZone(now: Date, zone: TimeZoneId): Promise<number> {
  const today = toDateString(now, zone);
  const hour = hourInZone(now, zone);
  const dayStart = startOfDayInZone(today, zone);
  const notYetToday = [{ lastReminderDate: null }, { lastReminderDate: { lt: toDbDate(today) } }];
  let sent = 0;

  for (let round = 0; round < 1000; round++) {
    const due = await prisma.notificationSetting.findMany({
      where: {
        reminderEnabled: true,
        reminderHour: { lte: hour, gte: hour - REMINDER_GRACE_HOURS },
        reminderDays: { has: weekdayOf(today) },
        user: { timeZone: zone },
        OR: notYetToday,
      },
      select: { userId: true },
      take: 200,
    });
    if (due.length === 0) break;

    for (const { userId } of due) {
      try {
        const { count } = await prisma.notificationSetting.updateMany({
          where: { userId, OR: notYetToday },
          data: { lastReminderDate: toDbDate(today) },
        });
        if (count === 0) continue;
        // Transaksi otomatis dari jadwal berulang tidak dihitung sebagai "sudah mencatat".
        const logged = await prisma.transaction.findFirst({
          where: { userId, recurringRuleId: null, createdAt: { gte: dayStart } },
          select: { id: true },
        });
        if (logged) continue;
        const created = await notify(userId, {
          type: 'REMINDER',
          title: 'Sudah catat hari ini?',
          body: 'Belum ada transaksi hari ini. Catat sekarang, cuma butuh beberapa detik.',
          link: '/?catat=1',
          dedupeKey: `reminder:${today}`,
        });
        if (created) {
          sent++;
          track(userId, 'reminder_sent');
        }
      } catch (err) {
        logger.error({ err, userId }, 'Gagal memproses pengingat');
      }
    }
  }
  return sent;
}

/** Notifikasi lebih tua dari 90 hari dihapus agar tabel tidak tumbuh tanpa batas. */
export async function pruneNotifications(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.notification.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}
