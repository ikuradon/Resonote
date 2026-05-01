# Hono 移行 実装計画

> **エージェント向け:** 必須サブスキル: superpowers:subagent-driven-development（推奨）または superpowers:executing-plans を使ってタスクごとに実装すること。ステップはチェックボックス (`- [ ]`) 構文で進捗を追跡する。

**ゴール:** Cloudflare Pages Functions (`functions/`) を `src/server/` に統合し、Hono ルーター + Cache API + 型安全クライアントを導入する

**アーキテクチャ:** adapter-static → adapter-cloudflare に切り替え、`hooks.server.ts` で `/api/*` を Hono にディスパッチ。各エンドポイントはサブ Hono アプリとして分離し、`app.ts` で集約。フロントエンドは `hc<AppType>()` で型安全に API を呼ぶ。

**技術スタック:** Hono, @hono/zod-validator, Zod, @sveltejs/adapter-cloudflare, Cache API

---

## Task 1: 依存パッケージの更新

**ファイル:**

- 変更: `package.json`
- 変更: `svelte.config.js`

- [ ] **Step 1: パッケージの追加・削除**

```bash
pnpm add hono @hono/zod-validator zod
pnpm add -D @sveltejs/adapter-cloudflare
pnpm remove @sveltejs/adapter-static @sveltejs/adapter-auto
```

- [ ] **Step 2: svelte.config.js のアダプター変更**

`svelte.config.js` を以下のように変更:

```javascript
import adapter from '@sveltejs/adapter-cloudflare';

const config = {
  kit: {
    adapter: adapter(),
    alias: {
      $shared: 'src/shared',
      $features: 'src/features',
      $appcore: 'src/app',
      $extension: 'src/extension',
      $server: 'src/server'
    },
    files: {
      routes: 'src/web/routes',
      appTemplate: 'src/web/app.html'
    }
  },
  vitePlugin: {
    dynamicCompileOptions: ({ filename }) => ({ runes: !filename.includes('node_modules') })
  }
};

export default config;
```

変更点:

- `adapter-static` → `adapter-cloudflare`
- `fallback: 'index.html'` を削除（adapter-cloudflare が処理）
- `$server` エイリアスを追加

- [ ] **Step 3: ビルドの確認**

```bash
pnpm check
```

期待: 0 ERRORS（adapter 変更のみなのでコンパイルエラーなし）

- [ ] **Step 4: コミット**

```bash
git add package.json pnpm-lock.yaml svelte.config.js
git commit -m "chore: switch to adapter-cloudflare and add Hono dependencies"
```

---

## Task 2: サーバー共通ライブラリの移動

**ファイル:**

- 作成: `src/server/lib/safe-fetch.ts`
- 作成: `src/server/lib/audio-metadata.ts`
- テスト: `src/server/lib/safe-fetch.test.ts`（移動）
- テスト: `src/server/lib/audio-metadata.test.ts`（移動）

- [ ] **Step 1: ディレクトリ作成とファイル移動**

```bash
mkdir -p src/server/lib
cp functions/lib/url-validation.ts src/server/lib/safe-fetch.ts
cp functions/lib/url-validation.test.ts src/server/lib/safe-fetch.test.ts
cp functions/lib/audio-metadata.ts src/server/lib/audio-metadata.ts
cp functions/lib/audio-metadata.test.ts src/server/lib/audio-metadata.test.ts
```

- [ ] **Step 2: テストの import パスを修正**

`src/server/lib/safe-fetch.test.ts`: import パスを修正:

```typescript
// Before
import { assertSafeUrl, safeFetch, safeReadText } from './url-validation.js';
// After
import { assertSafeUrl, safeFetch, safeReadText } from './safe-fetch.js';
```

`src/server/lib/audio-metadata.test.ts`: import パスを修正:

```typescript
// Before
import { fetchAudioMetadata } from './audio-metadata.js';
import { safeFetch } from './url-validation.js';
// After
import { fetchAudioMetadata } from './audio-metadata.js';
import { safeFetch } from './safe-fetch.js';
```

`src/server/lib/audio-metadata.ts`: import パスを修正:

```typescript
// Before
import { safeFetch, safeReadText } from './url-validation.js';
// After
import { safeFetch, safeReadText } from './safe-fetch.js';
```

- [ ] **Step 3: テスト実行**

```bash
pnpm vitest run src/server/lib/
```

期待: 全テストパス（ロジックは同一、パスのみ変更）

- [ ] **Step 4: コミット**

