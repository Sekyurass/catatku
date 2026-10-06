import { FEATURE_FLAGS, type FeatureFlagKey, toDateString } from '@catatku/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { type PushPayload, setPushTransport } from '../src/lib/push';
import { startOfDayInZone, weekdayOf } from '../src/lib/time';
import * as notifications from '../src/modules/notifications/notification.service';
import * as recurring from '../src/modules/recurring/recurring.service';
import { authed, createWallet, registerUser, type TestUser } from './helpers';

const FCM = 'https://fcm.googleapis.com/fcm/send/';
const sent: Array<{ endpoint: string; payload: PushPayload }> = [];
const gone = new Set<string>();

/** Allowlist per pengguna (plan PREMIUM) agar pengguna tes lain tetap melihat flag mati. */
async function enable(user: TestUser, key: FeatureFlagKey = FEATURE_FLAGS.REMINDERS) {
  await prisma.featureFlag.upsert({
    where: { key },
    create: { key, enabled: true, plan: 'PREMIUM', userIds: [user.id] },
    update: { enabled: true, plan: 'PREMIUM', userIds: { push: user.id } },
  });
}

async function setup() {
  const user = await registerUser();
  await enable(user);
  return user;
}

const subscribe = (user: TestUser, endpoint: string) =>
  authed(user)
    .post('/api/v1/notifications/push-subscriptions')
    .send({ endpoint, keys: { p256dh: 'BPk3y', auth: 'auth-secret' } });

const notificationsOf = (userId: string) =>
  prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

beforeAll(() => {
  setPushTransport({
    async send(target, payload) {
      if (gone.has(target.endpoint)) return 'gone';
      sent.push({ endpoint: target.endpoint, payload });
      return 'ok';
    },
  });
});

beforeEach(() => {
  sent.length = 0;
  gone.clear();
});

afterAll(async () => {
  setPushTransport(null);
  for (const key of [FEATURE_FLAGS.REMINDERS, FEATURE_FLAGS.RECURRING_TRANSACTIONS]) {
    await prisma.featureFlag.update({
      where: { key },
      data: { enabled: false, plan: null, userIds: [] },
    });
  }
});

describe('akses /notifications', () => {
  it('404 bila flag nonaktif untuk pengguna', async () => {
    const user = await registerUser();
    expect((await authed(user).get('/api/v1/notifications')).status).toBe(404);
  });

  it('notify tidak membuat apa pun bila flag mati', async () => {
    const user = await registerUser();
    const created = await notifications.notify(user.id, {
      type: 'REMINDER',
      title: 'x',
      body: 'y',
    });
    expect(created).toBe(false);
    expect(await notificationsOf(user.id)).toHaveLength(0);
  });
});

describe('pengaturan pengingat', () => {
  it('default mati jam 20 setiap hari, lalu tersimpan', async () => {
    const user = await setup();
    const initial = await authed(user).get('/api/v1/notifications/settings');
    expect(initial.body).toMatchObject({
      reminderEnabled: false,
      reminderHour: 20,
      reminderDays: [0, 1, 2, 3, 4, 5, 6],
      push: { available: true },
    });

    const saved = await authed(user)
      .put('/api/v1/notifications/settings')
      .send({ reminderEnabled: true, reminderHour: 21, reminderDays: [5, 1, 1, 3] });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      reminderEnabled: true,
      reminderHour: 21,
      reminderDays: [1, 3, 5],
    });
  });

  it('menolak jam di luar 5–23 dan hari kosong saat aktif', async () => {
    const user = await setup();
    const early = await authed(user)
      .put('/api/v1/notifications/settings')
      .send({ reminderEnabled: true, reminderHour: 3, reminderDays: [1] });
    expect(early.status).toBe(400);
    expect(early.body.error.fields.reminderHour).toBeDefined();
    const noDays = await authed(user)
      .put('/api/v1/notifications/settings')
      .send({ reminderEnabled: true, reminderHour: 20, reminderDays: [] });
    expect(noDays.status).toBe(400);
    expect(noDays.body.error.fields.reminderDays).toBeDefined();
  });
});

