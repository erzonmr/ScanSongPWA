// Service Worker — cachea la "cáscara" de la app para que abra rápido e
// instalable. Los DATOS (canciones e imágenes) NO se cachean: viven en Supabase.
const VERSION = 'cantoral-v1.0.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/lib.js',
  './js/db.js',
  './js/chords.js',
  './js/scanner.js',
  './js/ocr.js',
  './js/imaging.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
// Librerías de CDN con versión fija (inmutables): se cachean al primer uso.
const CDN_HOSTS = ['cdn.jsdelivr.net', 'tessdata.projectnaptha.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'cantoral-cdn').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Supabase (datos, auth, realtime, storage): siempre a la red.
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return;

  // CDN versionado: cache-first.
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open('cantoral-cdn').then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // config.js: red primero (para que los cambios de configuración apliquen).
  // Navegación y archivos propios: stale-while-revalidate.
  const networkFirst = url.pathname.endsWith('/config.js') || req.mode === 'navigate';
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
      const network = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      });
      if (networkFirst) return network.catch(() => cached || Response.error());
      network.catch(() => {});
      return cached || network;
    }),
  );
});