```bash
git add src/server/lib/
git commit -m "refactor: move server utilities from functions/lib/ to src/server/lib/"
```

---

## Task 3: Hono ミドルウェア

**ファイル:**

- 作成: `src/server/api/middleware/cache.ts`
- 作成: `src/server/api/middleware/error-handler.ts`
- テスト: `src/server/api/middleware/cache.test.ts`
- テスト: `src/server/api/middleware/error-handler.test.ts`

- [ ] **Step 1: エラーハンドラのテストを書く**

`src/server/api/middleware/error-handler.test.ts`:

```typescript
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';

import { errorHandler } from './error-handler.js';

describe('errorHandler', () => {
  function createApp() {
    const app = new Hono();
    app.onError(errorHandler);
    return app;
  }

  it('should return HTTPException status and message', async () => {
    const app = createApp();
    app.get('/test', () => {
      throw new HTTPException(400, { message: 'bad request' });
    });

    const res = await app.request('/test');
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toEqual({ error: 'bad request' });
  });

  it('should return 500 for unknown errors', async () => {
    const app = createApp();
    app.get('/test', () => {
      throw new Error('unexpected');
    });

    const res = await app.request('/test');
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data).toEqual({ error: 'Internal Server Error' });
  });
});
```

- [ ] **Step 2: テスト実行 → 失敗を確認**

```bash
pnpm vitest run src/server/api/middleware/error-handler.test.ts
```

期待: FAIL（`error-handler.js` が存在しない）

- [ ] **Step 3: エラーハンドラを実装**

`src/server/api/middleware/error-handler.ts`:

```typescript
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error('Unhandled API error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
}
```

- [ ] **Step 4: テスト実行 → パスを確認**

```bash
pnpm vitest run src/server/api/middleware/error-handler.test.ts
```

期待: PASS

- [ ] **Step 5: キャッシュミドルウェアのテストを書く**

`src/server/api/middleware/cache.test.ts`:

```typescript
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cacheMiddleware } from './cache.js';

describe('cacheMiddleware', () => {
  const mockCache = {
    match: vi.fn(),
    put: vi.fn()
  };

  beforeEach(() => {
    vi.stubGlobal('caches', { default: mockCache });
    mockCache.match.mockReset();
    mockCache.put.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return cached response on hit', async () => {
    const cachedBody = JSON.stringify({ cached: true });
    mockCache.match.mockResolvedValue(
      new Response(cachedBody, {
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const app = new Hono();
    app.get('/test', cacheMiddleware({ ttl: 60 }), (c) => c.json({ cached: false }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ cached: true });
  });

  it('should call handler and cache on miss', async () => {
    mockCache.match.mockResolvedValue(undefined);

    const app = new Hono();
    app.get('/test', cacheMiddleware({ ttl: 300 }), (c) => c.json({ fresh: true }));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ fresh: true });
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
  });

  it('should not cache error responses', async () => {
    mockCache.match.mockResolvedValue(undefined);

    const app = new Hono();
    app.get('/test', cacheMiddleware({ ttl: 60 }), (c) => c.json({ error: 'bad' }, 400));

    const res = await app.request('/test');
    expect(res.status).toBe(400);
    expect(mockCache.put).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: テスト実行 → 失敗を確認**

```bash
pnpm vitest run src/server/api/middleware/cache.test.ts
```

期待: FAIL

- [ ] **Step 7: キャッシュミドルウェアを実装**

`src/server/api/middleware/cache.ts`:

```typescript
import type { MiddlewareHandler } from 'hono';

interface CacheOptions {
  ttl: number;
}

export function cacheMiddleware(options: CacheOptions): MiddlewareHandler {
  return async (c, next) => {
    const cache = caches.default;
    const cacheKey = new Request(c.req.url, { method: 'GET' });

    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

    await next();

    if (c.res.status >= 200 && c.res.status < 300) {
      c.res.headers.set('Cache-Control', `public, max-age=${options.ttl}`);
      const responseToCache = c.res.clone();
      c.executionCtx?.waitUntil(cache.put(cacheKey, responseToCache));
    }
  };
}
```

- [ ] **Step 8: テスト実行 → パスを確認**

```bash
pnpm vitest run src/server/api/middleware/
```

期待: 全テストパス

- [ ] **Step 9: コミット**

```bash
git add src/server/api/middleware/
git commit -m "feat: add Hono cache and error-handler middleware"
```

---

## Task 4: system/pubkey ルート（最も単純なエンドポイント）

**ファイル:**

- 作成: `src/server/api/system.ts`
- テスト: `src/server/api/system.test.ts`

- [ ] **Step 1: テストを書く**

`src/server/api/system.test.ts`:

```typescript
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { systemRoute } from './system.js';

