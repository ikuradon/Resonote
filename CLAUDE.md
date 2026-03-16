# Resonote

Nostr プロトコルを使ったメディアコメント同期システム。
NIP-73 (External Content IDs) + NIP-22 (Comments, kind:1111) + NIP-25 (Reactions, kind:7) を活用。

## Commands

```bash
pnpm run dev          # dev server (http://localhost:5173)
pnpm run dev:full     # Vite + Cloudflare Pages Functions (.dev.vars 読み込み)
pnpm run build        # production build → build/
pnpm run preview      # preview production build
pnpm run check        # svelte-kit sync + svelte-check
pnpm run lint         # ESLint
pnpm run format:check # Prettier format check
pnpm run format       # Prettier auto-format
pnpm run test         # unit tests (vitest)
pnpm run test:coverage # unit tests with coverage
pnpm run test:e2e     # E2E tests (Playwright)
pnpm run lint:fix     # ESLint auto-fix
pnpm run build:ext:chrome  # build extension for Chrome → dist-extension/
pnpm run build:ext:firefox # build extension for Firefox → dist-extension/
```

## Pre-commit Validation

**MUST** run all five checks before every commit/amend:

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e
```

This matches the CI pipeline order. Do not skip any step:

- `pnpm lint` — `pnpm check` (svelte-check) only covers types, not ESLint rules like `no-unused-vars`, `no-undef`, or `svelte/require-each-key`
- `pnpm test:e2e` — E2E tests catch UI/navigation regressions that unit tests miss (e.g., resolve fallback breaking "Unsupported URL" expectations)

## Tech Stack

- **Framework**: SvelteKit (SPA mode, Svelte 5 runes)
- **Adapter**: @sveltejs/adapter-static (`fallback: 'index.html'`)
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite` plugin)
- **Nostr**: rx-nostr + @rx-nostr/crypto (verifier/signer)
- **Auth**: @konemono/nostr-login (`init()` + `nlAuth` DOM event)
- **NIP utils**: nostr-tools (nip19 subpath only)
- **Package manager**: pnpm
- **Pages Functions**: Cloudflare Pages Functions (`functions/` dir, adapter-static と共存)

## Code Style

