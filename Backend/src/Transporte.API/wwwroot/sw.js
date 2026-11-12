// Service Worker para Rutas Móvil (Offline-First / PWA Ultra-Resiliente)
const CACHE_NAME = 'rutas-movil-v3.18.25';
const STATIC_ASSETS = [
  "/",
  "/app",
  "/movil",
  "/login",
  "/index.html",
  "/manifest.json",
  "/favicon.svg",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css",
  "/assets/index-DNPXe4jK.js",
  "/assets/index-DZlfE0ZF.css",
  "/assets/rolldown-runtime-XKyaHtl9.js",
  "/assets/vendor-excel-D_lWTlWp.js",
  "/assets/vendor-query-DagBFWEK.js",
  "/assets/vendor-react-gsTGkHJe.js",
  "/assets/vendor-ui-yH1BaoYu.js"
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Pre-cachear las rutas principales y activos estáticos
      for (const asset of STATIC_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('[SW] Pre-cache omitido para:', asset, err);
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

  // Solo interceptar peticiones HTTP / HTTPS y de método GET (ignorar extensiones chrome-extension, etc.)
  if (req.method !== 'GET' || !url.protocol.startsWith('http')) {
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

  // 2. Assets estáticos versionados de Vite (/assets/*) y librerías externas (CDN)
  if (url.pathname.startsWith('/assets/') || url.hostname.includes('cdnjs') || url.hostname.includes('fonts')) {
    event.respondWith(
      caches.match(req).then(async (cachedRes) => {
        if (cachedRes) {
          // Servir desde caché de inmediato y actualizar en segundo plano si hay red
          if (navigator.onLine) {
            fetch(req).then((netRes) => {
              if (netRes && netRes.status === 200) {
                const resClone = netRes.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
              }
            }).catch(() => {});
          }
          return cachedRes;
        }

        // Si no está en caché, intentar traer de red
        try {
          const networkRes = await fetch(req);
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            const cache = await caches.open(CACHE_NAME);
            await cache.put(req, resClone);
          }
          return networkRes;
        } catch (err) {
          // Fallback ultra-seguro para que el navegador jamás reciba un error 503 text/plain que aborte la app
          const ext = url.pathname.split('.').pop()?.toLowerCase();
          const cache = await caches.open(CACHE_NAME);
          const allKeys = await cache.keys();

          if (ext === 'js' || ext === 'mjs') {
            // Buscar si hay algún JS del mismo chunk o bundle en caché
            const chunkName = url.pathname.split('/').pop()?.split('-')[0];
            const fallbackKey = allKeys.find((k) => k.url.includes(`/assets/${chunkName}-`) && k.url.endsWith('.js'));
            if (fallbackKey) {
              const res = await cache.match(fallbackKey);
              if (res) return res;
            }
            return new Response('/* offline safe stub */\nexport default {};', {
              status: 200,
              headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
            });
          }

          if (ext === 'css') {
            const fallbackCss = allKeys.find((k) => k.url.includes('/assets/') && k.url.endsWith('.css'));
            if (fallbackCss) {
              const res = await cache.match(fallbackCss);
              if (res) return res;
            }
            return new Response('/* offline safe css */', {
              status: 200,
              headers: { 'Content-Type': 'text/css; charset=utf-8' },
            });
          }

          return new Response('', { status: 200 });
        }
      })
    );
    return;
  }

  // 3. Documentos y Navegación SPA (/app, /movil, /, etc.): OFFLINE-FIRST.
  //    - Con red: se intenta la red pero con un tiempo límite corto (señal débil != sin señal); si tarda o falla se sirve la SPA guardada.
  //    - Sin red: se sirve directamente la SPA guardada (cero espera).
  //    - Cada respuesta válida se guarda con CLONES INDEPENDIENTES (un Response solo se puede consumir una vez).
  if (req.mode === 'navigate' || req.destination === 'document' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        const buscarEnCache = async () =>
          (await cache.match(req)) ||
          (await cache.match('/movil')) ||
          (await cache.match('/app')) ||
          (await cache.match('/index.html')) ||
          (await cache.match('/'));

        if (!navigator.onLine) {
          const cached = await buscarEnCache();
          if (cached) return cached;
        }

        try {
          const NAV_TIMEOUT_MS = 4000;
          const networkRes = await Promise.race([
            fetch(req),
            new Promise((_, reject) => setTimeout(() => reject(new Error('nav-timeout')), NAV_TIMEOUT_MS)),
          ]);

          if (networkRes && networkRes.status === 200) {
            // Un clone independiente por cada clave (evita "Response body is already used")
            const claves = [req, '/index.html', '/app', '/movil', '/'];
            for (const key of claves) {
              try {
                await cache.put(key, networkRes.clone());
              } catch (e) {
                /* tolerante */
              }
            }
          }
          return networkRes;
        } catch (e) {
          const cachedPage = await buscarEnCache();
          if (cachedPage) return cachedPage;

          // Si de verdad no hay ninguna página guardada aún, mostrar terminal offline estilizada
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rutas Móvil</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#0f172a;color:#fff;text-align:center;padding:40px;font-family:sans-serif;"><h2>Rutas Móvil</h2><p>Sin conexión y sin datos guardados todavía. Conéctate a internet una vez para descargar la aplicación.</p><button onclick="window.location.reload()" style="background:#10b981;color:#fff;border:none;padding:12px 24px;border-radius:10px;font-weight:bold;cursor:pointer;">Reintentar</button></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })()
    );
    return;
  }

  // 4. Cualquier otro recurso: Network con fallback a Caché
  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200 && req.url.startsWith('http')) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
        }
        return networkRes;
      })
      .catch(() => caches.match(req))
  );
});

// ==============================================================================
// GESTIÓN DE NOTIFICACIONES PUSH NATIVAS (PANTALLA BLOQUEADA Y SEGUNDO PLANO)
// ==============================================================================

self.addEventListener('push', (event) => {
  let data = {
    titulo: 'Transporte V2',
    mensaje: 'Nueva actualización en tu ruta o despacho.',
    id: Date.now(),
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.mensaje = event.data.text() || data.mensaje;
    }
  }

  const title = data.titulo || 'Transporte V2 - Notificación';
  const options = {
    body: data.mensaje,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [500, 200, 500, 200, 500],
    data: {
      url: data.url || '/movil',
      id: data.id,
      timestamp: Date.now(),
    },
    tag: `transporte-notif-${data.id || Date.now()}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Abrir o enfocar la app cuando el usuario toca la notificación en pantalla bloqueada
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/movil') || client.url.includes('/app')) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/movil');
      }
    })
  );
});

// Mensaje directo desde la aplicación React para disparar notificación a nivel de SO
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { titulo, mensaje, id } = event.data;
    self.registration.showNotification(titulo || 'Transporte V2', {
      body: mensaje || 'Actualización en tu recorrido.',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      vibrate: [300, 100, 300, 100, 400],
      tag: `transporte-notif-${id || Date.now()}`,
      renotify: true,
      requireInteraction: true,
      data: { url: '/movil', id },
    });
  }
});

