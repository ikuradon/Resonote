# PWA + Code Splitting — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Service Worker for app shell caching + PWA installability, and optimize chunk sizes.

**Architecture:** SvelteKit's built-in `$service-worker` module for SW, `manifest.webmanifest` for PWA. Vite config tuning for code splitting.

**Tech Stack:** SvelteKit, Vite, Tailwind CSS v4, adapter-static

**Pre-commit validation (MUST run before every commit):**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

---

## Current State

### Chunk Analysis

| チャンク      | サイズ        | 内容                              | ロード                                            |
| ------------- | ------------- | --------------------------------- | ------------------------------------------------- |
| `nQbgb3YN.js` | **10,103 KB** | @ikuradon/emoji-kitchen-mart-data | 遅延（dynamic import in preloadEmojiMart）        |
| `CksJDCBS.js` | **615 KB**    | @konemono/nostr-login + rx-nostr  | 遅延（dynamic import in initAuth/loadNostrLogin） |
| `CZKTLRKL.js` | **499 KB**    | nostr-tools 等                    | 遅延（各ストアの dynamic import 経由）            |

**結論**: 3つの大チャンクは全て dynamic import 経由で遅延ロードされており、初期バンドルには含まれない。Vite の 500KB 警告は「チャンクが存在する」ことへの警告で、初期ロードのブロッキングではない。

### 対応方針

1. **SW + PWA**: 新規実装
2. **Code splitting**: `chunkSizeWarningLimit` で警告抑制 + `manualChunks` で nostr-login を独立チャンク化

---

## Task 1: PWA Manifest + Icons

**Files:**

- Create: `static/manifest.webmanifest`
- Create: `static/icon-192.png` (generate from favicon.svg)
- Create: `static/icon-512.png` (generate from favicon.svg)
- Modify: `src/web/app.html` (add manifest link + meta tags)

- [ ] **Step 1: Generate PWA icons from favicon.svg**

