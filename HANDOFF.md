# Handoff — Resonote

## Current State (v0.0.1)

プロジェクト初期化が完了。すべてのコアファイルが作成済みで、`pnpm run check` と `pnpm run build` がエラーなしで通る。

### What Works

- SvelteKit SPA + adapter-static ビルド
- Tailwind CSS v4 スタイリング
- Spotify URL パース (`open.spotify.com/track/xxx` + `spotify:track:xxx`)
- Spotify iFrame embed 表示
- Nostr ログイン/ログアウト (nostr-login モーダル)
- kind:1111 コメント購読 (backward + forward)
- kind:1111 コメント投稿 (NIP-07 署名)
- SPA ルーティング (`/track/[id]` への直接アクセス対応)

### What's NOT Implemented Yet

以下は設計上意図的にスコープ外としたもの:

| Feature                               | Notes                                        |
| ------------------------------------- | -------------------------------------------- |
| YouTube / Apple Music ContentProvider | `ContentProvider` interface に従って追加可能 |
| NIP-25 リアクション UI (kind:7)       | `buildReaction()` は実装済み、UI のみ未実装  |
| NIP-38 Now Playing (kind:30315)       | 未着手                                       |
| スレッド表示 (ネスト返信)             | kind:1111 の `e` tag チェーン                |
| リレー設定 UI                         | `DEFAULT_RELAYS` はハードコード              |
| プロフィール表示 (kind:0)             | pubkey の npub 短縮表示のみ                  |
| テスト (Vitest / Playwright)          | 未設定                                       |
| CI/CD / デプロイ                      | 未設定                                       |

## File Map

```
src/
├── types/global.d.ts                    # window.nostr 型宣言
├── lib/
│   ├── content/
│   │   ├── types.ts                     # ContentProvider interface, ContentId
│   │   └── spotify.ts                   # SpotifyProvider (parseUrl, toNostrTag, embedUrl)
│   ├── nostr/
│   │   ├── relays.ts                    # DEFAULT_RELAYS (4 relays)
│   │   ├── client.ts                    # getRxNostr() singleton
│   │   └── events.ts                    # buildComment(), buildReaction()
│   ├── utils/
│   │   └── observable.svelte.ts         # toState(): Observable → $state bridge
│   ├── stores/
│   │   ├── auth.svelte.ts               # initAuth(), loginNostr(), logoutNostr()
│   │   ├── comments.svelte.ts           # createCommentsStore()
│   │   └── player.svelte.ts             # getPlayer(), setContent(), setPlaying()
│   └── components/
│       ├── LoginButton.svelte           # Nostr login/logout button
│       ├── SpotifyEmbed.svelte          # Spotify iFrame embed
│       ├── CommentList.svelte           # Comment list with npub + timestamp
│       ├── CommentForm.svelte           # Comment input + send (requires login)
│       └── TrackInput.svelte            # Spotify URL input → navigate to /track/[id]
├── routes/
│   ├── +layout.svelte                   # Header (logo + LoginButton), auth init
│   ├── +layout.ts                       # ssr = false, prerender = false
│   ├── +page.svelte                     # Home: Spotify URL input
│   └── track/[id]/
│       └── +page.svelte                 # Embed + Comments + CommentForm
```

## How to Add a New ContentProvider

1. `src/lib/content/` に新しいファイルを作成 (e.g., `youtube.ts`)
2. `ContentProvider` interface を実装
3. `parseUrl()` でプラットフォーム URL をパース
4. `toNostrTag()` で NIP-73 `["I", ...]` タグを生成
5. ルートを追加 (e.g., `/video/[id]`)

## Known Issues

- `@konemono/nostr-login` のバンドルに eval が含まれており、ビルド時に警告が出る (upstream issue)
- `@sveltejs/adapter-auto` が devDependencies に残っている (未使用、削除可)
- `src/lib/index.ts` はテンプレート由来の空ファイル (削除可)

## Dev Environment

```bash
pnpm install
pnpm run dev        # → http://localhost:5173
pnpm run check      # type check
pnpm run build      # production build → build/
```
