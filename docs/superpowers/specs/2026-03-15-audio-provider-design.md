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

### URL エンコード規約

- **Base64url**: RFC 4648 Section 5（`+` → `-`, `/` → `_`）、パディング `=` は除去
- **`d` タグ**: スキーム除去 + 小文字化 + 末尾スラッシュ除去 + クエリパラメータ除去（例: `https://Example.COM/Feed.xml?token=abc` → `example.com/feed.xml`）
- **`r` タグ / `i` タグ hint**: フル URL（`https://` 付き、正規化は `d` タグと同じルール適用後にスキームを再付加）

### AudioProvider (`src/lib/content/audio.ts`)

- `platform: 'audio'`
- `displayName: 'Audio'`
- `requiresExtension: false`
- `parseUrl()`: クエリパラメータ除去後の拡張子判定（`.mp3`, `.m4a`, `.ogg`, `.wav`, `.opus`, `.flac`, `.aac`）
- `type`: `'track'`
- `id`: 音声 URL を Base64url エンコード（パディングなし）
- `contentKind()`: guid 未解決時は `'audio'`、解決後は呼ばれない（PodcastProvider に委譲）
- `toNostrTag()`: `["audio:<decoded-full-url>", "<decoded-full-url>"]`（value 例: `audio:https://example.com/ep.mp3`。常にフォールバック形式。guid 解決後はコメントストアが PodcastProvider の `toNostrTag()` を使う）
- `embedUrl()`: デコードした音声 URL を返す
- `openUrl()`: デコードした音声 URL を返す

### PodcastProvider (`src/lib/content/podcast.ts`)

- `platform: 'podcast'`
- `displayName: 'Podcast'`
- `requiresExtension: false`
- `parseUrl()`: URL パス末尾で RSS/Atom/JSON フィード判定（`.rss`, `.xml`, `.atom`, `/feed` 等のパターンマッチ。同期処理のみ、HTTP リクエストは行わない）
- `type`:
  - フィード URL → `'feed'`
  - エピソード → `'episode'`
- `id`:
  - フィード: URL の Base64url エンコード（パディングなし）
  - エピソード: `<feedUrlBase64>:<guidBase64>` の複合キー
- `contentKind()`: `type === 'episode'` → `'podcast:item:guid'`。フィード（type: `'feed'`）はコメント対象外のため `contentKind()` は呼ばれない想定だが、安全のため `'podcast:feed'` を返す
- `toNostrTag()`: `["podcast:item:guid:<guid>", "<feed-url>"]`（hint はフィード URL。enclosure URL は ContentId から導出不可能なため、フィード URL を hint とする。他クライアントはフィードから enclosure を解決可能）
- `embedUrl()`: エピソードの enclosure URL を返す（フィードの場合は `null`）
- `openUrl()`: 元の Podcast サイト URL またはフィード URL

**注意**: `parseUrl()` はフィード URL のみマッチし、type: `'feed'` を返す。エピソードの ContentId（type: `'episode'`）は `parseUrl()` からは生成されず、エピソード一覧 UI でユーザーが選択した時に API レスポンスから構築される。

### フィード guid のフォールバック

RSS の `<podcast:guid>`（Podcast Index namespace）が存在しない場合、フィード URL の SHA-256 ハッシュ（先頭32文字の hex）をハイフン区切り（8-4-4-4-12）で synthetic guid として使用する。UUID 準拠は主張しない。

### `audio:<url>` 識別子について

`audio:<url>` は NIP-73 の標準定義外のカスタム拡張。guid 未解決時のフォールバック専用。他クライアントとの互換性は限定的だが、guid 解決後は標準の `podcast:item:guid:<guid>` に昇格するため影響は軽微。

## Nostr イベント設計

### NIP-B0 ブックマーク (kind:39701) — システム鍵で発行

