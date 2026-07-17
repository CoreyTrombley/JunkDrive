// JUNKRUN service worker — precaches the app shell for instant offline open.
// Spec §15.2. Cache-first with network fallback + background revalidation.
const CACHE_NAME = 'junkrun-v3';
// Relative to this script's own location, not root-absolute — if this is hosted from a
// subdirectory, absolute paths like '/index.html' would 404 against the domain root and
// fail the whole cache.addAll() call, which fails the service worker's install step entirely.
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-maskable.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached || caches.match('./index.html'));
      return cached || network;
    })
  );
});
