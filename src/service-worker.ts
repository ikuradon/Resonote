/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

import { files, version } from '$service-worker';

const CACHE_NAME = `resonote-${version}`;

// Only precache small static files (icons, favicon, manifest).
// Build assets (JS/CSS) include a 10MB emoji data chunk —
// precaching all of them would download 10MB+ on first visit.
// Instead, build assets are cached on-demand via the fetch handler.
const STATIC_ASSETS = [...files];

// Install: precache static files + SPA shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(STATIC_ASSETS);
        // Cache the SPA fallback (index.html) — adapter-static generates this
        // but it's not included in $service-worker's files or build arrays
        await cache.add('/');
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip WebSocket upgrade requests
  if (request.headers.get('upgrade') === 'websocket') return;

  // Parse URL only after early returns (avoid unnecessary work on non-GET/WebSocket)
  const url = new URL(request.url);

  // Skip external URLs (Spotify API, YouTube API, Google Fonts, Nostr relays, etc.)
  if (url.origin !== self.location.origin) return;

  // Navigation requests (SPA): network-first, fallback to cached "/" for offline
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/') as Promise<Response>));
    return;
  }

  // Immutable build assets (/_app/immutable/*): cache-first, cache on first fetch
  // These have content hashes in filenames — safe to cache indefinitely
  if (url.pathname.startsWith('/_app/immutable/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // Static files (precached): cache-first
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
