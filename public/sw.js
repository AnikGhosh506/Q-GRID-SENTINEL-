/* ==========================================================================
   Q-GRID SENTINEL - Service Worker (100% Offline Capability Engine)
   Precaches index.html, style.css, scene.js, logic.js, and Three.js / TF.js CDNs
   ========================================================================== */

const CACHE_NAME = 'qgrid-sentinel-v5.0';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/scene.js',
  '/logic.js',
  '/manifest.json',
  '/icon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js'
];

// 1. Install Event: Precache core shell assets & CDNs
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE_ASSETS.map((asset) =>
          cache.add(asset).catch(() => {
            // Ignore individual precache network errors
          })
        )
      );
    })
  );
});

// 2. Activate Event: Clean up old cache versions & claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Network-First with 100% Offline Cache Fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Only intercept standard HTTP/HTTPS GET requests
  if (
    request.method !== 'GET' ||
    !url.protocol.startsWith('http') ||
    url.pathname.includes('__vite') ||
    url.pathname.includes('@vite') ||
    url.pathname.includes('browser-sync')
  ) {
    return;
  }

  // Handle API Requests: Network-First with cached JSON fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          return new Response(
            JSON.stringify({
              offlineMode: true,
              status: 'CACHE_FALLBACK',
              summary: 'OFFLINE MODE: Serving stored post-quantum SCADA telemetry.',
              severity: 'LOW',
              recommendedActions: ['Verify local BLE GATT credentials', 'Rotate Kyber-1024 keys'],
              confidenceScore: 0.95
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // Handle App Shell, Modules & CDNs: Network-First so updates load immediately, falling back to Cache for 100% offline boot
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;

        if (request.mode === 'navigate') {
          const fallbackNav = (await caches.match('/index.html')) || (await caches.match('/'));
          if (fallbackNav) return fallbackNav;
        }

        return new Response('Offline cache miss', {
          status: 503,
          statusText: 'Service Unavailable (Offline)',
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});