vi.mock('nostr-tools/pure', () => ({
  getPublicKey: vi.fn(() => 'a'.repeat(64))
}));

vi.mock('nostr-tools/utils', () => ({
  hexToBytes: vi.fn((hex: string) => new Uint8Array(hex.length / 2))
}));

type Bindings = { SYSTEM_NOSTR_PRIVKEY: string };

function createApp(env: Partial<Bindings> = {}) {
  const app = new Hono<{ Bindings: Bindings }>();
  app.route('/system', systemRoute);
  return { app, env: { SYSTEM_NOSTR_PRIVKEY: 'b'.repeat(64), ...env } };
}

describe('GET /system/pubkey', () => {
  it('should return pubkey when configured', async () => {
    const { app, env } = createApp();
    const res = await app.request('/system/pubkey', {}, env);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('pubkey');
  });

  it('should return 503 when privkey not configured', async () => {
    const { app } = createApp();
    const res = await app.request('/system/pubkey', {}, { SYSTEM_NOSTR_PRIVKEY: '' });
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: テスト実行 → 失敗を確認**

```bash
pnpm vitest run src/server/api/system.test.ts
```

期待: FAIL

- [ ] **Step 3: ルートを実装**

`src/server/api/system.ts`:

```typescript
import { Hono } from 'hono';
import { getPublicKey } from 'nostr-tools/pure';
import { hexToBytes } from 'nostr-tools/utils';

import type { Bindings } from './app.js';

export const systemRoute = new Hono<{ Bindings: Bindings }>().get('/pubkey', (c) => {
  const privkeyHex = c.env.SYSTEM_NOSTR_PRIVKEY;
  if (!privkeyHex) {
    return c.json({ error: 'not_configured' }, 503);
  }

  try {
    const privkey = hexToBytes(privkeyHex);
    const pubkey = getPublicKey(privkey);
    return c.json({ pubkey }, 200, { 'Cache-Control': 'public, max-age=86400' });
  } catch {
    return c.json({ error: 'invalid_key' }, 503);
  }
});
```

- [ ] **Step 4: テスト実行 → パスを確認**

```bash
pnpm vitest run src/server/api/system.test.ts
```

期待: PASS

- [ ] **Step 5: コミット**

```bash
git add src/server/api/system.ts src/server/api/system.test.ts
git commit -m "feat: add Hono system/pubkey route"
```

---

## Task 5: podbean ルート

**ファイル:**

- 作成: `src/server/api/podbean.ts`
- テスト: `src/server/api/podbean.test.ts`

- [ ] **Step 1: テストを書く**

`src/server/api/podbean.test.ts`:

```typescript
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { podbeanRoute } from './podbean.js';

type Bindings = { UNSAFE_ALLOW_PRIVATE_IPS?: string };

function createApp(env: Partial<Bindings> = {}) {
  const app = new Hono<{ Bindings: Bindings }>();
  app.route('/podbean', podbeanRoute);
  return { app, env };
}

describe('GET /podbean/resolve', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return 400 for missing url', async () => {
    const { app, env } = createApp();
    const res = await app.request('/podbean/resolve', {}, env);
    expect(res.status).toBe(400);
  });

  it('should return embedSrc from oEmbed response', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          html: '<iframe src="https://www.podbean.com/player-v2/?i=abc"></iframe>'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', mockFetch);

    const { app, env } = createApp({ UNSAFE_ALLOW_PRIVATE_IPS: '1' });
    const res = await app.request('/podbean/resolve?url=https://www.podbean.com/e/test', {}, env);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('embedSrc');
  });
});
```

- [ ] **Step 2: テスト実行 → 失敗を確認**

```bash
pnpm vitest run src/server/api/podbean.test.ts
```

- [ ] **Step 3: ルートを実装**

`src/server/api/podbean.ts`:

`functions/api/podbean/resolve.ts` のロジックを Hono ルートに変換。`zValidator` でクエリバリデーション追加。`safeFetch` を `$server/lib/safe-fetch.js` からインポート。`cacheMiddleware({ ttl: 86400 })` を適用。

- [ ] **Step 4: テスト実行 → パスを確認**

```bash
pnpm vitest run src/server/api/podbean.test.ts
```

- [ ] **Step 5: コミット**

```bash
git add src/server/api/podbean.ts src/server/api/podbean.test.ts
git commit -m "feat: add Hono podbean/resolve route"
```

---

## Task 6: youtube/feed ルート

**ファイル:**

- 作成: `src/server/api/youtube.ts`
- テスト: `src/server/api/youtube.test.ts`

- [ ] **Step 1: テストを書く**

`functions/api/youtube/feed.test.ts` のテストを Hono の `app.request()` パターンに書き換え。

- [ ] **Step 2: テスト実行 → 失敗を確認**

- [ ] **Step 3: ルートを実装**

`functions/api/youtube/feed.ts` のロジックを Hono ルートに変換。`zValidator` で type/id バリデーション。`cacheMiddleware({ ttl: 900 })` を適用。

- [ ] **Step 4: テスト実行 → パスを確認**

- [ ] **Step 5: コミット**

```bash
git add src/server/api/youtube.ts src/server/api/youtube.test.ts
git commit -m "feat: add Hono youtube/feed route"
```

---

## Task 7: oembed/resolve ルート

**ファイル:**

- 作成: `src/server/api/oembed.ts`
- テスト: `src/server/api/oembed.test.ts`

- [ ] **Step 1: テストを書く**

`functions/api/oembed/resolve.test.ts` のテストを Hono の `app.request()` パターンに書き換え。プラットフォーム別テスト（Spotify, YouTube, Niconico 等）を維持。

- [ ] **Step 2: テスト実行 → 失敗を確認**

- [ ] **Step 3: ルートを実装**

`functions/api/oembed/resolve.ts` のロジックを Hono ルートに変換。`zValidator` で platform/type/id バリデーション。`cacheMiddleware({ ttl: 86400 })` を適用。

- [ ] **Step 4: テスト実行 → パスを確認**

- [ ] **Step 5: コミット**

```bash
git add src/server/api/oembed.ts src/server/api/oembed.test.ts
git commit -m "feat: add Hono oembed/resolve route"
```

---

## Task 8: podcast/resolve ルート + htmlToMarkdown 重複解消

**ファイル:**

- 作成: `src/server/api/podcast.ts`
- テスト: `src/server/api/podcast.test.ts`
- 変更なし: `src/shared/utils/html.ts`（既存の `htmlToMarkdown` をインポートするだけ）

- [ ] **Step 1: テストを書く**

`functions/api/podcast/resolve.test.ts` のテストを Hono の `app.request()` パターンに書き換え。`htmlToMarkdown` のテストは `src/shared/utils/html.test.ts` に既にあるので、ルートテストでは重複しない。

- [ ] **Step 2: テスト実行 → 失敗を確認**

- [ ] **Step 3: ルートを実装**

`functions/api/podcast/resolve.ts` のロジックを Hono ルートに変換。重要な変更点:

- `htmlToMarkdown` を `$shared/utils/html.js` からインポート（重複解消）
- `safeFetch`, `fetchAudioMetadata` を `$server/lib/` からインポート
- `zValidator` で url バリデーション
- `cacheMiddleware({ ttl: 3600 })` を適用
- 内部ヘルパー関数（`parseRss`, `detectInputType`, `signBookmarkEvent` 等）はそのまま移動

- [ ] **Step 4: テスト実行 → パスを確認**

- [ ] **Step 5: コミット**

```bash
git add src/server/api/podcast.ts src/server/api/podcast.test.ts
git commit -m "feat: add Hono podcast/resolve route, deduplicate htmlToMarkdown"
```

---

## Task 9: Hono アプリ集約 + hooks.server.ts

**ファイル:**

- 作成: `src/server/api/app.ts`
- 作成: `src/hooks.server.ts`
- テスト: `src/server/api/app.test.ts`

- [ ] **Step 1: テストを書く**

`src/server/api/app.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';

import { app } from './app.js';

vi.mock('nostr-tools/pure', () => ({
  getPublicKey: vi.fn(() => 'a'.repeat(64)),
  finalizeEvent: vi.fn((template, key) => ({
    ...template,
    id: 'mock',
    sig: 'mock',
    pubkey: 'a'.repeat(64)
  }))
}));

vi.mock('nostr-tools/utils', () => ({
  hexToBytes: vi.fn((hex: string) => new Uint8Array(hex.length / 2))
}));

const testEnv = {
  SYSTEM_NOSTR_PRIVKEY: 'b'.repeat(64),
  UNSAFE_ALLOW_PRIVATE_IPS: '1'
};

describe('Hono app routing', () => {
  it('should route /api/system/pubkey', async () => {
    const res = await app.request('/api/system/pubkey', {}, testEnv);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('pubkey');
  });

  it('should return 400 for /api/podcast/resolve without url', async () => {
    const res = await app.request('/api/podcast/resolve', {}, testEnv);
    expect(res.status).toBe(400);
  });

  it('should return 400 for /api/oembed/resolve without params', async () => {
    const res = await app.request('/api/oembed/resolve', {}, testEnv);
    expect(res.status).toBe(400);
  });

  it('should return 400 for /api/youtube/feed without params', async () => {
    const res = await app.request('/api/youtube/feed', {}, testEnv);
    expect(res.status).toBe(400);
  });

  it('should return 400 for /api/podbean/resolve without url', async () => {
    const res = await app.request('/api/podbean/resolve', {}, testEnv);
    expect(res.status).toBe(400);
  });

  it('should return 404 for unknown api routes', async () => {
    const res = await app.request('/api/nonexistent', {}, testEnv);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: テスト実行 → 失敗を確認**

```bash
pnpm vitest run src/server/api/app.test.ts
```

- [ ] **Step 3: app.ts を実装**

`src/server/api/app.ts`:

```typescript
import { Hono } from 'hono';

import { errorHandler } from './middleware/error-handler.js';
import { oembedRoute } from './oembed.js';
import { podcastRoute } from './podcast.js';
import { podbeanRoute } from './podbean.js';
import { systemRoute } from './system.js';
import { youtubeRoute } from './youtube.js';

export type Bindings = {
  SYSTEM_NOSTR_PRIVKEY: string;
  YOUTUBE_API_KEY?: string;
  UNSAFE_ALLOW_PRIVATE_IPS?: string;
};

const app = new Hono<{ Bindings: Bindings }>().basePath('/api');

app.onError(errorHandler);

const route = app
  .route('/podcast', podcastRoute)
  .route('/oembed', oembedRoute)
  .route('/youtube', youtubeRoute)
  .route('/podbean', podbeanRoute)
  .route('/system', systemRoute);

export type AppType = typeof route;
export { app };
```

- [ ] **Step 4: hooks.server.ts を実装**

`src/hooks.server.ts`:

```typescript
import type { Handle } from '@sveltejs/kit';

import { app } from '$server/api/app.js';

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/api/')) {
    return app.fetch(event.request, event.platform?.env, event.platform?.context);
  }
  return resolve(event);
};
```

- [ ] **Step 5: テスト実行 → パスを確認**

```bash
pnpm vitest run src/server/api/app.test.ts
```

- [ ] **Step 6: コミット**

```bash
git add src/server/api/app.ts src/server/api/app.test.ts src/hooks.server.ts
git commit -m "feat: add Hono app aggregation and hooks.server.ts dispatch"
```

---

## Task 10: 型安全クライアント + フロントエンド移行

**ファイル:**

- 作成: `src/shared/api/client.ts`
- 変更: `src/shared/content/podcast-resolver.ts`（`fetch()` → `apiClient`）
- 変更: `src/features/content-resolution/application/fetch-content-metadata.ts`
- 変更: `src/features/content-resolution/application/resolve-youtube-feed.ts`
- 変更: `src/features/content-resolution/infra/podbean-api-client.ts`

- [ ] **Step 1: API クライアントを作成**

`src/shared/api/client.ts`:

```typescript
import { hc } from 'hono/client';

import type { AppType } from '$server/api/app.js';

export const apiClient = hc<AppType>(typeof window !== 'undefined' ? window.location.origin : '');
```

- [ ] **Step 2: podcast-resolver.ts を移行**

`src/shared/content/podcast-resolver.ts` の `getSystemPubkey()` と `resolveByApi()` を `apiClient` に変更:

```typescript
// Before
const res = await fetch('/api/system/pubkey');
// After
import { apiClient } from '$shared/api/client.js';
const res = await apiClient.system.pubkey.$get();
```

```typescript
// Before
const res = await fetch(`/api/podcast/resolve?url=${encodeURIComponent(url)}`);
// After
const res = await apiClient.podcast.resolve.$get({ query: { url } });
```

- [ ] **Step 3: fetch-content-metadata.ts を移行**

```typescript
// Before
const res = await fetch(`/api/oembed/resolve?${params}`);
// After
import { apiClient } from '$shared/api/client.js';
const res = await apiClient.oembed.resolve.$get({
  query: { platform: contentId.platform, type: contentId.type, id: contentId.id }
});
```

- [ ] **Step 4: resolve-youtube-feed.ts を移行**

```typescript
// Before
const res = await fetch(`/api/youtube/feed?${params}`);
// After
import { apiClient } from '$shared/api/client.js';
const res = await apiClient.youtube.feed.$get({ query: { type, id } });
```

- [ ] **Step 5: podbean-api-client.ts を移行**

```typescript
// Before
const res = await fetch(`/api/podbean/resolve?url=${encodeURIComponent(sourceUrl)}`);
// After
import { apiClient } from '$shared/api/client.js';
const res = await apiClient.podbean.resolve.$get({ query: { url: sourceUrl } });
```

- [ ] **Step 6: 型チェック**

```bash
pnpm check
```

期待: 0 ERRORS

- [ ] **Step 7: ユニットテスト**

```bash
pnpm test
```

期待: 全テストパス（API 呼び出しはモックされているため）

- [ ] **Step 8: コミット**

```bash
git add src/shared/api/client.ts src/shared/content/podcast-resolver.ts \
  src/features/content-resolution/application/fetch-content-metadata.ts \
  src/features/content-resolution/application/resolve-youtube-feed.ts \
  src/features/content-resolution/infra/podbean-api-client.ts
git commit -m "feat: migrate frontend API calls to type-safe Hono client"
```

---

## Task 11: functions/ 削除 + wrangler.toml 追加

**ファイル:**

- 削除: `functions/` ディレクトリ全体
- 作成: `wrangler.toml`
- 変更: `.gitignore`（`.wrangler/` が既に含まれていることを確認）

- [ ] **Step 1: functions/ を削除**

```bash
rm -rf functions/
```

- [ ] **Step 2: wrangler.toml を作成**

```toml
name = "resonote"
compatibility_date = "2026-03-28"

# Environment variables are set via:
# - .dev.vars (local development)
# - wrangler pages secret (production)
```

- [ ] **Step 3: ビルド確認**

```bash
pnpm check && pnpm test
```

期待: `functions/` のテストが消えた分テスト数は減るが、`src/server/` のテストが同等のカバレッジを持つ。0 ERRORS。

- [ ] **Step 4: コミット**

```bash
git add -A
git commit -m "chore: remove functions/ directory, add wrangler.toml"
```

---

## Task 12: CI・開発コマンド・ドキュメント更新

**ファイル:**

- 変更: `package.json`（scripts セクション）
- 変更: `.github/workflows/ci.yml`（ビルドコマンド変更があれば）
- 変更: `CLAUDE.md`（アーキテクチャドキュメント）

- [ ] **Step 1: package.json の scripts を更新**

`dev:full` と `preview:e2e` コマンドを adapter-cloudflare に合わせて調整。

- [ ] **Step 2: CI ワークフローの確認・更新**

`pnpm build` の出力先が `build/` から変わる場合は CI の deploy コマンドを更新。adapter-cloudflare は `.svelte-kit/cloudflare/` に出力する場合があるため確認が必要。

- [ ] **Step 3: CLAUDE.md を更新**

以下のセクションを更新:

- **Tech Stack**: `Adapter: @sveltejs/adapter-cloudflare` に変更
- **Architecture > Directory Structure**: `src/server/` を追加、`functions/` を削除
- **Architecture > Path Aliases**: `$server` を追加
- **Pages Functions (API)** セクション: Hono ルーター構成に書き換え
- **Commands**: `dev:full` の説明を更新

- [ ] **Step 4: 全検証**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

期待: 全パス

- [ ] **Step 5: コミット**

```bash
git add package.json .github/workflows/ci.yml CLAUDE.md
git commit -m "docs: update architecture docs and CI for Hono migration"
```

---

## Task 13: E2E テスト検証

**ファイル:**

- 変更なし（API パスは同一のため）

- [ ] **Step 1: E2E テスト実行**

```bash
pnpm test:e2e
```

期待: 全テストパス。API の URL パスは `/api/podcast/resolve` 等で変更なし。

- [ ] **Step 2: 失敗がある場合は修正**

E2E テストの `preview:e2e` コマンドが adapter-cloudflare のビルド出力を正しく参照しているか確認。必要に応じて調整。

- [ ] **Step 3: コミット（修正があった場合のみ）**

```bash
git add -A
git commit -m "fix: adjust E2E tests for adapter-cloudflare"
```
