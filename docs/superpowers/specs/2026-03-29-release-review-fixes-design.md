# Release Review Fixes Design

Date: 2026-03-29

## Overview

リリース前コードレビューで検出された HIGH/MEDIUM 8件の修正設計。
セキュリティ、NIP準拠、CLAUDE.md準拠、アーキテクチャ依存方向の改善。

## Scope

| ID  | 重大度 | 内容                                            | ファイル                                                                   |
| --- | ------ | ----------------------------------------------- | -------------------------------------------------------------------------- |
| H-2 | HIGH   | YouTube API キー URL 露出                       | `src/server/api/oembed.ts`                                                 |
| H-3 | HIGH   | HTTPException メッセージ漏洩                    | `src/server/api/middleware/error-handler.ts`                               |
| M-1 | MEDIUM | Audio toNostrTag で contentId.type 未使用       | `src/shared/content/audio.ts`                                              |
| M-3 | MEDIUM | SoundCloud API client URL 未検証                | `src/features/content-resolution/infra/soundcloud-api-client.ts`           |
| M-4 | MEDIUM | CSS セレクタ補間の安全性                        | `src/lib/components/CommentList.svelte`                                    |
| M-5 | MEDIUM | nip05.ts クライアント専用明示                   | `src/shared/nostr/nip05.ts`                                                |
| M-6 | MEDIUM | content-resolution → comments 直接依存          | `src/features/content-resolution/ui/resolved-content-view-model.svelte.ts` |
| M-7 | MEDIUM | lib-components 3ファイルが application 直接依存 | `SoundCloudEmbed`, `YouTubeFeedList`, `PodcastEpisodeList`                 |

## Design

### H-2: YouTube API キー URL 露出防止

YouTube Data API v3 は API キーをクエリパラメータでのみ受け付けるため、ヘッダー認証への切替は不可。

対策: ログ安全性の確保。catch ブロック内でエラーログにURLが混入しないことを確認。
現状の `safeFetch` はリダイレクト先の検証のみでURLロギングは行わない。
`error-handler.ts` (H-3) の修正と合わせて、サーバーサイドのエラーレスポンスから内部URLが漏洩しないことを保証する。

実質的なリスクは Cloudflare の request ログのみであり、これは Cloudflare ダッシュボードのログ設定で制御する運用対応とする。コード変更は H-3 のエラーハンドラ修正に包含される。

### H-3: エラーメッセージ漏洩修正

`error-handler.ts` を修正し、`HTTPException` のメッセージをそのまま返すのではなく、ステータスコード → 安全なメッセージのマッピングを使用する。

```typescript
const SAFE_MESSAGES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  429: 'Too Many Requests'
};
```

未知のステータスコードには `'Internal Server Error'` を返す。

### M-1: Audio toNostrTag の contentId.type 使用

`audio.ts` の `toNostrTag()`:

- 現状: `['audio:${decodedUrl}', decodedUrl]`
- 修正: `['audio:${contentId.type}:${decodedUrl}', decodedUrl]`

`contentKind()`:

- 現状: `'audio:track'` (ハードコード)
- 修正: `'audio:${contentId.type}'` (動的)

テスト (`audio.test.ts`) も合わせて更新。

### M-3: SoundCloud API client URL 検証

`resolveSoundCloudEmbed()` で `trackUrl` が `https://soundcloud.com/` プレフィックスを持つことを検証。
不正なURLの場合は早期に Error を throw。

### M-4: CSS セレクタ補間の安全化

`CommentList.svelte` の `document.querySelector()` で `CSS.escape()` を使用:

```typescript
const el = document.querySelector(`[data-comment-id="${CSS.escape(highlightCommentId)}"]`);
```

### M-5: nip05.ts クライアント専用明示

`verifyNip05` 関数の JSDoc に `@remarks Browser-only — uses browser fetch directly. Do not call from server-side code; use safeFetch for server contexts.` を追加。

### M-6: content-resolution → comments 依存を facade 経由に

`src/shared/browser/comments.ts` を新規作成し、CommentVM 生成関数の re-export facade とする:

```typescript
export { createCommentViewModel } from '$features/comments/ui/comment-view-model.svelte.js';
export type { CommentViewModel } from '$features/comments/ui/comment-view-model.svelte.js';
```

`resolved-content-view-model.svelte.ts` は `$shared/browser/comments.js` から import に変更。
ESLint disable コメントを削除。

### M-7: lib-components → features 依存解消

以下の3ファイルを `src/lib/components/` → `src/features/content-resolution/ui/` に移動:

- `SoundCloudEmbed.svelte`
- `YouTubeFeedList.svelte`
- `PodcastEpisodeList.svelte`

移動後:

1. 各ファイル内の import パスを調整（相対パスの変更）
2. これらを import している箇所を `$features/content-resolution/ui/` に更新
3. ESLint disable コメント (`no-restricted-imports`) を削除

## Testing

- 既存ユニットテストが全て pass すること
- `audio.test.ts` のタグ期待値を更新
- `error-handler` のテストがあれば更新、なければ追加
- `pnpm format:check && pnpm lint && pnpm check && pnpm test` が全て pass

## Out of Scope

- H-1 (レートリミッター分散化) — インフラ変更を伴うため別タスク
- C-1 (.dev.vars 認証情報) — 運用対応（ローテーション）
- kind:17 の `r` タグ削除 — NIP 独自拡張の判断は別途