describe('langganan push', () => {
  it('hanya menerima endpoint layanan push resmi (anti-SSRF)', async () => {
    const user = await setup();
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://localhost/push',
      'https://169.254.169.254/latest',
      'https://evil.example/fcm.googleapis.com',
      'https://googleapis.com.evil.example/x',
    ]) {
      expect((await subscribe(user, endpoint)).status, endpoint).toBe(400);
    }
    for (const endpoint of [
      `${FCM}abc`,
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/abc',
      'https://wns2-sg2p.notify.windows.com/w/?token=abc',
    ]) {
      expect((await subscribe(user, endpoint)).status, endpoint).toBe(204);
    }
  });

  it('endpoint yang sama pindah ke akun yang terakhir masuk di browser itu', async () => {
    const a = await setup();
    const b = await setup();
    const endpoint = `${FCM}shared-${a.id}`;
    await subscribe(a, endpoint);
    await subscribe(b, endpoint);
    const row = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } });
    expect(row.userId).toBe(b.id);

    // A tidak bisa menghapus langganan yang kini milik B.
    await authed(a).delete('/api/v1/notifications/push-subscriptions').send({ endpoint });
    expect(await prisma.pushSubscription.count({ where: { endpoint } })).toBe(1);
    await authed(b).delete('/api/v1/notifications/push-subscriptions').send({ endpoint });
    expect(await prisma.pushSubscription.count({ where: { endpoint } })).toBe(0);
  });

  it('push uji terkirim ke semua perangkat; langganan kedaluwarsa dihapus', async () => {
    const user = await setup();
    await subscribe(user, `${FCM}hp-${user.id}`);
    await subscribe(user, `${FCM}laptop-${user.id}`);
    gone.add(`${FCM}laptop-${user.id}`);

    const res = await authed(user).post('/api/v1/notifications/push-test');
    expect(res.body).toEqual({ sent: 1 });
    expect(sent.map((s) => s.endpoint)).toEqual([`${FCM}hp-${user.id}`]);
    expect(sent[0]!.payload).toMatchObject({
      title: 'Notifikasi Catatku aktif',
      link: '/pengingat',
    });
    expect(await prisma.pushSubscription.count({ where: { userId: user.id } })).toBe(1);
  });
});

describe('lonceng', () => {
  it('daftar terbaru dulu, jumlah belum dibaca, tandai dibaca, dan paginasi', async () => {
    const user = await setup();
    for (let i = 1; i <= 3; i++) {
      await notifications.notify(user.id, {
        type: 'REMINDER',
        title: `Notif ${i}`,
        body: 'isi',
        dedupeKey: `t:${i}`,
        push: false,
      });
    }
    // dedupeKey sama tidak membuat notifikasi baru.
    await notifications.notify(user.id, {
      type: 'REMINDER',
      title: 'dobel',
      body: 'x',
      dedupeKey: 't:1',
    });

    const first = await authed(user).get('/api/v1/notifications?limit=2');
    expect(first.body.unreadCount).toBe(3);
    expect(first.body.items.map((n: { title: string }) => n.title)).toEqual(['Notif 3', 'Notif 2']);
    const second = await authed(user).get(
      `/api/v1/notifications?limit=2&cursor=${first.body.nextCursor}`,
    );
    expect(second.body.items.map((n: { title: string }) => n.title)).toEqual(['Notif 1']);
    expect(second.body.nextCursor).toBeNull();

    const id = first.body.items[0].id;
    expect((await authed(user).post(`/api/v1/notifications/${id}/read`)).status).toBe(204);
    expect((await authed(user).get('/api/v1/notifications/unread-count')).body).toEqual({
      count: 2,
    });
    await authed(user).post('/api/v1/notifications/read-all');
    expect((await authed(user).get('/api/v1/notifications/unread-count')).body).toEqual({
      count: 0,
    });
  });

  it('notifikasi pengguna lain diperlakukan 404', async () => {
    const owner = await setup();
    const other = await setup();
    await notifications.notify(owner.id, { type: 'REMINDER', title: 'x', body: 'y', push: false });
    const [row] = await notificationsOf(owner.id);
    expect((await authed(other).post(`/api/v1/notifications/${row!.id}/read`)).status).toBe(404);
    expect((await authed(other).get('/api/v1/notifications')).body.items).toHaveLength(0);
  });

  it('notifikasi lebih tua dari 90 hari dibersihkan', async () => {
    const user = await setup();
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'REMINDER',
        title: 'lama',
        body: 'x',
        createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
      },
    });
    await notifications.notify(user.id, {
      type: 'REMINDER',
      title: 'baru',
      body: 'x',
      push: false,
    });
    await notifications.pruneNotifications();
    expect((await notificationsOf(user.id)).map((n) => n.title)).toEqual(['baru']);
  });
});

