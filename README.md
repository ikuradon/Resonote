# Resonote

Nostr プロトコルを使ったメディアコメント同期システム。動画・音楽の再生位置にコメントを紐づけて共有。

NIP-73 (External Content IDs) + NIP-22 (Comments, kind:1111) + NIP-25 (Reactions, kind:7) を活用。

## 特徴

- **再生位置同期コメント** — 再生中のメディアの位置を取得し、コメントにタイムスタンプを紐づけ
- **全体コメント** — 再生位置に依存しない感想・レビューも投稿可能
- **返信スレッド** — コメントへの返信 (NIP-10 スタイルの `e` タグ参照)、親の再生位置を継承、孤児リプライのプレースホルダー表示
- **リアクション** — コメントへのリアクション (NIP-25 kind:7)、カスタム絵文字対応
- **投稿削除** — 自分のコメント・リアクションを削除 (NIP-09 kind:5)
- **フォロー & Web of Trust** — NIP-02 フォローリストによるコメントフィルタリング (all / follows / WoT)
- **リレー管理** — kind:10002 リレーリスト + kind:3 フォールバック + 設定 UI
- **通知フィード** — 返信・リアクション・メンション・フォロー通知 + WoT フィルタ
- **ブックマーク** — kind:10003 + NIP-73 i タグ拡張
- **ミュートリスト** — kind:10000 (NIP-44 暗号化)
- **プロフィールページ** — NIP-05 検証、フォロー一覧展開
- **共有モーダル** — 時間付きリンクコピー + Nostr 投稿
- **PWA** — Service Worker + manifest.webmanifest
- **i18n** — 日本語 / 英語 (LanguageSwitcher ドロップダウン)
- **ブラウザ拡張機能** — Chrome / Firefox 拡張 (Manifest V3) でサイドパネルからコメント

## 対応プラットフォーム

| プラットフォーム | Web 埋め込み | 拡張機能が必要 |
| ---------------- | ------------ | -------------- |
| Spotify          | ✅           |                |
| YouTube          | ✅           |                |
| Vimeo            | ✅           |                |
| SoundCloud       | ✅           |                |
| Mixcloud         | ✅           |                |
| Spreaker         | ✅           |                |
| ニコニコ動画     | ✅           |                |
| Podbean          | ✅           |                |
| 音声直 URL       | ✅           |                |
| Podcast (RSS)    | ✅           |                |
| Netflix          |              | ✅             |
| Prime Video      |              | ✅             |
| Disney+          |              | ✅             |
| Apple Music      |              | ✅             |
| Fountain.fm      |              | ✅             |
| AbemaTV          |              | ✅             |
| TVer             |              | ✅             |
| U-NEXT           |              | ✅             |

## 対応 NIP

| NIP    | 用途                                        |
| ------ | ------------------------------------------- |
| NIP-02 | フォローリスト (kind:3)                     |
| NIP-05 | NIP-05 検証 (プロフィール表示)              |
| NIP-07 | ブラウザ拡張署名 (`window.nostr`)           |
| NIP-09 | イベント削除 (kind:5)                       |
| NIP-10 | 返信スレッド (`e` タグ)                     |
| NIP-19 | npub/nprofile/nevent/note ルーティング      |
| NIP-22 | コメント (kind:1111)                        |
| NIP-25 | リアクション (kind:7)                       |
| NIP-44 | ミュートリスト暗号化                        |
| NIP-65 | リレーリストメタデータ (kind:10002)         |
| NIP-73 | 外部コンテンツ ID (`i` タグ)                |
| NIP-B0 | Web ブックマーク (kind:39701, Podcast 解決) |

## 前提条件

- Node.js >= 24.0.0 (Corepack 同梱)
- pnpm (`corepack enable` で有効化、バージョンは `packageManager` フィールドで自動管理)

```bash
corepack enable
```

## セットアップ

```bash
pnpm install
pnpm run dev
```

Pages Functions (API) を使う場合:

```bash
# .dev.vars に SYSTEM_NOSTR_PRIVKEY を設定
pnpm run dev:full
```

## コマンド

