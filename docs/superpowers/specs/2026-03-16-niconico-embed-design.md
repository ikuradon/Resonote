# ニコニコ動画 Web 埋め込み 設計仕様

## 概要

ニコニコ動画の Web 埋め込み再生対応。postMessage ベースの非公式 API で再生同期。sm/so プレフィックスの動画と nico.ms 短縮 URL に対応。

## プロバイダー設計

### NiconicoProvider (`src/lib/content/niconico.ts`)

- `platform: 'niconico'`
- `displayName: 'ニコニコ動画'`
- `requiresExtension: false`
- `parseUrl()`: 以下の URL パターンをマッチ
  - `https://www.nicovideo.jp/watch/(sm|so)\d+`
  - `https://nico.ms/(sm|so)\d+`
  - `https://embed.nicovideo.jp/watch/(sm|so)\d+`
  - `sp.nicovideo.jp` (モバイル版) も対応
  - `nm` プレフィックスは除外（埋め込み非対応）
- `type`: `'video'`
- `id`: 動画 ID（例: `sm9`, `so38016254`）
- `toNostrTag()`: `['niconico:video:<id>', 'https://www.nicovideo.jp/watch/<id>']`
- `contentKind()`: `'niconico:video'`
- `embedUrl()`: `'https://embed.nicovideo.jp/watch/<id>?jsapi=1&playerId=1'`
- `openUrl()`: `'https://www.nicovideo.jp/watch/<id>'`

### NIP-73 タグ

カスタム拡張。他プロバイダーと同じ `platform:type:id` 形式。

```json
["I", "niconico:video:sm9", "https://www.nicovideo.jp/watch/sm9"]
["K", "niconico:video"]
```

## 埋め込みコンポーネント設計

### NiconicoEmbed.svelte

postMessage ベースの再生同期。iframe に `?jsapi=1&playerId=1` を付与。

#### 通信プロトコル

**受信イベント** (`window.addEventListener('message', ...)`, origin チェック: `https://embed.nicovideo.jp`):

| イベント | データ | 用途 |
|---|---|---|
| `loadComplete` | 動画基本情報 | `setContent(contentId)` 呼び出し |
| `playerMetadataChange` | `{ currentTime, duration, muted, volume }` | `updatePlayback(currentTime * 1000, duration * 1000, isPaused)` |
| `playerStatusChange` | `{ playerStatus }` (2=playing, 3=paused, 4=ended) | `isPaused` 状態更新 |
| `error` | エラー情報 | エラー表示 |

**送信コマンド** (`iframe.contentWindow.postMessage(...)`, origin: `https://embed.nicovideo.jp`):

| コマンド | データ | 用途 |
|---|---|---|
| `seek` | `{ time: number }` (秒) | `resonote:seek` イベントからの再生位置変更 |
| `play` | なし | 再生開始 |
| `pause` | なし | 一時停止 |

**メッセージ形式** (送信):
```typescript
iframe.contentWindow.postMessage({
  sourceConnectorType: 1,
  playerId: '1',
  eventName: 'seek',
  data: { time: positionSec }
}, 'https://embed.nicovideo.jp');
```

**メッセージ形式** (受信):
```typescript
e.data.eventName  // 'playerMetadataChange' etc.
e.data.data       // イベントデータ
e.data.playerId   // '1'
```

#### 状態管理

- `ready`: `loadComplete` 受信で true
- `error`: `error` イベント受信で true
- `isPaused`: `playerStatusChange` の status で更新（2→false, 3/4→true）
- `currentTime`/`duration`: `playerMetadataChange` から取得

#### ライフサイクル

- `$effect` で `message` リスナーと `resonote:seek` リスナーを登録
- cleanup（return）で両リスナーを除去
- iframe の `src` は `embedUrl(contentId)` から derived

## ルーティング

既存の `[platform]/[type]/[id]` パターンに乗せる: `/niconico/video/sm9`

コンテンツページ (`+page.svelte`) に条件分岐追加:
```svelte
{:else if showPlayer && platform === 'niconico'}
  <NiconicoEmbed {contentId} />
```

## レジストリ登録

`src/lib/content/registry.ts` に `niconico` を追加。既存プラットフォーム固有プロバイダーの後、`podcast`/`audio` の前に配置。

## ホームページ更新

- 入力例チップ: `{ icon: '🎥', platform: 'ニコニコ', label: 'レッツゴー！陰陽師', url: 'https://www.nicovideo.jp/watch/sm9' }`
- placeholder ローテーション: `'ニコニコ動画のURLを入力...'` を追加

## エラーハンドリング

| シナリオ | 挙動 |
|---|---|
| iframe 読み込み失敗 | エラー表示（既存 embed パターンと同じ） |
| 非公開/削除済み動画 | プレイヤー内でニコニコ側がエラー表示（Resonote 側は特別な処理不要） |
| postMessage origin 不一致 | 無視 |
| jsapi 非対応（将来 API 削除時） | プレイヤーは表示されるが再生同期なし。コメント機能は動作 |

## テスト方針

- **ユニットテスト**: `parseUrl()` — sm/so/nico.ms/embed/sp URL マッチ、nm 除外、無関係 URL 除外
- **ユニットテスト**: `toNostrTag()`, `contentKind()`, `embedUrl()`, `openUrl()`

## 注意事項

- ニコニコ動画の埋め込み API は非公式。突然変更される可能性がある
- ドキュメントでは「https 非対応」と記載があるが、実際には https で動作している（2026年3月時点）
- `nm` プレフィックス（ニコニコムービーメーカー）は埋め込み非対応（500 エラー）
