// Service worker: app shell + artwork cache.
// Artwork is cache-first (Jellyfin image URLs carry a tag, so a new image means a new URL).
// The app shell is network-first for HTML and cache-first for hashed assets.
const SHELL = 'lantern-shell-v1';
const ART = 'lantern-art-v1';
const ART_LIMIT = 800;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL && k !== ART).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/\/Items\/[^/]+\/Images\//i.test(url.pathname)) {
    event.respondWith(cacheFirst(ART, req, true));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/') || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(networkFirst(SHELL, req));
    return;
  }
  event.respondWith(cacheFirst(SHELL, req, false));
});

async function cacheFirst(name, req, trim) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) {
    cache.put(req, res.clone()).then(() => trim && trimCache(cache));
  }
  return res;
}

async function networkFirst(name, req) {
  const cache = await caches.open(name);
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

let trimming = false;
async function trimCache(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    const extra = keys.length - ART_LIMIT;
    for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
  } finally {
    trimming = false;
  }
}