| コマンド                     | 説明                                       |
| ---------------------------- | ------------------------------------------ |
| `pnpm run dev`               | 開発サーバー起動 (http://localhost:5173)   |
| `pnpm run dev:full`          | Vite + Cloudflare Pages Functions          |
| `pnpm run build`             | プロダクションビルド → `build/`            |
| `pnpm run preview`           | ビルド結果のプレビュー                     |
| `pnpm run check`             | svelte-kit sync + 型チェック               |
| `pnpm test`                  | 単体テスト実行                             |
| `pnpm test:coverage`         | カバレッジ付きテスト                       |
| `pnpm test:e2e`              | Playwright E2E テスト                      |
| `pnpm run lint`              | ESLint                                     |
| `pnpm run format`            | Prettier フォーマット                      |
| `pnpm run build:ext:chrome`  | Chrome 拡張機能ビルド → `dist-extension/`  |
| `pnpm run build:ext:firefox` | Firefox 拡張機能ビルド → `dist-extension/` |

## 技術スタック

- **フレームワーク**: SvelteKit (SPA モード, Svelte 5 runes)
- **アダプタ**: @sveltejs/adapter-static (`fallback: 'index.html'`)
- **スタイリング**: Tailwind CSS v4 (`@tailwindcss/vite` plugin)
- **Nostr クライアント**: rx-nostr + @rx-nostr/crypto
- **認証**: @konemono/nostr-login (`init()` + `nlAuth` DOM event)
- **NIP ユーティリティ**: nostr-tools (nip19 subpath)
- **テスト**: Vitest (単体) + Playwright (E2E)
- **CI**: GitHub Actions (format → lint → check → test → E2E → build-extension)
- **ホスティング**: Cloudflare Pages
- **API**: Cloudflare Pages Functions (`functions/` dir)

## アーキテクチャ

### ディレクトリ構成

- `src/app/` — app shell / bootstrap
- `src/lib/` — presentational component と component-local helper のみ (`src/lib/components/` のみ残存)
- `src/shared/` — 公開 runtime boundary (browser / nostr / content / i18n / utils)
- `src/features/` — feature slice (domain / application / infra / ui) — comments, content-resolution, notifications, profiles, bookmarks, follows, relays, mute, sharing, auth, playback, extension-bridge, nip19-resolver
- `src/web/` — SvelteKit エントリーポイント (routes, app.html, app.css)
- `src/extension/` — ブラウザ拡張機能 (Chrome/Firefox Manifest V3)
- `functions/` — Cloudflare Pages Functions (API エンドポイント)

### runtime ownership の基準

- `src/shared/*` は cross-feature な公開 runtime API
- `src/features/*` は業務ロジック、アプリケーション処理、view-model
- `src/app/*` は shell / bootstrap
- `src/web/routes/*` は thin facade
- `src/lib/*` は presentation / component-local helper のみ

新しい business logic や infra ownership は `src/lib/*` に追加しない。
route / component / feature / app は direct store import を避け、`$shared/browser/*` と `$shared/i18n/*` の公開面を使う。`src/lib/stores/` は削除済み。

### 新機能の配置ガイド

- cross-feature な browser / nostr / content / utility は `src/shared/*`
- feature 固有の domain / application / view-model は `src/features/<feature>/*`
- app shell / bootstrap / session は `src/app/*`
- route は `src/web/routes/*` で facade に保つ
- component-local な描画補助だけを `src/lib/components/*.ts` / `*.svelte.ts` に置く

### 構造チェック

最低限、次を通す。

```bash
pnpm check
pnpm lint
pnpm test
pnpm check:structure
pnpm graph:imports:summary
pnpm perf:bundle:summary
rg -n '\$lib/stores/.*svelte|../stores/.*svelte' src --glob '!**/*.test.*'
rg -n '\$lib/i18n/(t|locales)\.js|\.\./i18n/(t|locales)\.js' src --glob '!**/*.test.*'
```

設計方針は `CLAUDE.md` の Architecture セクションを正とする。

### PR / CI 運用

- PR では `.github/PULL_REQUEST_TEMPLATE.md` に沿って、配置判断と構造チェックを残す
- `ci.yml` は import graph artifact と bundle profile artifact を出す
- 構造変更時は `pnpm graph:imports:summary`、UI / bundle 影響がある変更では `pnpm perf:bundle:summary` を確認する

### 性能確認

- `pnpm perf:bundle:summary` で build 後の raw / gzip サイズを確認する
- `pnpm perf:bundle` で詳細一覧を出せる
- CI の `bundle-profile` artifact に、最新 build の bundle summary と file list が残る

### Playbook (dev only)

`/playbook` はコンポーネントの実験場・デモページ。`import.meta.env.DEV` でガードされており、開発サーバー (`pnpm dev`) でのみアクセス可能。staging / production ビルドでは 404 になる。

### ContentProvider パターン

`src/shared/content/types.ts` で `ContentProvider` インターフェースを定義。
各プラットフォームがこのインターフェースを実装し、`requiresExtension` フラグで Web / 拡張機能の区別を制御。
`toNostrTag()` で NIP-73 `i` タグを生成。i タグ形式は `platform:type:id` で統一。

### 再生位置同期

1. 各プラットフォームの Widget API / IFrame API で再生位置を取得
2. コメント投稿時に `["position", "秒数"]` タグを付与
3. コメント表示時に再生位置 ±30秒 のコメントを絞り込み、±5秒 以内をハイライト
4. タイムスタンプクリックでその位置にシーク

### Podcast / Audio 解決

- NIP-B0 (kind:39701) ブックマークで URL→guid マッピング
- フィード解決時に全エピソードの署名済みブックマークを生成
- 音声直 URL: IndexedDB → Nostr d タグ検索 → API auto-discovery の 3 段フォールバック
- guid 解決時: SvelteKit `replaceState` (`$app/navigation`) で URL 書き換え + コメントマージ

### ブラウザ拡張機能

`src/extension/` に Chrome / Firefox 対応の Manifest V3 拡張機能を実装。
コンテンツスクリプトが各動画・音楽サイトの再生位置を取得し、サイドパネル内の Resonote アプリと postMessage で連携。

## ライセンス

MIT
