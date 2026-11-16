// Network-first with cache fallback: updates show up on the next online load, and the app still works offline.
const CACHE = 'toeic-vocab-v1';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'NOTICE.md',
  'data/words.json',
  'src/app.js',
  'src/audio.js',
  'src/choices.js',
  'src/sampler.js',
  'src/paginate.js',
  'src/session.js',
  'src/settings.js',
  'src/stats.js',
  'src/storage.js',
  'src/weights.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('toeic-vocab-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Audio is cached by the app itself (Cache API + blob URLs); iOS Safari needs Range support for SW-served media.
  if (/\.mp3(\?|$)/.test(event.request.url)) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request)),
  );
});
