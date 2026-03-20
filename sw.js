// ═══════════════════════════════════════════════
//   I Need Coffee — Service Worker v2.0
//   Estrategia: Network First + Auto-update
// ═══════════════════════════════════════════════

const CACHE_NAME = 'inc-v2.0';
const CACHE_STATIC = 'inc-static-v2.0';

// Assets que se cachean con Cache First (no cambian frecuentemente)
const STATIC_ASSETS = [
  '/i-need-coffee/icon-192x192.png',
  '/i-need-coffee/icon-512x512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap',
];

// URLs que NUNCA se cachean (Firebase, APIs en tiempo real)
const NEVER_CACHE = [
  'firebaseio.com',
  'googleapis.com/identitytoolkit',
  'firebasestorage',
  'gstatic.com/firebasejs',
];

// ── INSTALL ──────────────────────────────────────
self.addEventListener('install', event => {
  // Activar inmediatamente sin esperar tabs anteriores
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Si falla algún asset estático, continúa igual
      });
    })
  );
});

// ── ACTIVATE ─────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      // Tomar control de todos los clientes inmediatamente
      self.clients.claim(),
      // Limpiar caches viejos
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME && key !== CACHE_STATIC)
            .map(key => {
              console.log('[SW] Eliminando cache viejo:', key);
              return caches.delete(key);
            })
        )
      ),
    ])
  );
});

// ── FETCH ─────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // 1. Nunca cachear Firebase ni APIs en tiempo real
  if (NEVER_CACHE.some(pattern => url.includes(pattern))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. Assets estáticos → Cache First
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // 3. Todo lo demás (HTML, JS, CSS) → Network First
  event.respondWith(networkFirst(event.request));
});

// ── ESTRATEGIAS ───────────────────────────────────

// Network First: intenta red, si falla usa cache
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback offline básico
    return new Response(
      '<html><body style="font-family:sans-serif;text-align:center;padding:2rem;background:#1a1008;color:#c8a84b;"><h2>☕ Sin conexión</h2><p>Revisa tu internet e intenta de nuevo.</p></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}

// Cache First: sirve desde cache, actualiza en background
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Actualizar en background sin bloquear
    fetch(request).then(response => {
      if (response.ok) {
        caches.open(CACHE_STATIC).then(cache => cache.put(request, response));
      }
    }).catch(() => {});
    return cached;
  }
  // No está en cache, buscar en red
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_STATIC);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 404 });
  }
}

function isStaticAsset(url) {
  return (
    url.includes('icon-192x192.png') ||
    url.includes('icon-512x512.png') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com')
  );
}

// ── MENSAJE DESDE LA APP ──────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
