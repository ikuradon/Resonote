# AudioProvider / PodcastProvider 設計仕様

## 概要

汎用音声/Podcast 再生機能。HTML5 `<audio>` 要素でプラットフォーム非依存の音声再生を提供し、NIP-73 + NIP-B0 を活用して Podcast エピソードの識別・親子関係・コメント紐付けを実現する。

## 入力方式

3つの入力経路をサポート:

1. **音声直 URL** — MP3/M4A/OGG/WAV/OPUS/FLAC/AAC の拡張子で判定
2. **RSS/JSON フィード URL** — `.rss`, `.xml`, `.atom`, `/feed` 等で判定 → エピソード一覧表示 → 選択して再生
3. **Podcast サイト URL** — HTML の `<link type="application/rss+xml">` で auto-discovery → フィード解決

## アーキテクチャ方針

入力方式別にプロバイダーを分離し、共通の再生レイヤーを共有する（アプローチ B）。

- **AudioProvider** — 音声直 URL の解析。既存 ContentProvider インターフェースをそのまま実装
- **PodcastProvider** — RSS フィード URL / エピソードの解析。同じく ContentProvider 実装
- **auto-discovery** — サイト URL は中間ページで非同期解決後、PodcastProvider にリダイレクト
- **AudioEmbed.svelte** — 共通の HTML5 `<audio>` カスタムプレイヤー UI

## プロバイダー設計

### AudioProvider (`src/lib/content/audio.ts`)

- `platform: 'audio'`
- `displayName: 'Audio'`
- `requiresExtension: false`
- `parseUrl()`: クエリパラメータ除去後の拡張子判定（`.mp3`, `.m4a`, `.ogg`, `.wav`, `.opus`, `.flac`, `.aac`）
- `type`: `'track'`
- `id`: 音声 URL を Base64url エンコード
- `toNostrTag()`: guid 解決済みなら `["podcast:item:guid:<guid>", "<enclosure-url>"]`、未解決なら `["audio:<url>", "<url>"]`
- `embedUrl()`: デコードした音声 URL を返す
- `openUrl()`: デコードした音声 URL を返す

### PodcastProvider (`src/lib/content/podcast.ts`)

- `platform: 'podcast'`
- `displayName: 'Podcast'`
- `requiresExtension: false`
- `parseUrl()`: Content-Type やパス末尾で RSS/Atom/JSON フィード判定
- `type`:
  - フィード URL → `'feed'`
  - エピソード → `'episode'`
- `id`:
  - フィード: URL の Base64url エンコード
  - エピソード: `<feedUrlBase64>:<guidBase64>` の複合キー
- `toNostrTag()`: `["podcast:item:guid:<guid>", "<enclosure-url>"]`
- `embedUrl()`: エピソードの enclosure URL を返す
- `openUrl()`: 元の Podcast サイト URL またはフィード URL

## Nostr イベント設計

### NIP-B0 ブックマーク (kind:39701) — システム鍵で発行

**フィード（番組）**:

```json
{
  "kind": 39701,
  "pubkey": "<system-pubkey>",
  "tags": [
    ["d", "example.com/feed.xml"],
    ["i", "podcast:guid:c90e609a-df1e-596a-bd5e-57bcc8aad6cc", "https://example.com/feed.xml"],
    ["k", "podcast:guid"],
    ["r", "https://example.com/feed.xml"],
    ["r", "https://example.com"],
    ["title", "My Podcast Show"],
    ["t", "podcast"]
  ],
  "content": ""
}
```

**エピソード**:

```json
{
  "kind": 39701,
  "pubkey": "<system-pubkey>",
  "tags": [
    ["d", "example.com/episodes/ep01.mp3"],
    ["i", "podcast:item:guid:abc-123-def", "https://example.com/episodes/ep01.mp3"],
    ["i", "podcast:guid:c90e609a-df1e-596a-bd5e-57bcc8aad6cc", "https://example.com/feed.xml"],
    ["k", "podcast:item:guid"],
    ["r", "https://example.com/episodes/ep01.mp3"],
    ["r", "https://example.com/feed.xml"],
    ["r", "https://example.com"],
    ["title", "Episode 01 - Introduction"],
    ["t", "podcast"]
  ],
  "content": ""
}
```

### `r` タグの粒度

3段階で配置し、リレーからの取得後はクライアント側でフィルタ:

1. enclosure URL（音声ファイル直 URL）
2. フィード URL
3. ドメインルート

### NIP-22 コメント (kind:1111) — ユーザーが投稿

