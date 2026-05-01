# Pre-release Fixes Design

Date: 2026-03-29

8 issues を一括対応するリリース前修正バッチの設計。

## Issue 一覧

| Issue | 内容                               | 種別        |
| ----- | ---------------------------------- | ----------- |
| #199  | audio metadata MIME ホワイトリスト | security    |
| #200  | thumbnailUrl に sanitizeUrl 適用   | security    |
| #201  | NIP-05 ドメインバリデーション      | security    |
| #202  | notifications.ts カバレッジ除外    | testing     |
| #203  | profile-page-view-model テスト拡充 | testing     |
| #204  | NIP-25 e-tag pubkey hint           | enhancement |
| #206  | バンドルチャンク分析               | performance |

---

## #199: audio metadata MIME ホワイトリスト

### 変更ファイル

- `src/server/lib/audio-metadata.ts`
- `src/server/lib/audio-metadata.test.ts`

### 設計

`parseApicFrame` 内で MIME タイプをホワイトリストで検証:

```ts
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const mimeType = mime && ALLOWED_IMAGE_MIMES.has(mime) ? mime : 'image/jpeg';
```

### テスト

- 許可 MIME (`image/png`) → そのまま使用
- 不許可 MIME (`image/svg+xml`, `text/html`) → `image/jpeg` フォールバック
- 空/undefined → `image/jpeg` フォールバック

---

## #200: thumbnailUrl sanitize

### 変更ファイル

- `src/features/content-resolution/application/fetch-content-metadata.ts`

### 設計

API レスポンスから `thumbnailUrl` を取り出す箇所で `sanitizeUrl()` を適用:

```ts
import { sanitizeUrl } from '$shared/utils/url.js';
// ...
thumbnailUrl: sanitizeUrl(data.thumbnailUrl) ?? null,
```

---

## #201: NIP-05 ドメインバリデーション

### 変更ファイル

- `src/shared/nostr/nip05.ts`
- `src/shared/nostr/nip05.test.ts`

### 設計

`fetchNip05` 内、URL 構築前にドメインを検証する関数を追加:

```ts
function isUnsafeDomain(domain: string): boolean {
  if (!domain || domain === 'localhost') return true;
  // IPv4 直指定を拒否
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) return true;
  // IPv6 を拒否
  if (domain.startsWith('[') || domain.includes(':')) return true;
  return false;
}
```

- ドメインが unsafe なら `{ valid: false }` を即返却
- 正当な FQDN のみ通過

### テスト

- `localhost` → rejected
- `127.0.0.1` → rejected
- `192.168.1.1` → rejected
- `[::1]` → rejected
- `example.com` → allowed
- 空文字 → rejected

---

## #202: notifications.ts カバレッジ除外

### 変更ファイル

- `vite.config.ts`

### 設計

`coverage.exclude` の re-export facade セクションに追加:

```ts
'src/shared/browser/notifications.ts',
```

---

## #203: profile-page-view-model テスト拡充

### 変更ファイル

- `src/features/profiles/ui/profile-page-view-model.test.ts`

### 対象ブランチ

現在 Lines 48.68%, Branch 32.6%。以下の未カバーパスのテストを追加:

1. NIP-19 デコード失敗時のエラーハンドリング
2. `requestFollow` / `requestUnfollow` / `requestMuteUser` の確認ダイアログフロー
3. `confirmCurrentAction` / `cancelConfirmAction`
4. `loadMore` ページネーション (until パラメータ)
5. requestKey 重複防止ロジック
6. プロフィール ID 変更時のリセット

目標: Lines 80%+, Branch 70%+

---

## #204: NIP-25 e-tag pubkey hint

### 変更ファイル

- `src/shared/nostr/events.ts`
- `src/shared/nostr/events.test.ts`

### 設計

NIP-25 仕様は `e` タグに relay hint + pubkey hint の4要素形式を推奨 (SHOULD):
`["e", <event_id>, <relay_hint>, <pubkey>]`

`buildReaction` の `e` タグに4要素目として `targetPubkey` を追加:

```ts
// before
relayHint ? ['e', targetEventId, relayHint] : ['e', targetEventId],

// after
relayHint
  ? ['e', targetEventId, relayHint, targetPubkey]
  : ['e', targetEventId, '', targetPubkey],
```

`relayHint` なしでも pubkey を入れるため、3要素目に空文字を挿入（NIP-25 の位置固定タグ仕様に準拠）。

kind は 7 のまま維持（コメント kind:1111 へのリアクションなので NIP-25 に準拠）。

### テスト

- relayHint あり → `['e', id, hint, pubkey]` 4要素
- relayHint なし → `['e', id, '', pubkey]` 4要素（空文字プレースホルダー）

---

## #206: バンドルチャンク分析

### 作業内容

1. `rollup-plugin-visualizer` を devDependencies に追加
2. `pnpm build` でビジュアライザレポートを生成
3. 巨大チャンクの内訳を分析
4. 分割候補を issue コメントに記録

実装は分析結果に基づき別 issue で対応。

---

## 全体テスト戦略

各修正に対応するユニットテストを追加。全修正完了後に以下を実行:

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e
```
