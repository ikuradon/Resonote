# External Content Reaction (kind:17) Design

Date: 2026-03-29
Issue: #207

## 概要

外部コンテンツ (Spotify, YouTube, Podcast 等) に対して直接リアクションできる機能を追加する。NIP-25 の kind:17 を実装し、コメント (kind:1111) へのリアクション (kind:7) とは独立した機能として動作する。

## NIP-25 仕様

kind:17 は Nostr ネイティブイベント以外のコンテンツへのリアクションに使う (MUST)。`e`/`p` タグは不要。NIP-73 の `i` タグ (小文字) + `k` タグ (小文字) で外部コンテンツを参照する。

## イベント構造

```json
{
  "kind": 17,
  "content": "+",
  "tags": [
    ["i", "spotify:track:abc123", "https://open.spotify.com/track/abc123"],
    ["k", "spotify:track"],
    ["r", "https://open.spotify.com/track/abc123"]
  ]
}
```

- `i` タグ: NIP-73 の外部コンテンツ ID + URL hint
- `k` タグ: コンテンツ種別 (`provider.contentKind(contentId)`)
- `r` タグ: コンテンツの外部 URL (`i` タグの hint と同値)。URL ベースのイベント検索を可能にする
- `content`: `"+"` 固定 (いいねのみ)

## UI

### 配置

CommentList のタブバー (Flow / Shout / Info) の右端にハートボタン + リアクション数を配置。

### インタラクション

- 未ログイン: ボタン非表示 (既存のコメントフォームと同じパターン)
- ログイン済み・未リアクション: 空ハート (&#9825;) + カウント表示
- ログイン済み・リアクション済み: 塗りハート (&#9829;、紫) + カウント表示。再クリックで kind:5 削除
- リアクション送信中: ボタン disabled

### カウント表示

- 0件: カウント非表示、空ハートのみ
- 1件以上: ハート + 数値

## データフロー

### 購読

`buildContentFilters` に kind:17 のフィルタを追加:

```ts
{ kinds: [CONTENT_REACTION_KIND], '#i': [idValue] }
```

小文字 `#i` でフィルタ。既存の kind:7 (`#I` 大文字) とは別フィルタ。

### 受信・処理

`comment-view-model.svelte.ts` の `onPacket` で kind:17 を判別:

```ts
case CONTENT_REACTION_KIND:
  handleContentReactionPacket(event);
  break;
```

### 状態管理

```ts
let contentReactions = $state<ContentReaction[]>([]);
let contentReactionStats = $derived(buildContentReactionStats(contentReactions, deletedIds));
```

`ContentReactionStats`:

- `likes: number` — 削除済みを除いたリアクション数
- `reactors: Set<string>` — リアクターの pubkey 集合
- `myReactionId: string | null` — 自分のリアクション ID (削除用)

### 送信

```ts
buildContentReaction(contentId, provider) → castSigned()
```

### 削除

既存の削除フィルタは `{ kinds: [5], '#I': [idValue] }` で大文字 `I` タグを使用。kind:17 は小文字 `i` タグなので、kind:17 の削除イベントはこのフィルタでは捕捉できない。

対応: kind:17 削除用に `buildDeletion` で生成する kind:5 イベントにも `I` タグ (大文字) を含める。これにより既存の削除フィルタで捕捉可能。`buildDeletion` は既に `I` タグを付与しているため、`sendContentReaction` の削除時に同じ `contentId`/`provider` を渡せば既存フィルタで取得できる。

自分のリアクション削除: `buildDeletion([myReactionId], contentId, provider, CONTENT_REACTION_KIND)` で kind:5 送信。

## 変更ファイル

### 新規関数

| ファイル                                               | 関数                         | 説明                                    |
| ------------------------------------------------------ | ---------------------------- | --------------------------------------- |
| `src/shared/nostr/events.ts`                           | `buildContentReaction()`     | kind:17 イベント構築 (`i`/`k`/`r` タグ) |
| `src/features/comments/application/comment-actions.ts` | `sendContentReaction()`      | kind:17 署名・送信                      |
| `src/features/comments/application/comment-actions.ts` | `deleteContentReaction()`    | kind:5 で kind:17 削除                  |
| `src/features/comments/domain/comment-mappers.ts`      | `contentReactionFromEvent()` | kind:17 → ContentReaction マッピング    |

### 新規型

| ファイル                                        | 型                     | 説明                                |
| ----------------------------------------------- | ---------------------- | ----------------------------------- |
| `src/features/comments/domain/comment-model.ts` | `ContentReaction`      | `{ id, pubkey, createdAt }`         |
| `src/features/comments/domain/comment-model.ts` | `ContentReactionStats` | `{ likes, reactors, myReactionId }` |

### 既存ファイル変更

| ファイル                                                    | 変更内容                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/shared/nostr/events.ts`                                | `CONTENT_REACTION_KIND = 17` 定数追加                                      |
| `src/features/comments/application/comment-subscription.ts` | `buildContentFilters` に kind:17 フィルタ追加                              |
| `src/features/comments/ui/comment-view-model.svelte.ts`     | kind:17 受信処理、`contentReactions` state、`contentReactionStats` derived |
| `src/lib/components/CommentList.svelte`                     | タブバー横にハートボタン UI 追加                                           |
| `CLAUDE.md`                                                 | kind:17 (content reaction) の記載追加                                      |

## テスト

### ユニットテスト

- `buildContentReaction`: タグ構造 (`i`/`k`/`r` タグ存在、`e`/`p` タグ不在)、kind:17
- `contentReactionFromEvent`: kind:17 イベント → ContentReaction マッピング
- `buildContentFilters`: kind:17 フィルタが含まれること
- `ContentReactionStats` 集計: likes カウント、deletedIds 除外、myReactionId 検出
- `sendContentReaction` / `deleteContentReaction`: castSigned 呼び出し確認

### E2E テスト

- コンテンツページでリアクションボタンが表示されること
- クリックで kind:17 イベントが publish されること
- リアクション済み状態で塗りハートが表示されること