```json
{
  "kind": 1111,
  "tags": [
    ["I", "podcast:item:guid:abc-123-def", "https://example.com/episodes/ep01.mp3"],
    ["K", "podcast:item:guid"]
  ],
  "content": "コメント内容"
}
```

## コメント購読の2系統マージ

同じエピソードに対して `audio:<url>` と `podcast:item:guid:<guid>` の両方でコメントが存在しうる。

- guid 解決前: `audio:<url>` の `I` タグでコメント購読開始（即座に表示可能）
- guid 解決後: `podcast:item:guid:<guid>` の `I` タグで追加購読
- 両方の結果を `uniq()` でマージして表示
- 投稿時は解決済みなら `podcast:item:guid:<guid>`、未解決なら `audio:<url>` を使用

`comments.svelte.ts` を複数タグでの並行購読 + マージに対応させる。

## ユーザーフロー

### フロー1: 音声直 URL

1. URL 入力
2. クライアント: URL を正規化（スキーム除去）→ Nostr リレーに `d` タグ検索 & `parseUrl()` を並行実行
3. d タグヒット → kind:39701 から guid + enclosure URL 取得 → API 呼び出し不要
4. d タグミス → AudioProvider がマッチ → `/audio/track/{base64url}` に遷移
5. バックグラウンドで `/api/podcast/resolve` に URL 送信 → guid 解決
6. 成功 → Nostr タグを guid ベースに昇格、コメント購読追加
7. 失敗 → `audio:<url>` でフォールバック
8. カスタム `<audio>` プレイヤーで即再生可能、右側にコメント欄

### フロー2: RSS フィード URL

1. URL 入力
2. クライアント: d タグ検索 & `parseUrl()` を並行実行
3. PodcastProvider がマッチ → `/podcast/feed/{base64url}` に遷移
4. `/api/podcast/resolve` にフィード URL 送信
5. API: RSS fetch → パース → フィード kind:39701 発行 → エピソード一覧返却
6. エピソード一覧 UI 表示（タイトル、公開日、再生時間）
7. ユーザーがエピソード選択 → `/podcast/episode/{feedBase64}:{guidBase64}` に遷移
8. エピソード kind:39701 発行 + AudioEmbed で再生 + guid ベースコメント欄

### フロー3: Podcast サイト URL

1. URL 入力
2. 既存プロバイダー・AudioProvider・PodcastProvider いずれも不一致
3. `/resolve/{base64url}` 中間ページに遷移（「解析中...」表示）
4. `/api/podcast/resolve` に URL 送信
5. API: HTML fetch → `<link type="application/rss+xml">` 探索
6. 成功 → `type: "redirect"` + フィード URL 返却 → フロー2 にリダイレクト
7. 失敗 → 「このURLからポッドキャストが見つかりませんでした」エラー表示

## データフロー図

```
ユーザー入力 (URL)
    │
    ▼
クライアント: URL 正規化（スキーム除去）
    │
    ├──────────────────────────────┐
    ▼                              ▼
Nostr d タグ検索                parseUrl() 判定
    │                              │
    ├─ ヒット → guid 即取得        ├─ 拡張子あり → AudioProvider
    │   API スキップ               ├─ フィードURL → PodcastProvider
    │                              └─ その他 → /resolve/ 中間ページ
    └─ ミス → API フローへ
                │
                ▼
      /api/podcast/resolve
                │
                ├─ 音声URL → auto-discovery → RSS → guid 解決
                ├─ フィードURL → RSS パース → エピソード一覧返却
                └─ サイトURL → HTML fetch → RSS 発見 → リダイレクト
                │
                ▼
      成功: kind:39701 発行 + レスポンス返却
      失敗: audio:<url> フォールバック
```

## コンポーネント設計

### AudioEmbed.svelte

カスタム `<audio>` プレイヤー UI。

- HTML5 `<audio>` 要素（非表示）+ Tailwind でカスタム UI
- 再生/一時停止ボタン、シークバー、経過時間/残り時間表示、音量スライダー
- 既存 embed と同じパターン:
  - `updatePlayback(position, duration, isPaused)` で player store 同期
  - `resonote:seek` カスタムイベント対応
  - `$effect` でコンテンツ切り替え時のクリーンアップ

### PodcastEpisodeList.svelte

フィードページ（`/podcast/feed/{id}`）で表示するエピソード一覧。

- タイトル、公開日、再生時間を一覧表示
- エピソード選択で `/podcast/episode/{feedBase64}:{guidBase64}` に遷移

### ResolveLoader.svelte

`/resolve/{base64url}` で表示する URL 解決中の中間 UI。

- 「解析中...」→ 成功でリダイレクト / 失敗でエラー表示

### podcast-resolver.ts

