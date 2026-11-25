// Developed by pheonix14 (https://github.com/pheonix14)
/**
 * TRASURE X - High-Speed Offline Service Worker
 * 
 * Provides instantaneous cold startup, asset caching, and offline resiliency.
 * Strategies:
 * - Cache-First for static assets (JS, CSS, fonts, images, SVGs)
 * - Network-First with cached fallback for HTML shell
 * - Resilient offline failover for disconnected exploration
 */

const CACHE_NAME = 'trasu-x-offline-v4.1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/vite.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Precache notice:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests and chrome-extension / non-http requests
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // API calls: Network-first
  if (url.pathname.startsWith('/api') || url.hostname.includes('supabase.co') || url.hostname.includes('openstreetmap.org') || url.hostname.includes('arcgisonline.com')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Static Assets (Vite chunks, CSS, JS, images, fonts): Cache-first with background revalidation
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.woff2') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('fonts.googleapis.com')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Revalidate in background
          fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
            }
          }).catch(() => {});
          return cachedResponse;
        }

        return fetch(request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          return networkResponse;
        }).catch(() => caches.match('/index.html'));
      })
    );
    return;
  }

  // HTML Navigation Requests: Network-First with Cache Fallback for instant offline startup
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // Default fallback
  event.respondWith(
    caches.match(request).then((response) => response || fetch(request))
  );
});