kind:39701 内の `i` / `k` タグは NIP-73 に従い小文字。NIP-22 コメント (kind:1111) でルートスコープを参照する際は大文字 `I` / `K` を使用（NIP-22 の仕様通り）。

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
    ["I", "podcast:item:guid:abc-123-def", "https://example.com/feed.xml"],
    ["K", "podcast:item:guid"]
  ],
  "content": "コメント内容"
}
```

注: hint はフィード URL（toNostrTag() と同一）。

## コメント購読の2系統マージ

同じエピソードに対して `audio:<url>` と `podcast:item:guid:<guid>` の両方でコメントが存在しうる。

### guid 解決前後の状態遷移

AudioProvider の `parseUrl()` は同期的に ContentId を返す（`{audio, track, base64url}`）。guid 解決は非同期で行われるため、解決後に新しい ContentId（`{podcast, episode, feedBase64:guidBase64}`）を生成し、コメントストアに追加購読を指示する。

### コメントストアの拡張

`createCommentsStore()` に `addSubscription(idValue: string, kind: string)` メソッドを追加:

- 初期化時: `audio:<url>` で購読開始
- guid 解決後: `addSubscription('podcast:item:guid:<guid>', 'podcast:item:guid')` で追加購読
- 既存の `audio:<url>` 購読は維持したまま、両方のストリームを `uniq()` でマージ
- DB キャッシュは `I:${idValue}` のキーで個別に保存（既存と同じ）、表示時にマージ
- `addSubscription` 時にも追加タグの DB キャッシュリストアを実行
- `destroy()` 時に追加購読のサブスクリプションも含めて全解除
- 重複排除は既存の `commentIds` / `reactionIds` の Set（イベント ID ベース）をそのまま共有

### 投稿時のタグ選択

- guid 解決済み → `["I", "podcast:item:guid:<guid>", ...]` + `["K", "podcast:item:guid"]`
- guid 未解決 → `["I", "audio:<url>", ...]` + `["K", "audio"]`

## ユーザーフロー

### フロー1: 音声直 URL

1. URL 入力
2. クライアント: URL を正規化（スキーム除去）→ Nostr リレーに `d` タグ検索 & `parseUrl()` を並行実行
   - d タグ検索: `{"kinds":[39701],"authors":["<SYSTEM_PUBKEY>"],"#d":["<normalized-url>"]}`
   - `SYSTEM_PUBKEY` はクライアント側定数として保持
3. d タグヒット → kind:39701 のタグから以下を導出して遷移（API 呼び出し不要）:
   - guid: `i` タグの value から `podcast:item:guid:` プレフィックスを除去して取得
   - feed URL: `podcast:guid:` プレフィックスを持つ `i` タグの hint から取得
   - enclosure URL: `podcast:item:guid:` プレフィックスを持つ `i` タグの hint、または `r` タグの最初の値
   - 遷移先: `/podcast/episode/{feedUrlBase64}:{guidBase64}`
4. d タグミス → AudioProvider がマッチ → `/audio/track/{base64url}` に遷移
5. バックグラウンドで `/api/podcast/resolve` に URL 送信 → guid 解決
6. 成功 → Nostr タグを guid ベースに昇格、コメント購読追加
7. 失敗 → `audio:<url>` でフォールバック
8. カスタム `<audio>` プレイヤーで即再生可能、右側にコメント欄

### フロー2: RSS フィード URL

1. URL 入力
2. クライアント: `parseUrl()` で PodcastProvider がマッチ → `/podcast/feed/{base64url}` に遷移
   - d タグ検索はフィード URL に対しては不要（ヒットしてもエピソード一覧が得られないため）
3. `/api/podcast/resolve` にフィード URL 送信
4. API: RSS fetch → パース → 署名済み kind:39701 イベント + エピソード一覧をレスポンスに含めて返却
5. クライアント: 受け取った署名済みイベントを接続中のリレーに publish
6. エピソード一覧 UI 表示（タイトル、公開日、再生時間）
7. ユーザーがエピソード選択 → `/podcast/episode/{feedBase64}:{guidBase64}` に遷移
8. AudioEmbed で再生 + guid ベースコメント欄

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

Cloudflare Pages Functions で実装。ファイル配置: `functions/api/podcast/resolve.ts`（adapter-static と共存可能）。

**セキュリティ**:

- Rate limiting: Cloudflare の Rate Limiting ルールで IP ベースの制限（例: 10 req/min/IP）
- 冪等性: kind:39701 は parameterized replaceable event（NIP-33）なので、同じ `d` タグへの再発行は上書きとなり副作用なし
- CORS: 同一オリジン（Pages）からのリクエストのみ許可。拡張機能モードからのリクエストは `Access-Control-Allow-Origin` に拡張機能オリジンを追加

**処理フロー**:

1. URL バリデーション（許可スキーム: http/https のみ）
2. 入力タイプ判定:
   - 音声拡張子 → auto-discovery 試行 → RSS fetch → enclosure 照合 → guid 解決
   - フィード URL → RSS fetch → パース → フィード情報 + エピソード一覧返却（最新100件上限、長寿 Podcast 対応）
   - その他 → HTML fetch → `<link type="application/rss+xml">` 探索 → フィード URL 解決
3. 解決成功時: システム鍵で kind:39701 イベントに**署名**（フィード + エピソード）
4. 署名済みイベント JSON + メタデータをレスポンスに含めて返却
5. **クライアント側でリレーに publish**（API からリレーへの直接 WebSocket 接続は不要）

**署名済みイベントの publish 戦略**:

クライアントは受け取った署名済みイベントを接続中リレーに publish を試みる。失敗時（リレー未接続・書き込み拒否等）は IndexedDB に保持し、次回リレー接続確立時にリトライする。成功するまで繰り返す。

- 保存先: IndexedDB の専用ストア `pending-publishes`
- リトライタイミング: リレー接続確立時（`onconnect` イベント）
- 冪等性: kind:39701 は replaceable event なので重複 publish は上書きとなり安全
- TTL: 7日経過した未 publish イベントは破棄（フィード情報が古くなるため）

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
  },
  "signedEvents": [<署名済み kind:39701 イベント JSON>]
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
  ],
  "signedEvents": [<署名済み kind:39701 イベント JSON（フィードのみ。エピソードは選択時に個別署名を要求）>]
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

既存の `src/web/routes/[platform]/[type]/[id]/+page.svelte` パターンに乗せる:

| ルート | platform | type | id | 用途 |
|---|---|---|---|---|
| `/audio/track/{base64url}` | `audio` | `track` | Base64url | 音声直 URL 再生 + コメント |
| `/podcast/feed/{base64url}` | `podcast` | `feed` | Base64url | フィード → エピソード一覧 |
| `/podcast/episode/{feedBase64}:{guidBase64}` | `podcast` | `episode` | 複合キー | エピソード再生 + コメント |

`/resolve/` は既存 `[platform]/[type]/[id]` パターンに属さないため、**別ルートファイル**として追加:

- `src/web/routes/resolve/[id]/+page.svelte` — ResolveLoader.svelte を表示

**コンテンツページ (`+page.svelte`) の変更**:

描画の判定順序（platform/type を embedUrl より先に評価）:

1. `platform === 'podcast' && type === 'feed'` → `PodcastEpisodeList.svelte`（embedUrl は null だが、エピソード一覧を表示）
2. `platform === 'audio'` or `(platform === 'podcast' && type === 'episode')` → `AudioEmbed.svelte`
3. その他 → 既存ロジック（embedUrl ベースの判定）

### レジストリ登録順序

AudioProvider と PodcastProvider は**全プラットフォーム固有プロバイダーの後に**登録する。拡張子ベースのマッチング（AudioProvider）やパス末尾マッチング（PodcastProvider）が、より具体的な URL パターン（Spotify, SoundCloud 等）を誤ってマッチしないようにするため。

```typescript
const providers: ContentProvider[] = [
  spotify, youtube, vimeo, /* ...既存プロバイダー... */,
  podcast,  // フィード URL パターン
  audio,    // 最後: 拡張子フォールバック
];
```

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

- **ユニットテスト**:
  - AudioProvider / PodcastProvider の `parseUrl()`, `toNostrTag()`, `contentKind()`, URL エンコード/デコード
  - コメントストアの2系統マージ（`audio:<url>` と `podcast:item:guid:<guid>` 両方からのイベント重複排除）
  - フィード guid フォールバック（`<podcast:guid>` なしの場合の SHA-256 ベース生成）
- **API テスト**: RSS パース、auto-discovery、guid 照合ロジック、エピソード100件上限、enclosure なしエントリのスキップ、複数 enclosure 時の音声形式優先選択
- **E2E**: URL 入力 → エピソード一覧 → 選択 → 再生 → コメント投稿の一連フロー

## エッジケース

| ケース | 対応 |
|---|---|
| RSS エントリに `<enclosure>` がない | エピソード一覧からスキップ（テキスト記事等） |
| 複数 `<enclosure>` タグ | 音声形式を優先（MP3 > M4A > OGG > その他） |
| auto-discovery で複数 `<link type="application/rss+xml">` | 最初に見つかった RSS リンクを使用（将来: ユーザー選択 UI） |
| URL の正規化: 末尾スラッシュ、大文字小文字、クエリパラメータ | 「URL エンコード規約」セクションの `d` タグ正規化ルールに従う |

## 将来の拡張

- NIP-73 `podcast:item:guid` と Podcast Index API との連携
- OGP 機能（backlog #1）— Bluesky Cardyb (`cardyb.bsky.app/v1/extract`) が参考になる
- Podcast サイト URL の既知パターンマッチ（uncrop.jp 等）による auto-discovery 精度向上
- auto-discovery 時の複数 RSS リンク選択 UI
