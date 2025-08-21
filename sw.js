/*
  sw.js — PWA simple para tu web (no rompe tu JS)
  - HTML: network-first con fallback offline.
  - JS/CSS: stale-while-revalidate.
  - Imágenes/Fuentes: cache-first.
  - Ignora llamadas a tu API (no cachea /matches, /news, etc.).
*/
const VERSION = 'pwa-1.0.1';
const PRECACHE = `pre-${VERSION}`;
const RUNTIME = `rt-${VERSION}`;

// Archivos mínimos del shell (ajusta si tu HTML está en otra ruta)
const CORE = [
  '/',
  '/index.html',
  '/skin.css'
];

// Pequeña página de fallback offline
const OFFLINE_URL = '/__offline.html__';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    try { await cache.addAll(CORE); } catch {}
    await cache.put(OFFLINE_URL, new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title><style>body{font-family:system-ui,Segoe UI,Roboto;display:grid;place-items:center;height:100vh;margin:0;background:#0b0d10;color:#e8ecf1}main{max-width:560px;padding:24px;text-align:center}a{color:#9bd}</style><main><h1>Estás sin conexión</h1><p>Revisa los partidos que ya abriste; cuando vuelvas a tener red, actualizamos el resto.</p></main>`, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![PRECACHE, RUNTIME].includes(k)).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // No toques APIs: deja pasar matches/news/standings/... sin cachear
  if (/\/(matches|news|odds|odds_next|standings|relevant_team_match)\b/.test(url.pathname)) {
    return; // pass-through
  }

  const isHTML = req.headers.get('accept')?.includes('text/html') || url.pathname.endsWith('.html') || url.pathname === '/';
  const isAsset = /\.(?:js|mjs|css)$/i.test(url.pathname);
  const isMedia = /\.(?:png|jpe?g|webp|svg|gif|ico|avif|woff2?|ttf|otf)$/i.test(url.pathname);

  if (isHTML) {
    // Network-first para HTML
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(RUNTIME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(RUNTIME);
        const cached = await cache.match(req) || await caches.match(OFFLINE_URL);
        return cached || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  if (isAsset) {
    // Stale-while-revalidate para JS/CSS
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const cached = await cache.match(req);
      const network = fetch(req).then(res => { cache.put(req, res.clone()); return res; }).catch(() => null);
      return cached || await network || new Response('', { status: 504 });
    })());
    return;
  }

  if (isMedia) {
    // Cache-first para imágenes y fuentes
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req, { cache: 'force-cache' });
        cache.put(req, res.clone());
        return res;
      } catch {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // El resto: pasa sin interceptar
});