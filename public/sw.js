// Service worker for Bubble push notifications
const SW_VERSION = 'v3';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.claim().then(() => {
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
      });
    })
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Bubble', body: event.data.text() };
  }

  const options = {
    body: payload.body ?? '',
    icon: '/3f47fddf-ea91-42a1-bb1d-b9ce5c6d6c83.jpg',
    badge: '/grok-image-f587b157-0d4d-493c-95b9-11f95f3e5929.png',
    tag: payload.tag ?? 'bubble-notification',
    renotify: true,
    vibrate: [200, 100, 200],
    data: payload.data ?? {},
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Bubble', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow(self.location.origin);
    })
  );
});
