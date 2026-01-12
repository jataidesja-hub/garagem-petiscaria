const CACHE_NAME = 'aguia-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/garcom.html',
  '/cozinha.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  // Estratégia: Network first, fallback to cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
