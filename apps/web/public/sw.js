// UDHAY Project Tracker service worker: phone notifications (web push) and an offline page.
// Pages are always fetched from the network, so a deploy is visible straight away.

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · UDHAY</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px system-ui,sans-serif;color:#111;background:#fff;text-align:center;padding:24px}
img{width:72px;height:72px}h1{font-size:18px;margin:16px 0 6px}p{color:#666;margin:0 0 20px}
button{font:inherit;padding:10px 20px;border:0;background:#b8862b;color:#fff}</style></head>
<body><div><img src="/icons/icon-192.png" alt=""><h1>You are offline</h1>
<p>Check your mobile data or Wi-Fi, then try again.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open('udhay-offline-v1').then((c) => c.add('/icons/icon-192.png')));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // The offline page's logo comes from the cache saved at install.
  if (new URL(event.request.url).pathname === '/icons/icon-192.png') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/icons/icon-192.png')));
    return;
  }
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
    ),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : 'UDHAY' };
  }
  const title = data.title || 'UDHAY Project Tracker';
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        vibrate: [200, 100, 200],
        timestamp: Date.now(),
        data: { url: data.url || '/notifications' },
      }),
      typeof data.unread === 'number' && self.navigator.setAppBadge
        ? self.navigator.setAppBadge(data.unread).catch(() => undefined)
        : undefined,
      // Open tabs refresh their bell count (and play the in-app sound).
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((list) => list.forEach((c) => c.postMessage({ type: 'push' }))),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/notifications', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        return open.navigate(url).catch(() => open.postMessage({ type: 'open', url }));
      }
      return self.clients.openWindow(url);
    }),
  );
});