- Indent: 2 spaces
- Single quotes in TS/JS unless interpolating
- `const` over `let`, no `var`
- Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`)
- File extensions in imports: `.js` (even for `.ts` files, per SvelteKit convention)
- `.svelte.ts` suffix for files using Svelte runes outside components

## Architecture

### Directory Structure

- `src/lib/` — Shared code ($lib alias): ContentProviders, Nostr layer, stores, components
- `src/web/` — SvelteKit entry points (routes, app.html, app.css)
- `src/extension/` — Browser extension (Chrome/Firefox Manifest V3)
- `functions/` — Cloudflare Pages Functions (API endpoints)

### ContentProvider Pattern

`src/lib/content/types.ts` defines `ContentProvider` interface and `ContentId` type.
Each platform implements this interface. Extension-only providers set `requiresExtension: true`.
Nostr tags are generated via `toNostrTag()` returning NIP-73 tags. i タグ形式は `platform:type:id` で統一。
Supported: Spotify, YouTube, Vimeo, SoundCloud, Mixcloud, Spreaker, Niconico, Podbean, Audio (直URL), Podcast (RSS), Netflix, Prime Video, Disney+, Apple Music, Fountain.fm, AbemaTV, TVer, U-NEXT
Web embed 対応: Spotify, YouTube, Vimeo, SoundCloud, Mixcloud, Spreaker, Niconico, Podbean, Audio

### Embed Component Pattern

各 embed コンポーネントの共通パターン:

- Props: `contentId: ContentId`, `openUrl?: string`
- `updatePlayback(positionMs, durationMs, isPaused)` で player store 同期
- `resonote:seek` イベント (`detail.positionMs`) でシーク受信
- `setContent(contentId)` で現在再生中コンテンツを登録
- ブランドローディング画面 (アイコン + シマーバー)
- ローディングタイムアウト (15-20秒) → エラー + ソースリンク
- SoundCloud/Podbean: oEmbed API で embed URL 解決 (CORS プロキシ経由)
- Spreaker: widgets.js を毎回 remove+re-add (SPA 再ナビゲーション対応)

### Pages Functions (API)

- `functions/api/podcast/resolve.ts`: RSS パース + NIP-B0 ブックマーク署名 + 音声メタデータ解析
- `functions/api/podbean/resolve.ts`: Podbean oEmbed プロキシ
- `functions/api/system/pubkey.ts`: システム鍵の pubkey 公開
- `functions/lib/audio-metadata.ts`: ID3v2/Vorbis/FLAC メタデータパーサー
- 環境変数: `SYSTEM_NOSTR_PRIVKEY` (hex) — `.dev.vars` (ローカル) / `wrangler pages secret` (本番)

### Nostr Layer

- `src/lib/nostr/client.ts`: Singleton `getRxNostr()` with `@rx-nostr/crypto` verifier
- `src/lib/nostr/events.ts`: Event builders for kind:1111 (comment) and kind:7 (reaction)
- `src/lib/nostr/event-db.ts`: IndexedDB-based event cache (`idb` wrapper)
- `src/lib/nostr/relays.ts`: Default relay list
- `src/lib/nostr/user-relays.ts`: Per-user relay discovery
- `src/lib/nostr/publish-signed.ts`: Pre-signed event publish via `nostr-tools/relay` + pending queue
- Signing: `nip07Signer()` from rx-nostr (delegates to `window.nostr`)

### Podcast/Audio Resolution Flow

- NIP-B0 (kind:39701) ブックマークで URL→guid マッピング
- フィード解決時に全エピソードの署名済みブックマークを生成
- クライアントが `nostr-tools/relay` の `Relay.publish()` で publish (rx-nostr の send() は不可)
- 音声直 URL: IndexedDB → Nostr d タグ検索 → API auto-discovery の3段フォールバック
- guid 解決時: `history.replaceState` で URL 書き換え + `addSubscription` でコメントマージ

### Subscription Pattern

Comments use rx-nostr's dual-request pattern:

- **Backward**: Fetch past events, call `over()` on completion
- **Forward**: Real-time subscription for new events
- Merged with `uniq()` + `timeline()` operators
- `addSubscription()` で追加タグの並行購読をマージ可能

### State Management

Svelte 5 `$state` runes in `src/lib/stores/*.svelte.ts` (no Svelte stores):

- `auth.svelte.ts`: Login state via nostr-login `nlAuth` events
- `comments.svelte.ts`: Per-content comment subscription + `addSubscription` for dual-tag merge
- `player.svelte.ts`: Playback state + `resetPlayer()` on navigation
- `profile.svelte.ts`: User profile (kind:0) cache
- `follows.svelte.ts`: Follow list (kind:3) state
- `relays.svelte.ts`: Relay connection status
- `emoji-sets.svelte.ts`: Custom emoji set management
- `extension.svelte.ts`: Browser extension mode state + postMessage listener

## Deployment

- **Hosting**: Cloudflare Pages (wrangler CLI)
- **CI**: GitHub Actions (`ci.yml`) — lint-and-check + audit + test + e2e + build-extension (parallel) → deploy
- **Deploy trigger**: Push to `main` → staging, `v*` tag → production

## Key Decisions

- SPA mode (`ssr = false`, `prerender = false`) — Nostr requires client-side WebSocket
- `fallback: 'index.html'` enables client-side routing for direct URL access
- `kit.files.routes = 'src/web/routes'`, `kit.files.appTemplate = 'src/web/app.html'` — Web/Extension directory separation
- `noBanner: true` in nostr-login init — manual login UI via `launch()`
- rx-nostr verifier is mandatory; using `@rx-nostr/crypto`'s `verifier`
- `resonote:seek` イベントの detail キーは `positionMs` (ミリ秒) に統一
- ページ遷移時に `resetPlayer()` で再生状態をクリア
- `import.meta.env.DEV` で開発時のみ表示する UI (DEV シークパネル等)
- `.wrangler/` を ESLint ignore に追加 (ビルドキャッシュが lint エラーになるため)

## Gotchas

- `pnpm dev` では Pages Functions が動かない。API 必要時は `pnpm dev:full`
- Spreaker `widgets.js` は SPA 再ナビゲーション時に再走査しない → script remove+re-add が必要
- SoundCloud embed は permalink URL を受け付けない → oEmbed API で api.soundcloud.com URL に解決
- Podbean `PB.Widget.Events.READY` は文字列リテラル (プロパティアクセスではない)
- Podbean `seekTo()` は実際は秒単位 (ドキュメントはミリ秒と記載)
- Podbean `getDuration()` は再生前に NaN を返す → PLAY イベント後に取得
- rx-nostr `firstValueFrom` は EOSE で空ストリームになると失敗 → 手動 subscribe + timeout
- `@noble/hashes` は pnpm でホイストされない → `nostr-tools/utils` 経由で `hexToBytes` を使用
- Svelte 5 の `$effect` 内で `store` を読むと依存追跡される → `untrack()` で回避
- pre-signed イベントの publish に `rxNostr.send()` は使えない（ユーザー鍵で再署名される）→ `nostr-tools/relay` の `Relay.publish()` を使用