Use the existing `static/favicon.svg` to generate PNG icons. The SVG is a speech-bubble-with-note logo in accent color (#c9a256) on transparent background.

Try in order (use whichever is available):

```bash
# Option A: ImageMagick
convert -background '#06060a' -density 384 static/favicon.svg -resize 192x192 static/icon-192.png
convert -background '#06060a' -density 1024 static/favicon.svg -resize 512x512 static/icon-512.png

# Option B: rsvg-convert (librsvg)
rsvg-convert -w 192 -h 192 -b '#06060a' static/favicon.svg -o static/icon-192.png
rsvg-convert -w 512 -h 512 -b '#06060a' static/favicon.svg -o static/icon-512.png

# Option C: sharp (Node.js — install temporarily)
node -e "const sharp = require('sharp'); sharp('static/favicon.svg').resize(192).flatten({background:'#06060a'}).png().toFile('static/icon-192.png')"
node -e "const sharp = require('sharp'); sharp('static/favicon.svg').resize(512).flatten({background:'#06060a'}).png().toFile('static/icon-512.png')"
```

The icons should have dark background (#06060a) with the accent-colored (#c9a256) logo.

- [ ] **Step 2: Create `static/manifest.webmanifest`**

```json
{
  "name": "Resonote",
  "short_name": "Resonote",
  "description": "Share your thoughts on what you're listening to",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#06060a",
  "theme_color": "#c9a256",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/favicon.svg",
      "sizes": "any",
      "type": "image/svg+xml"
    }
  ]
}
```

- [ ] **Step 3: Add manifest link and PWA meta tags to `src/web/app.html`**

Add inside `<head>`, after the favicon link:

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#c9a256" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<link rel="apple-touch-icon" href="/icon-192.png" />
```

- [ ] **Step 4: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add static/manifest.webmanifest static/icon-192.png static/icon-512.png src/web/app.html
git commit -m "Add PWA manifest and icons for installability"
```

---

## Task 2: Service Worker

SvelteKit provides `$service-worker` module with `build` (JS/CSS files), `files` (static assets), and `version` (build hash).

**Files:**

- Create: `src/service-worker.ts`

- [ ] **Step 1: Create the service worker**

Create `src/service-worker.ts` (SvelteKit auto-detects this file at the root of `src/`):

```typescript
/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

import { files, version } from '$service-worker';

const CACHE_NAME = `resonote-${version}`;

// Only precache small static files (icons, favicon, manifest) — NOT the full build.
// Build assets (JS/CSS) include a 10MB emoji data chunk — precaching would
// download 10MB+ on first visit. Instead, cache build assets on-demand.
const STATIC_ASSETS = [...files];

// Install: precache static files + SPA shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(STATIC_ASSETS);
        // Cache the SPA fallback (index.html) — adapter-static generates this
        // but it's not in $service-worker's `files` or `build` arrays
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
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip WebSocket upgrade requests
  if (request.headers.get('upgrade') === 'websocket') return;

  // Skip external URLs (Spotify API, YouTube API, Google Fonts, Nostr relays, etc.)
  if (url.origin !== self.location.origin) return;

  // Navigation requests (SPA): serve cached "/" fallback
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
```

Key design decisions:

- **Precache**: Only `files` (static assets: icons, manifest, favicon — a few KB) + `/` (SPA shell). **NOT** `build` (which includes a 10MB emoji data chunk).
- **Navigation**: Network-first, fallback to cached `/` on offline — shows cached SPA shell with IndexedDB data.
- **Immutable assets** (`/_app/immutable/*`): Cache-first with on-demand caching. Vite hashes these, so they're safe to cache forever. Large chunks (emoji, nostr-login) are cached only when actually loaded.
- **External URLs**: Skip entirely (Spotify, YouTube, fonts, Nostr relays).
- **WebSocket**: Explicitly skipped.

- [ ] **Step 2: Verify SvelteKit auto-registration**

SvelteKit auto-registers the service worker when `src/service-worker.ts` exists. No manual registration needed. Verify by building and checking the output:

```bash
pnpm build
```

Check that `build/service-worker.js` exists in the output.

- [ ] **Step 3: Run pre-commit validation + E2E**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
pnpm test:e2e
```

- [ ] **Step 4: Commit**

```bash
git add src/service-worker.ts
git commit -m "Add service worker for app shell caching and offline support"
```

---

## Task 3: Code Splitting Optimization

The 3 large chunks are already lazy-loaded via dynamic import. The remaining optimization is:

1. Suppress the misleading Vite warning
2. Separate nostr-login into its own chunk (it's currently bundled with rx-nostr)

**Files:**

- Modify: `vite.config.ts`

- [ ] **Step 1: Add chunk size warning limit**

```typescript
export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  build: {
    // Large vendor chunks are lazy-loaded via dynamic import:
    // - @ikuradon/emoji-kitchen-mart-data (~10MB) — emoji dataset
    // - @konemono/nostr-login (~615KB) — Nostr login UI
    // These don't block initial page load. Raise limit to suppress misleading warning.
    chunkSizeWarningLimit: 1000
  },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts', 'src/lib/**/*.d.ts']
    }
  }
});
```

Notes:

- `chunkSizeWarningLimit: 1000` — suppresses the 615KB nostr-login warning. The 10MB emoji-kitchen-mart warning intentionally remains as a reminder of the large dependency.
- `manualChunks` is intentionally **NOT used** — SvelteKit has its own chunking strategy and `manualChunks` can cause module loading conflicts. The current dynamic import-based splitting already works correctly.

- [ ] **Step 2: Build and verify**

```bash
pnpm build 2>&1 | grep -E "500|warning|kB" | tail -5
```

Verify no "500 kB" warning appears. Verify the app still works:

```bash
pnpm preview &
# Test in browser at http://localhost:4173
```

- [ ] **Step 3: Run pre-commit validation + E2E**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
pnpm test:e2e
```

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "Optimize code splitting: separate vendor chunks, suppress size warnings"
```

---

## Final Validation

### Task 4: Full validation suite

- [ ] **Step 1: Pre-commit checks**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 2: E2E tests**

```bash
pnpm test:e2e
```

- [ ] **Step 3: Production build**

```bash
pnpm build
```

Verify:

- `build/service-worker.js` exists
- `build/manifest.webmanifest` exists
- `build/icon-192.png` and `build/icon-512.png` exist
- No "500 kB" warnings in build output

- [ ] **Step 4: Extension builds**

```bash
pnpm build:ext:chrome && pnpm build:ext:firefox
```
