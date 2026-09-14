const CACHE_NAME = 'prismastore-shell-v0.9.2';
const CACHE_PREFIX = 'prismastore-shell-';
const APP_SHELL = [
  '/', '/index.html', '/manifest.webmanifest',
  '/src/styles.css', '/src/reports.css', '/src/backup.css', '/src/pwa.css', '/src/hero.css', '/src/admin-extensions.css',
  '/src/app.js', '/src/data.js', '/src/domain.js', '/src/live-sync.js', '/src/payment-status.js',
  '/src/order-lifecycle-ui.js', '/src/reports-ui.js', '/src/backup-ui.js', '/src/pwa.js', '/src/hero.js',
  '/src/admin-extensions.js', '/src/product-editor.js', '/src/chatbot-settings.js',
  '/assets/hero/hero-part-1.txt', '/assets/hero/hero-part-2.txt', '/assets/hero/hero-part-3.txt', '/assets/hero/hero-part-4.txt',
  '/icons/favicon-16.png', '/icons/favicon-32.png', '/icons/apple-touch-icon.png',
  '/icons/icon-192.png', '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || cache.match('/index.html');
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (!APP_SHELL.includes(url.pathname)) return;
  event.respondWith(cacheFirst(request));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
