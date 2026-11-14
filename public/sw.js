const CACHE_NAME = 'jaswa-runtime-v2';
const APP_SHELL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const response = await fetch('/precache-manifest.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Precache manifest returned ${response.status}.`);
      const files = await response.json();
      if (!Array.isArray(files) || !files.every((file) => typeof file === 'string')) throw new Error('Invalid precache manifest.');
      await cache.addAll([APP_SHELL, ...files]);
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

  const navigation = event.request.mode === 'navigate'
    || event.request.headers.get('accept')?.includes('text/html') === true;
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) {
        const cachedResponse = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cachedResponse));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (navigation) return caches.match(APP_SHELL);
      throw new Error('The requested resource is unavailable offline.');
    }),
  );
});
