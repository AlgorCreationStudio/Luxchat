const CACHE_NAME = 'luxchat-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

// Push event — works in background on Android PWA and iOS 16.4+ PWA
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'LuxChat', body: event.data.text() }; }

  const title = data.title || 'LuxChat';
  const options = {
    body: data.body || 'Tienes un nuevo mensaje',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/app' },
    actions: [{ action: 'open', title: 'Abrir' }],
    requireInteraction: false,
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click — open or focus the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/app';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', () => {});
