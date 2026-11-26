// Service worker: caches the game for fast repeat loads and offline start. Relative URLs only (works under /<repo>/melbourne3d/).
// Bump VERSION on each deploy: old caches are deleted on activate, and skipWaiting + clients.claim apply the new worker at once.
const VERSION = 'v32';
const CACHE = `gta-melb-${VERSION}`;
const CDN = 'https://cdn.jsdelivr.net/';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest']).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('gta-melb-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./index.html')) || Response.error();
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.headers.has('range')) return; // media range requests go to the network
  if (url.origin === self.location.origin) {
    const path = url.pathname;
    if (req.mode === 'navigate' || path.endsWith('/') || path.endsWith('/index.html') || path.endsWith('/manifest.webmanifest') || path.endsWith('/sw.js')) {
      e.respondWith(networkFirst(req));
    } else if (/\.(js|mjs|css|glb|gltf|bin|gz|json|png|jpe?g|webp|ktx2|hdr|exr|wav|mp3|ogg|m4a|svg|woff2?)$/i.test(path)) {
      e.respondWith(cacheFirst(req));
    }
  } else if (url.href.startsWith(CDN) && /\.m?js$/.test(url.pathname)) {
    e.respondWith(cacheFirst(req));
  }
});
