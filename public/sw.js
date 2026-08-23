const CACHE_NAME = 'swaggr-runtime-v1';
const APP_SHELL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll([
        APP_SHELL,
        '/manifest.webmanifest',
        '/favicon.svg',
        '/pwa-192x192.png',
        '/pwa-512x512.png',
        '/maskable-icon-512x512.png',
      ]);
    }).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) {
        const cachedResponse = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cachedResponse));
      }
      return response;
    }).catch(async () => (await caches.match(event.request)) ?? (await caches.match(APP_SHELL))),
  );
});