クライアント側の解決ロジック。

- d タグ検索（Nostr リレー）と API 呼び出しの調整
- cached-nostr SWR レイヤー活用

## API 設計

### `GET /api/podcast/resolve?url=<url>`

Cloudflare Pages Functions で実装。

**処理フロー**:

1. URL バリデーション（許可スキーム: http/https のみ）
2. 入力タイプ判定:
   - 音声拡張子 → auto-discovery 試行 → RSS fetch → enclosure 照合 → guid 解決
   - フィード URL → RSS fetch → パース → フィード情報 + 全エピソード返却
   - その他 → HTML fetch → `<link type="application/rss+xml">` 探索 → フィード URL 解決
3. 解決成功時: システム鍵で kind:39701 イベント発行（フィード + エピソード）
4. レスポンス返却

**レスポンス（エピソード解決時）**:

```json
{
  "type": "episode",
  "feed": {
    "guid": "c90e609a-...",
    "title": "My Podcast Show",
    "feedUrl": "https://example.com/feed.xml",
    "image": "https://example.com/artwork.jpg"
  },
  "episode": {
    "guid": "abc-123-def",
    "title": "Episode 01",
    "enclosureUrl": "https://example.com/episodes/ep01.mp3",
    "duration": 3600,
    "publishedAt": 1710000000
  }
}
```

**レスポンス（フィード解決時）**:

```json
{
  "type": "feed",
  "feed": {
    "guid": "c90e609a-...",
    "title": "My Podcast Show",
    "feedUrl": "https://example.com/feed.xml",
    "image": "https://example.com/artwork.jpg"
  },
  "episodes": [
    {
      "guid": "abc-123-def",
      "title": "Episode 01",
      "enclosureUrl": "https://example.com/episodes/ep01.mp3",
      "duration": 3600,
      "publishedAt": 1710000000
    }
  ]
}
```

**レスポンス（サイト URL → フィード発見時）**:

```json
{
  "type": "redirect",
  "feedUrl": "https://example.com/feed.xml"
}
```

**エラー**:

```json
{
  "error": "rss_not_found" | "invalid_url" | "fetch_failed"
}
```

**システム鍵管理**: Pages Functions の環境変数 `SYSTEM_NOSTR_PRIVKEY` に nsec 格納。

## ルーティング

| ルート | 用途 |
|---|---|
| `/audio/track/{base64url}` | 音声直 URL 再生 + コメント |
| `/podcast/feed/{base64url}` | フィード → エピソード一覧 |
| `/podcast/episode/{feedBase64}:{guidBase64}` | エピソード再生 + コメント |
| `/resolve/{base64url}` | サイト URL → auto-discovery 中間ページ |

**コンテンツページ (`+page.svelte`) の変更**:

- `platform === 'audio'` → `AudioEmbed.svelte` を表示
- `platform === 'podcast' && type === 'feed'` → `PodcastEpisodeList.svelte` を表示
- `platform === 'podcast' && type === 'episode'` → `AudioEmbed.svelte` を表示

## エラーハンドリング

| シナリオ | 挙動 |
|---|---|
| 音声 URL が 404 / 再生不可 | AudioEmbed にエラー表示、コメント欄は表示継続 |
| RSS fetch 失敗（CORS + API 両方） | 「フィードを取得できませんでした」エラー表示 |
| RSS パース失敗（不正 XML 等） | 「フィード形式を認識できませんでした」エラー表示 |
| auto-discovery で RSS 未発見 | 「このURLからポッドキャストが見つかりませんでした」エラー表示 |
| guid 解決失敗（直 URL 入力時） | `audio:<url>` でフォールバック、再生は正常動作 |
| API サーバーエラー | クライアント側で `audio:<url>` フォールバック、再生は正常動作 |
| Nostr リレー d タグ検索タイムアウト | API フォールバックに切り替え |

基本方針: **再生とコメントは常に動作させる**。guid 解決は best-effort。

## テスト方針

- **ユニットテスト**: AudioProvider / PodcastProvider の `parseUrl()`, `toNostrTag()`, URL エンコード/デコード
- **API テスト**: RSS パース、auto-discovery、guid 照合ロジック
- **E2E**: URL 入力 → エピソード一覧 → 選択 → 再生 → コメント投稿の一連フロー

## 将来の拡張

- NIP-73 `podcast:item:guid` と Podcast Index API との連携
- OGP 機能（backlog #1）— Bluesky Cardyb (`cardyb.bsky.app/v1/extract`) が参考になる
- Podcast サイト URL の既知パターンマッチ（uncrop.jp 等）による auto-discovery 精度向上
