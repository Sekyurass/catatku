// Service worker Catatku: hanya menampilkan notifikasi push (belum ada cache/offline).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const windows = () => self.clients.matchAll({ type: 'window', includeUncontrolled: true });

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title || 'Catatku', {
        body: data.body || '',
        icon: '/icon-192.png',
        tag: data.tag,
        lang: 'id',
        data: { link: data.link || '/' },
      });
      // Tab yang sedang terbuka memperbarui lonceng tanpa menunggu polling.
      for (const client of await windows()) client.postMessage({ type: 'catatku:notification' });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.link || '/', self.location.origin);
  if (url.origin !== self.location.origin) return;
  const link = url.pathname + url.search;
  event.waitUntil(
    (async () => {
      const client = (await windows()).find((c) => new URL(c.url).origin === url.origin);
      if (client) {
        // Pindah halaman lewat router aplikasi supaya tidak memuat ulang.
        client.postMessage({ type: 'catatku:navigate', link });
        return client.focus();
      }
      return self.clients.openWindow(link);
    })(),
  );
});
