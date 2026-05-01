# Hono 移行: adapter-cloudflare + Hono + Cache API

## 概要

Cloudflare Pages Functions (`functions/` ディレクトリ) を SvelteKit プロジェクト内 (`src/server/`) に統合し、Hono ルーターで API を処理する。adapter-static から adapter-cloudflare に切り替え、Cache API でレスポンスキャッシュを追加する。

### ゴール

1. **コード統合**: `functions/` と `src/` のビルド分断を解消し、import を自由に
2. **型安全 API クライアント**: Hono RPC (`hc<AppType>()`) でフロントエンドから型付き API 呼び出し
3. **API 構造改善**: Zod バリデーション + グローバルエラーハンドラ + Cache API ミドルウェアで共通処理を集約
4. **重複解消**: `htmlToMarkdown` 等の重複コードを一本化

### 非ゴール

- SSR 有効化（`ssr = false` を維持、SPA のまま）
- API エンドポイントの追加・変更（既存 API のリファクタリングのみ）
- KV / D1 の導入（Cache API で十分）

## アーキテクチャ

### ディレクトリ構成

```
src/
├── server/                              ← 新規
│   ├── api/
│   │   ├── app.ts                       ← Hono アプリ + ルート集約 + AppType エクスポート
│   │   ├── middleware/
│   │   │   ├── cache.ts                 ← Cache API ミドルウェア
│   │   │   └── error-handler.ts         ← グローバルエラーハンドラ
│   │   ├── podcast.ts                   ← /api/podcast/resolve
│   │   ├── oembed.ts                    ← /api/oembed/resolve
│   │   ├── youtube.ts                   ← /api/youtube/feed
│   │   ├── podbean.ts                   ← /api/podbean/resolve
│   │   └── system.ts                    ← /api/system/pubkey
│   └── lib/
│       ├── safe-fetch.ts                ← safeFetch, assertSafeUrl（functions/lib/ から移動）
│       └── audio-metadata.ts            ← fetchAudioMetadata（functions/lib/ から移動）
├── shared/utils/html.ts                 ← htmlToMarkdown（唯一の定義、重複解消）
├── hooks.server.ts                      ← 新規: /api/* → Hono ディスパッチ
└── web/routes/                          ← 変更なし（ssr = false 維持）

functions/                               ← 削除
```

### パスエイリアス

- `$server` → `src/server`（サーバー専用コード用の新エイリアス）

### Hono アプリ (`src/server/api/app.ts`)

Hono アプリを定義し、サブルートを `.route()` で統合。`AppType` を export して型安全クライアントを実現する。

```typescript
import { Hono } from 'hono';
import { podcastRoute } from './podcast.js';
import { oembedRoute } from './oembed.js';
import { youtubeRoute } from './youtube.js';
import { podbeanRoute } from './podbean.js';
import { systemRoute } from './system.js';
import { errorHandler } from './middleware/error-handler.js';

type Bindings = {
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

### ルートハンドラ

各ルートファイルはサブ Hono アプリをエクスポートする。podcast の例:

```typescript
// src/server/api/podcast.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { cacheMiddleware } from './middleware/cache.js';
import { htmlToMarkdown } from '$shared/utils/html.js'; // 重複解消!
import { safeFetch } from '$server/lib/safe-fetch.js';

const podcastRoute = new Hono().get(
  '/resolve',
  cacheMiddleware({ ttl: 3600 }),
  zValidator('query', z.object({ url: z.string().url() })),
  async (c) => {
    const { url } = c.req.valid('query');
    // ... 既存ロジック、shared/ からインポート可能に
    return c.json(result);
  }
);

export { podcastRoute };
```

### エンドポイント別キャッシュ TTL

| エンドポイント         | TTL             | 理由                               |
| ---------------------- | --------------- | ---------------------------------- |
| `/api/podcast/resolve` | 3600s (1時間)   | RSS フィードの更新頻度は低い       |
| `/api/oembed/resolve`  | 86400s (24時間) | メタデータはほぼ変わらない         |
| `/api/youtube/feed`    | 900s (15分)     | YouTube フィードは比較的頻繁に更新 |
| `/api/podbean/resolve` | 86400s (24時間) | 埋め込み URL は安定                |
| `/api/system/pubkey`   | キャッシュなし  | 静的な値、外部 fetch なし          |

### Cache API ミドルウェア (`src/server/api/middleware/cache.ts`)

```
リクエスト → cacheMiddleware → cache.match()?
  → HIT:  キャッシュされたレスポンスを返却
  → MISS: ハンドラ実行 → レスポンス
           ├── 2xx: waitUntil(cache.put(request, response))
           └── 4xx/5xx: キャッシュしない
```

- キャッシュキー: 完全な URL（クエリパラメータ含む）
- 成功レスポンス (2xx) のみキャッシュ
- 設定可能な TTL で `Cache-Control` ヘッダーを設定
- `caches.default` を使用（無料、制限なし）
- PoP レベルキャッシュ（データセンター単位、ベストエフォート）

### グローバルエラーハンドラ (`src/server/api/middleware/error-handler.ts`)

```typescript
import { HTTPException } from 'hono/http-exception';

export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
}
```

現在の各ハンドラ内の try-catch ブロックを置き換える。

### hooks.server.ts

```typescript
import { app } from '$server/api/app.js';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/api/')) {
    return app.fetch(event.request, event.platform?.env, event.platform?.context);
  }
  return resolve(event);
};
```

### 型安全クライアント（フロントエンド）

```typescript
import { hc } from 'hono/client';
import type { AppType } from '$server/api/app.js';

