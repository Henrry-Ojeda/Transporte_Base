// Service Worker para Rutas Móvil (Offline-First / PWA Ultra-Resiliente v2.2.1)
const CACHE_NAME = 'rutas-movil-v2.2.1';
const STATIC_ASSETS = [
  '/',
  '/app',
  '/movil',
  '/login',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Pre-cachear las rutas principales sin romper si alguna falla
      for (const asset of STATIC_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('Pre-cache individual omitido:', asset, err);
        }
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo interceptar peticiones GET
  if (req.method !== 'GET') {
    return;
  }

  // 1. Peticiones a API Backend: Network-First con respuesta JSON offline controlada
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => {
        return new Response(
          JSON.stringify({ offline: true, message: 'Modo Offline (Sin conexión a internet)' }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 503,
            statusText: 'Offline',
          }
        );
      })
    );
    return;
  }

  // 2. Assets estáticos versionados de Vite (/assets/*): Cache-First con actualización en segundo plano
  if (url.pathname.startsWith('/assets/') || url.hostname.includes('cdnjs') || url.hostname.includes('fonts')) {
    event.respondWith(
      caches.match(req).then((cachedRes) => {
        if (cachedRes) {
          // Servir desde caché de inmediato y actualizar en segundo plano si hay red
          fetch(req).then((netRes) => {
            if (netRes && netRes.status === 200) {
              const resClone = netRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
            }
          }).catch(() => {});
          return cachedRes;
        }

        // Si no está en caché, traer de red y guardar en caché
        return fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        }).catch(() => {
          return new Response('Asset no disponible offline', { status: 503 });
        });
      })
    );
    return;
  }

  // 3. Documentos y Navegación SPA (/app, /movil, /, etc.): Network-First con Fallback Garantizado a index.html
  if (req.mode === 'navigate' || req.destination === 'document' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, resClone);
              cache.put('/index.html', resClone);
              cache.put('/app', resClone);
            });
          }
          return networkRes;
        })
        .catch(async () => {
          // Si no hay red, servir la SPA desde caché inmediatamente (previene pantalla en blanco)
          const cache = await caches.open(CACHE_NAME);
          const cachedPage =
            (await cache.match(req)) ||
            (await cache.match('/app')) ||
            (await cache.match('/index.html')) ||
            (await cache.match('/'));

          if (cachedPage) return cachedPage;

          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rutas Móvil Offline</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#0f172a;color:#fff;text-align:center;padding:40px;font-family:sans-serif;"><h2>Rutas Móvil</h2><p>Iniciando en modo sin conexión...</p><script>window.location.reload();</script></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }

  // 4. Cualquier otro recurso: Network con fallback a Caché
  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return networkRes;
      })
      .catch(() => caches.match(req))
  );
});
