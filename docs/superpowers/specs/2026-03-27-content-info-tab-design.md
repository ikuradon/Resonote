# Content Info Tab Redesign + Share/Bookmark Migration

## Summary

Info タブをコンテンツメタデータ表示の中心地にし、共有・ブックマークボタンをタブバー右端に移動する。
全 embed 対応プラットフォームに oEmbed API を拡張し、タイトル・概要・サムネイルを表示する。

## Scope

### In Scope

- Info タブにコンテンツメタデータ（サムネイル + タイトル + 著者名 + 概要）を表示
- 共有ボタンをタブバー右端にアイコンボタンとして移動（クリックで共有モーダル）
- ブックマークボタンをタブバー右端に移動（クリックで確認ダイアログ）
- oEmbed API に Mixcloud / Spreaker / Podbean を追加
- Niconico 用に独自 API（getthumbinfo）対応を追加
- Podcast / Audio の既存メタデータを Info タブで表示
- PlayerColumn からの EpisodeDescription 表示を削除

### Out of Scope

- Netflix / Prime Video / Disney+ / U-NEXT / AbemaTV / TVer / Apple Music / Fountain.fm のメタデータ取得（公開API なし）
- oEmbed 以外のメタデータソース（スクレイピング等）

## Architecture

### Tab Bar Layout

```
[🎶 Flow (12)] [📢 Shout (5)] [ℹ️ Info]          [⭐] [↗]
```

- Flow / Shout / Info の3タブは既存のまま
- 右端に `⭐` ブックマーク + `↗` 共有アイコンボタン（`flex: spacer` で右寄せ）
- ブックマーク・共有はタブではなくボタン（クリックでモーダル/ダイアログ）

### Info Tab Content

```
┌─────────────────────────────────┐
│ [thumbnail]  Content Title      │
│   80x80      by Author Name    │
│              Description text   │
│              that can be multi  │
│              line and truncat...│
│              [Show more]        │
│                                 │
│  🔗 Open on {Platform}         │
└─────────────────────────────────┘
```

- サムネイル（左, 80x80）+ タイトル・著者・概要（右）のカード形式
- 概要は長文時に truncate + 「Show more」で展開（EpisodeDescription と同様のパターン）
- 外部リンクはカードの下に表示
- メタデータ未取得中はスケルトンローディング表示
- メタデータ取得不可の場合は「コンテンツ情報を取得できませんでした」+ 外部リンクのみ

### Bookmark Confirmation Dialog

- ブックマークアイコン押下で ConfirmDialog を表示
- 未追加時:「ブックマークに追加しますか？」→ 追加
- 追加済み時:「ブックマークから削除しますか？」→ 削除

### Share Button

- 共有アイコン押下で既存の ShareButton モーダルを表示
- モーダル内容は既存のまま（Copy timed link / Copy link / Post to Nostr）

## oEmbed API Extension

### Server-side: `functions/api/oembed/resolve.ts`

既存の Spotify / YouTube / SoundCloud / Vimeo に加え、以下を追加:

| Platform | Endpoint                                                  | Response Mapping                                     |
| -------- | --------------------------------------------------------- | ---------------------------------------------------- |
| Mixcloud | `https://www.mixcloud.com/oembed/?url={url}&format=json`  | title, author_name, thumbnail_url                    |
| Spreaker | `https://api.spreaker.com/oembed?url={url}&format=json`   | title, author_name, thumbnail_url                    |
| Podbean  | `https://api.podbean.com/v1/oembed?url={url}&format=json` | title, author_name, thumbnail_url                    |
| Niconico | `https://ext.nicovideo.jp/api/getthumbinfo/{id}`          | XML → JSON 変換: title, user_nickname, thumbnail_url |

レスポンス形式は既存と同一:

```typescript
{
  title: string | null;
  subtitle: string | null; // author_name
  thumbnailUrl: string | null;
  provider: string;
}
```

- Niconico は oEmbed ではなく独自 XML API だが、同じレスポンス形式に正規化
- 全リクエストは `safeFetch()` 経由（SSRF 防御）
- Cache-Control: `public, max-age=86400`（既存と同じ）

### Client-side: メタデータ取得

新規ファイル: `src/features/content-resolution/application/fetch-content-metadata.ts`

```typescript
interface ContentMetadata {
  title: string | null;
  subtitle: string | null;
  thumbnailUrl: string | null;
  description: string | null;
}

function fetchContentMetadata(contentId: ContentId): Promise<ContentMetadata | null>;
```

- Podcast / Audio: 既存の `EpisodeMetadata` から変換（oEmbed 呼び出し不要）
- その他の embed 対応プラットフォーム: `/api/oembed/resolve` を呼び出し
- oEmbed 非対応プラットフォーム（extension 必要系等）: null を返す

### Data Flow

```
PlayerColumn VM (fetch metadata)
  → +page.svelte (props)
    → CommentList (props)
      → CommentInfoTab (display)
```

PlayerColumn VM は既にコンテンツ解決を担当しているため、メタデータ取得もここに追加。
Podcast の `episodeDescription` は `ContentMetadata.description` として統合。

## Component Changes

### Modified Components

| Component               | Change                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `CommentTabBar.svelte`  | 共有・ブックマークアイコンボタンをタブバー右端に追加                                |
| `CommentInfoTab.svelte` | ブックマーク・共有ボタン削除。メタデータカード表示を追加                            |
| `CommentList.svelte`    | メタデータ props を受け取り CommentInfoTab に渡す。ブックマーク確認ダイアログを管理 |
| `PlayerColumn.svelte`   | EpisodeDescription の表示を削除                                                     |
| `+page.svelte`          | メタデータを CommentList に渡す props 追加                                          |

### New Files

| File                                                                    | Purpose                    |
| ----------------------------------------------------------------------- | -------------------------- |
| `src/features/content-resolution/application/fetch-content-metadata.ts` | メタデータ取得ユースケース |
| `src/features/content-resolution/domain/content-metadata.ts`            | ContentMetadata 型定義     |

### Deleted Components

| Component                   | Reason                                                                    |
| --------------------------- | ------------------------------------------------------------------------- |
| `EpisodeDescription.svelte` | Info タブに統合されるため不要（概要表示ロジックは CommentInfoTab に移動） |

## Testing

### Unit Tests

- `fetch-content-metadata.ts`: 各プラットフォームのメタデータ取得、Podcast/Audio からの変換、エラー時 null 返却
- `functions/api/oembed/resolve.ts`: Mixcloud / Spreaker / Podbean / Niconico の新規プラットフォーム対応
- CommentTabBar: 共有・ブックマークボタンの表示、クリックイベント発火
- CommentInfoTab: メタデータ表示、ローディング状態、エラー状態

### E2E Tests

- Info タブでコンテンツ情報（タイトル・概要）が表示される
- 共有ボタン（タブバー右端）クリックで共有モーダル表示
- ブックマークボタンクリックで確認ダイアログ表示
- PlayerColumn から Podcast 概要が消えている

## i18n

新規キー:

- `info.loading` — メタデータ取得中
- `info.error` — メタデータ取得失敗
- `info.show_more` — 概要展開
- `info.show_less` — 概要折りたたみ
- `bookmark.confirm.add.title` — ブックマーク追加確認タイトル
- `bookmark.confirm.add.message` — ブックマーク追加確認メッセージ
- `bookmark.confirm.remove.title` — ブックマーク削除確認タイトル
- `bookmark.confirm.remove.message` — ブックマーク削除確認メッセージ
- `share.button.label` — 共有ボタン aria-label
- `bookmark.button.label` — ブックマークボタン aria-label