export const apiClient = hc<AppType>(typeof window !== 'undefined' ? window.location.origin : '');
```

フロントエンドの呼び出し箇所を手動 `fetch()` から移行:

```typescript
// Before
const res = await fetch(`/api/oembed/resolve?platform=${p}&type=${t}&id=${id}`);
const data = await res.json();

// After
const res = await apiClient.oembed.resolve.$get({
  query: { platform: p, type: t, id }
});
const data = await res.json(); // 完全に型付き
```

## アダプター移行

### svelte.config.js の変更

```diff
- import adapter from '@sveltejs/adapter-static';
+ import adapter from '@sveltejs/adapter-cloudflare';

export default {
  kit: {
-   adapter: adapter({ fallback: 'index.html' }),
+   adapter: adapter(),
    alias: {
      $shared: 'src/shared',
      $features: 'src/features',
      $appcore: 'src/app',
      $extension: 'src/extension',
+     $server: 'src/server',
    },
  },
};
```

### SPA モードの維持

```typescript
// src/web/routes/+layout.ts — 変更なし
export const ssr = false;
export const prerender = false;
```

adapter-cloudflare + `ssr = false` = 全ページ CSR。静的アセットは Cloudflare の Assets binding で無料配信。

### wrangler.toml

ローカル開発 (`pnpm dev:full`) に必要な新規ファイル:

```toml
name = "resonote"
compatibility_date = "2026-03-28"

[vars]
# ローカルは .dev.vars、本番は wrangler pages secret で設定
```

## 重複解消

### htmlToMarkdown

- **削除**: `functions/api/podcast/resolve.ts` 119-150行目 (`htmlToMarkdown`, `decodeEntities`)
- **維持**: `src/shared/utils/html.ts`（既存の実装）
- **インポート**: `src/server/api/podcast.ts` から `$shared/utils/html.js` をインポート

L135-136 のコメントが解消される:

> `// Note: functions/ cannot import from src/shared/ (different build targets).`
> `// The same htmlToMarkdown logic is duplicated in src/shared/utils/html.ts for client use.`

## Zod バリデーションスキーマ

手動のクエリパラメータ検証を `@hono/zod-validator` に置き換え:

| エンドポイント    | スキーマ                                                     |
| ----------------- | ------------------------------------------------------------ |
| `podcast/resolve` | `{ url: z.string().url() }`                                  |
| `oembed/resolve`  | `{ platform: z.string(), type: z.string(), id: z.string() }` |
| `youtube/feed`    | `{ type: z.enum(['playlist', 'channel']), id: z.string() }`  |
| `podbean/resolve` | `{ url: z.string().url() }`                                  |
| `system/pubkey`   | なし                                                         |

バリデーションエラーは自動的に 400 と詳細メッセージを返す。

## 新規依存

| パッケージ                     | 用途                                    |
| ------------------------------ | --------------------------------------- |
| `hono`                         | API ルーター + RPC クライアント         |
| `@hono/zod-validator`          | クエリ/ボディバリデーションミドルウェア |
| `zod`                          | スキーマ定義                            |
| `@sveltejs/adapter-cloudflare` | adapter-static を置き換え               |

### 削除する依存

| パッケージ                 | 理由                          |
| -------------------------- | ----------------------------- |
| `@sveltejs/adapter-static` | adapter-cloudflare に置き換え |

`@sveltejs/adapter-auto`（現在 devDependencies にあるが未使用）も削除可能。

## テスト戦略

- **ユニットテスト**: `functions/api/*.test.ts` → `src/server/api/*.test.ts`、`functions/lib/*.test.ts` → `src/server/lib/*.test.ts` に移動
- **テスト手法**: Hono の `app.request()` でルートを直接テスト（現行の `onRequestGet` 直接呼び出しパターンと同等）
- **キャッシュミドルウェア**: モックした `caches.default` でテスト
- **E2E テスト**: 変更なし（API の URL パスは同一）
- **共通ユーティリティ**: `src/shared/utils/html.test.ts` は変更なし

## 移行影響範囲

### 削除するファイル

- `functions/` ディレクトリ全体

### 新規作成するファイル

- `src/server/api/app.ts`
- `src/server/api/middleware/cache.ts`
- `src/server/api/middleware/error-handler.ts`
- `src/server/api/podcast.ts`
- `src/server/api/oembed.ts`
- `src/server/api/youtube.ts`
- `src/server/api/podbean.ts`
- `src/server/api/system.ts`
- `src/server/lib/safe-fetch.ts`
- `src/server/lib/audio-metadata.ts`
- `src/hooks.server.ts`
- `wrangler.toml`

### 変更するファイル

- `svelte.config.js`（アダプター変更 + エイリアス追加）
- `package.json`（依存パッケージ）
- `src/shared/utils/html.ts`（変更なし、ただしサーバーからもインポートされるように）
- `/api/*` を呼び出しているフロントエンドファイル（`hc<AppType>()` に移行）
- `.github/workflows/ci.yml`（ビルドコマンド変更時）
- `CLAUDE.md`（アーキテクチャドキュメント更新）

### 開発コマンド

```bash
pnpm dev          # Vite 開発サーバー（API なし — 変更なし）
pnpm dev:full     # Vite + Cloudflare Pages Functions → wrangler pages dev
pnpm build        # adapter-cloudflare による SvelteKit ビルド
pnpm preview      # wrangler pages dev でローカルプレビュー
```

`dev:full` コマンドは adapter-cloudflare の wrangler 統合に合わせて調整が必要な可能性あり。
