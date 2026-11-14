const PRECACHE_FILES = __JASWA_PRECACHE_FILES__;
const PRECACHE_HASH = '__JASWA_PRECACHE_HASH__';
/* Ordered by build so activation can keep the build before this one: a tab
   still running it may lazy-load a chunk this build no longer has. */
const SHELL_CACHE = 'jaswa-shell-__JASWA_BUILD_ORDER__-__JASWA_PRECACHE_HASH__';
const ARTWORK_CACHE = 'jaswa-artwork';
const APP_SHELL = '/';

/* The worker's bytes carry the build's shell list, so a new set of hashed
   chunks produces a new worker and a distinct immutable shell cache. */
const PRECACHE_URLS = [...new Set([APP_SHELL, ...PRECACHE_FILES])];

function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

function isExcludedPath(url) {
  const path = url.pathname.toLowerCase();
  return path.endsWith('.exe')
    || path.endsWith('.blockmap')
    || path === '/download'
    || path.startsWith('/download/')
    || path === '/downloads'
    || path.startsWith('/downloads/')
    || path === '/report'
    || path.startsWith('/report/')
    || path === '/reports'
    || path.startsWith('/reports/');
}

function isArtworkRequest(request) {
  const path = new URL(request.url).pathname;
  return path.startsWith('/artifact-images/')
    || path.startsWith('/monster-images/')
    || path.startsWith('/rune-images/');
}

/* This is deliberately pure: the verification script exercises the same
   decision that protects the runtime cache from SPA HTML fallbacks. */
function shouldCache(request, response, origin) {
  const url = new URL(request.url);
  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '';
  return request.method === 'GET'
    && url.origin === origin
    && response.ok
    && response.type === 'basic'
    && !isNavigationRequest(request)
    && contentType !== 'text/html'
    && !isExcludedPath(url);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'apply-update') event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        const buildOrder = (key) => Number(key.split('-')[2]) || 0;
        const older = keys.filter((key) => key.startsWith('jaswa-shell-') && key !== SHELL_CACHE)
          .sort((left, right) => buildOrder(right) - buildOrder(left));
        return Promise.all(older.slice(1).map((key) => caches.delete(key)));
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (isNavigationRequest(event.request)) {
    /* A navigation gets the newest document first; only a failed navigation
       may use the already-installed shell, never an asset request. */
    event.respondWith(
      fetch(event.request).catch(() => caches.open(SHELL_CACHE)
        .then((cache) => cache.match(APP_SHELL))
        .then((cached) => cached ?? Promise.reject(new Error('The app shell is unavailable offline.')))),
    );
    return;
  }

  if (isExcludedPath(requestUrl)) return;

  /* Hashed shell assets are immutable, so cache-first avoids a network trip
     while the build-specific cache name prevents old chunks surviving a deploy.
     Artwork uses its stable cache so shell updates do not evict it. */
  const cacheName = isArtworkRequest(event.request) ? ARTWORK_CACHE : SHELL_CACHE;
  event.respondWith(
    caches.open(cacheName).then(async (cache) => {
      const current = await cache.match(event.request);
      if (current) return current;
      /* Stable public URLs belong to the active build. Only immutable chunks
         may fall back to an older shell; artwork stays in its own cache. */
      const cached = !isArtworkRequest(event.request) && requestUrl.pathname.startsWith('/assets/')
        ? await caches.match(event.request) : undefined;
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (shouldCache(event.request, response, self.location.origin)) {
          event.waitUntil(caches.open(cacheName).then((runtimeCache) => runtimeCache.put(event.request, response.clone())));
        }
        return response;
      });
    }),
  );
});
