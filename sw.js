const VERSION = 'tilawa-v4';
const SHELL = ['./', 'index.html', 'style.css', 'script.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const API_HOST = 'api.alquran.cloud';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
  }).catch(() => hit);
  return hit || fresh;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return; // audio streams straight from the network
  const url = new URL(req.url);

  if (url.hostname === API_HOST) return e.respondWith(networkFirst(req));
  if (FONT_HOSTS.includes(url.hostname)) return e.respondWith(staleWhileRevalidate(req));
  if (url.origin === location.origin) {
    if (req.mode === 'navigate') {
      // Deep links like /surah/108 fall back to the cached app shell when the server has no such file.
      e.respondWith(networkFirst(req)
        .then((res) => (res.ok ? res : caches.match('index.html').then((c) => c || res)))
        .catch(() => caches.match('index.html')));
    } else {
      e.respondWith(staleWhileRevalidate(req));
    }
  }
});