describe('pengingat harian', () => {
  const today = toDateString();
  /** Pukul `hour`.00 WIB hari ini. */
  const at = (hour: number) => new Date(startOfDayInZone(today).getTime() + hour * 3_600_000);

  async function withReminder(hour = 20, days = [0, 1, 2, 3, 4, 5, 6]) {
    const user = await setup();
    await authed(user)
      .put('/api/v1/notifications/settings')
      .send({ reminderEnabled: true, reminderHour: hour, reminderDays: days });
    await subscribe(user, `${FCM}rem-${user.id}`);
    return user;
  }

  it('terkirim sekali di jamnya (lonceng + push), tidak dobel saat diulang', async () => {
    const user = await withReminder(20);
    await notifications.runReminders(at(19));
    expect(await notificationsOf(user.id)).toHaveLength(0);

    await Promise.all([notifications.runReminders(at(20)), notifications.runReminders(at(20))]);
    await notifications.runReminders(at(21));
    const rows = await notificationsOf(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'REMINDER', link: '/?catat=1' });
    expect(sent.filter((s) => s.endpoint === `${FCM}rem-${user.id}`)).toHaveLength(1);
  });

  it('menyusul maksimal 2 jam bila server sempat mati', async () => {
    const late = await withReminder(17);
    const tooLate = await withReminder(16);
    await notifications.runReminders(at(19));
    expect(await notificationsOf(late.id)).toHaveLength(1);
    expect(await notificationsOf(tooLate.id)).toHaveLength(0);
  });

  it('dilewati bila sudah mencatat hari ini, tapi transaksi otomatis tidak dihitung', async () => {
    const logged = await withReminder(20);
    const wallet = await createWallet(logged);
    await authed(logged).post('/api/v1/transactions').send({
      type: 'EXPENSE',
      amount: 10_000,
      walletId: wallet.id,
      categoryId: 'cat_makan',
      date: today,
    });

    const autoOnly = await withReminder(20);
    const w2 = await createWallet(autoOnly);
    await enable(autoOnly, FEATURE_FLAGS.RECURRING_TRANSACTIONS);
    await recurring.createRule(autoOnly.id, {
      type: 'EXPENSE',
      amount: 50_000,
      walletId: w2.id,
      categoryId: 'cat_tagihan',
      note: 'Internet',
      frequency: 'MONTHLY',
      interval: 1,
      startDate: today,
      endDate: null,
      autoPost: true,
    });

    await notifications.runReminders(at(20));
    expect(await notificationsOf(logged.id)).toHaveLength(0);
    expect((await notificationsOf(autoOnly.id)).map((n) => n.type)).toEqual(['REMINDER']);
  });

  it('hanya di hari yang dipilih', async () => {
    const offToday = await withReminder(20, [(weekdayOf(today) + 1) % 7]);
    await notifications.runReminders(at(20));
    expect(await notificationsOf(offToday.id)).toHaveLength(0);
  });
});

describe('notifikasi transaksi berulang', () => {
  it('konfirmasi → push; tercatat otomatis → hanya lonceng', async () => {
    const user = await setup();
    await enable(user, FEATURE_FLAGS.RECURRING_TRANSACTIONS);
    await subscribe(user, `${FCM}rec-${user.id}`);
    const wallet = await createWallet(user, { name: 'BCA' });
    const rule = {
      type: 'EXPENSE' as const,
      amount: 200_000,
      walletId: wallet.id,
      categoryId: 'cat_tagihan',
      frequency: 'MONTHLY' as const,
      interval: 1,
      startDate: '2026-04-05',
      endDate: null,
    };
    await recurring.createRule(
      user.id,
      { ...rule, note: 'Listrik', autoPost: false },
      '2026-04-01',
    );
    await recurring.createRule(
      user.id,
      { ...rule, note: 'Internet', autoPost: true },
      '2026-04-01',
    );

    await recurring.runDueRules('2026-04-05');
    await recurring.runDueRules('2026-04-05');

    const rows = await notificationsOf(user.id);
    expect(rows.map((n) => [n.type, n.title]).sort()).toEqual([
      ['RECURRING_PENDING', 'Listrik menunggu konfirmasi'],
      ['RECURRING_POSTED', 'Internet tercatat otomatis'],
    ]);
    const pushes = sent.filter((s) => s.endpoint === `${FCM}rec-${user.id}`);
    expect(pushes.map((s) => s.payload.title)).toEqual(['Listrik menunggu konfirmasi']);
  });
});
