# Resonote Feature Pack — Design Spec

## Overview

Resonote に NIP-05 検証、リレー管理、プロフィールページ、NIP-19 ルーティング（カスタム TLV 含む）、通知フィードを追加する。

## Phase 構成

```
Phase 1: NIP-05 検証 + リレー管理 + /settings
Phase 2: プロフィールページ + NIP-19 ルーティング + カスタム TLV
Phase 3: 通知フィード
```

---

## Phase 1: NIP-05 検証 + リレー管理

### 1.1 NIP-05 検証

**目的**: ユーザーの NIP-05 識別子（`user@domain.com`）を HTTP 検証し、認証バッジを表示する。

**新規ファイル**: `src/lib/nostr/nip05.ts`

```typescript
interface Nip05Result {
  valid: boolean | null; // true=検証成功, false=検証失敗, null=検証不可(CORS等)
  nip05: string;
  checkedAt: number;
}

function verifyNip05(nip05: string, pubkey: string): Promise<Nip05Result>;
```

- `nip05` を `local@domain` に分割
- `https://{domain}/.well-known/nostr.json?name={local}` を fetch（タイムアウト 5秒）
- レスポンスの `names[local]` が `pubkey` と一致すれば `valid: true`
- CORS エラー / ネットワークエラー → `valid: null`（検証不可）
- pubkey 不一致 → `valid: false`
- インメモリ Map キャッシュ、TTL 1時間

**既存ファイル変更**: `src/lib/stores/profile-utils.ts`

```typescript
interface Profile {
  name?: string;
  displayName?: string;
  picture?: string;
  nip05?: string; // 追加
  nip05valid?: boolean | null; // 追加
}
```

**既存ファイル変更**: `src/lib/stores/profile.svelte.ts`

- `parseProfileContent()` で kind:0 の `nip05` フィールドを抽出
- プロフィール取得後にバックグラウンドで `verifyNip05()` を呼び出し、結果を Profile に反映

**表示**:

- コメント著者名横: `✓ user@doma...`（20文字上限で truncate）
- プロフィールページ: `✓ user@domain.com`（フル表示）
- 検証不可の場合: バッジなし（`null` は表示しない）
- 検証失敗の場合: バッジなし（`false` も表示しない。偽の×マークは混乱を招く）

### 1.2 リレー管理

**目的**: ユーザーが自分のリレーリストを閲覧・編集・保存できるようにする。

**既存ファイル変更**: `src/lib/stores/relays.svelte.ts`

```typescript
interface RelayEntry {
  url: string;
  read: boolean;
  write: boolean;
}

// kind:10002 から読み取り。なければ kind:3 content JSON フォールバック
function fetchRelayList(pubkey: string): Promise<RelayEntry[]>;

// kind:10002 イベントを署名送信
function publishRelayList(relays: RelayEntry[]): Promise<void>;
```

**kind:3 フォールバック読み取り**:

- kind:3 の `content` フィールドを `JSON.parse` → `{ "wss://...": { read: true, write: true } }` 形式
- パース失敗・空の場合はデフォルトリレーを返す
- **読み取り専用**。kind:3 への書き込みはしない

**保存時の動作**:

1. kind:10002 イベントを構築: 各リレーを `["r", url]` / `["r", url, "read"]` / `["r", url, "write"]` タグ化
2. `castSigned()` で署名送信
3. 成功後、runtime の `rxNostr.setDefaultRelays()` を即時更新

**安全弁**:

- 最低1リレー必須。全削除時は警告表示して保存ブロック
- 「デフォルトにリセット」ボタン

**新規ルート**: `src/web/routes/settings/+page.svelte`

- リレー一覧テーブル: URL, read トグル, write トグル, 接続状態インジケータ, 削除ボタン
- リレー追加: URL 入力 + 追加ボタン（wss:// バリデーション）
- 保存ボタン → kind:10002 発行
- リセットボタン → デフォルトリレーに戻す
- ヘッダーに `/settings` へのリンク追加（歯車アイコン等）

---

## Phase 2: プロフィールページ + NIP-19 ルーティング

### 2.1 NIP-19 ルーティング

**目的**: `npub1...`, `nprofile1...`, `nevent1...`, カスタム TLV (`ncontent1...`) の URL でコンテンツ/プロフィールに遷移する。

**新規ファイル**: `src/lib/nostr/nip19-decode.ts`

```typescript
type DecodedNip19 =
  | { type: 'npub'; pubkey: string }
  | { type: 'nprofile'; pubkey: string; relays: string[] }
  | { type: 'nevent'; eventId: string; relays: string[]; author?: string; kind?: number }
  | { type: 'note'; eventId: string }
  | { type: 'ncontent'; contentId: string; relays: string[] } // カスタム
  | null; // 無効

function decodeNip19(str: string): DecodedNip19;
```

- nostr-tools の `nip19.decode()` を活用
- カスタム TLV (`ncontent1...`) は独自デコードロジック

**新規ファイル**: `src/lib/nostr/content-link.ts`

```typescript
// カスタム bech32 TLV エンコード/デコード
// TLV type 0 (special): コンテンツ ID 文字列 (e.g., "spotify:track:abc123")
// TLV type 1 (relay): relay URL (複数可)
function encodeContentLink(contentId: ContentId, relays: string[]): string;
function decodeContentLink(str: string): { contentId: ContentId; relays: string[] } | null;
```

- プレフィックス名は TBD（仮: `ncontent`）
- コンテンツ ID は `platform:type:id` 形式の文字列として TLV type 0 に格納

**新規ルート**: `src/web/routes/[nip19]/+page.svelte`

- パラメータのプレフィックスを検証（`npub1`, `nprofile1`, `nevent1`, `note1`, `ncontent1`）
- 不正値 → 404 表示
- 処理:
  - `npub` / `nprofile` → `/profile/{value}` にリダイレクト
  - `nevent` / `note` → relay hint からイベント取得 → `I` タグ抽出 → コンテンツページに遷移。kind:1111 以外は「Resonote のコメントではありません」表示 + `I` タグがあればコンテンツリンク提供
  - `ncontent` (カスタム) → コンテンツ ID デコード → コンテンツページに遷移

**Relay hint の扱い**:

- nprofile/nevent/ncontent の relay hint は **一時的にのみ使用**
- 当該フェッチ操作の rx-nostr リクエストに relay を追加するが、ユーザーのデフォルトリレーには永続化しない

### 2.2 プロフィールページ

**新規ルート**: `src/web/routes/profile/[id]/+page.svelte`

- `id` は npub1 または nprofile1 文字列
- nprofile の場合、relay hint を一時使用してプロフィール取得

**表示内容**:

1. **ヘッダー**: アバター、表示名、NIP-05 バッジ（Phase 1）、bio
2. **フォロー数**: kind:3 の p-tag 数（確定値）
3. **フォロワー数**: `{ kinds: [3], "#p": [pubkey], limit: 500 }` で概算。結果数を「N+」形式で表示。NIP-45 COUNT 対応リレーがあれば使用
4. **フォロー/アンフォローボタン**（ログイン時のみ）
5. **コメント履歴**: `{ kinds: [1111], authors: [pubkey] }` で取得、新しい順に表示
6. **コメント済みコンテンツ一覧**: コメントの `I` タグからコンテンツ別にグループ化

**フォロー/アンフォロー**:

**既存ファイル変更**: `src/lib/stores/follows.svelte.ts`

```typescript
function followUser(pubkey: string): Promise<void>;
function unfollowUser(pubkey: string): Promise<void>;
```

- 最新 kind:3 を取得
- p-tags を追加/削除
- **content フィールドはそのまま保持**（レガシー relay JSON の保全）
- `castSigned()` で再発行
- ローカル state を即時更新
- ボタンは操作中 disable（連打防止）

**プロフィール未発見時**: npub のみ表示、「プロフィールが見つかりません」メッセージ

**既存ファイル変更**: `src/lib/components/CommentList.svelte`

- コメント著者名をクリック可能に → `/profile/{npub}` へ遷移

### 2.3 共有リンク

**既存ファイル変更**: `src/lib/components/ShareButton.svelte`

- 既存の kind:1 シェアに加えて「Resonote リンクをコピー」オプション追加
- `encodeContentLink(contentId, DEFAULT_RELAYS)` でエンコード（**ユーザー固有リレーは含めない**、プライバシー保護）
- `https://resonote.pages.dev/{ncontent1...}` 形式でクリップボードにコピー

---

## Phase 3: 通知フィード

### 3.1 通知ストア

**新規ファイル**: `src/lib/stores/notifications.svelte.ts`

```typescript
type NotificationType = 'reply' | 'reaction' | 'mention' | 'follow_comment';

interface Notification {
  id: string; // event ID
  type: NotificationType;
  event: NostrEvent;
  createdAt: number;
}

interface NotificationState {
  items: Notification[];
  unreadCount: number;
  loading: boolean;
}
```

**通知対象イベント**:
| タイプ | 条件 |
|--------|------|
| reply | kind:1111 with `["p", myPubkey]` + `["e", ...]`（返信構造） |
| reaction | kind:7 with `["p", myPubkey]` |
| mention | kind:1111 with `["p", myPubkey]`（reply 以外） |
| follow_comment | kind:1111 with `authors: [follows...]`（自分のイベントは除外） |

**購読パターン**:

- ログイン時に backward + forward の dual-request 開始
- Replies + Reactions + Mentions: `{ kinds: [1111, 7], "#p": [myPubkey], since: lastReadTimestamp }`
- Follow comments: `{ kinds: [1111], authors: [follows...], since: loginTimestamp }`
  - authors フィルタは 100件ずつバッチ化
  - **follow_comment は 50件 cap**。超過分は最新50件のみ保持
- 自分自身のイベントは除外

**既読管理**:

- `localStorage` に `resonote-notif-last-read` タイムスタンプ保存
- `markAllAsRead()` で現在時刻を保存 → unreadCount リセット
- 通知一覧はイベント自体を IndexedDB (EventsDB) にキャッシュ（再ログイン時復元）

**ライフサイクル**:

- ログイン → 購読開始
- ログアウト → 購読停止 + state クリア + localStorage の lastRead 削除

### 3.2 通知 UI

**新規コンポーネント**: `src/lib/components/NotificationBell.svelte`

- ベルアイコン + 未読数バッジ（赤丸）
- クリック → ドロップダウンポップオーバーで直近5件表示
- 各通知:
  - タイプ別アイコン（💬 返信, ❤️ リアクション, @ メンション, 🎵 フォロー）
  - 著者名（NIP-05 バッジ付き）
  - 概要テキスト（内容の先頭 50 文字）
  - コンテンツへのリンク（`I` タグからコンテンツページへ）
  - 相対時刻（「3分前」等）
- 「すべて見る」リンク → `/notifications`
- ドロップダウン表示時に未読をリセット（markAllAsRead）

**既存ファイル変更**: `src/web/routes/+layout.svelte`

- ヘッダーに NotificationBell 追加（ログイン時のみ表示）

**新規ルート**: `src/web/routes/notifications/+page.svelte`

- 通知一覧（全件、ページネーション 30件ずつ）
- 未読/既読の視覚的区別（背景色）
- タイプ別フィルタ（All / Replies / Reactions / Mentions / Follows）
- 「すべて既読にする」ボタン
- 各通知クリック → コンテンツページへ遷移

### 3.3 i18n 追加キー

```json
{
  "settings.title": "Settings",
  "settings.relays.title": "Relays",
  "settings.relays.add": "Add relay",
  "settings.relays.save": "Save",
  "settings.relays.reset": "Reset to defaults",
  "settings.relays.min_warning": "At least one relay is required",
  "settings.relays.read": "Read",
  "settings.relays.write": "Write",
  "settings.relays.invalid_url": "Invalid relay URL",
  "profile.no_profile": "Profile not found",
  "profile.no_comments": "No comments yet",
  "profile.follows": "Following",
  "profile.followers": "Followers",
  "profile.follow": "Follow",
  "profile.unfollow": "Unfollow",
  "profile.comments_on": "Comments on",
  "nip19.not_found": "Event not found",
  "nip19.not_comment": "This event is not a Resonote comment",
  "nip19.invalid": "Invalid link",
  "notification.title": "Notifications",
  "notification.reply": "replied to your comment",
  "notification.reaction": "reacted to your comment",
  "notification.mention": "mentioned you",
  "notification.follow_comment": "commented on",
  "notification.mark_all_read": "Mark all as read",
  "notification.view_all": "View all",
  "notification.empty": "No notifications yet",
  "notification.more": "{count} more",
  "share.copy_link": "Copy Resonote link",
  "share.copied": "Copied!"
}
```

（ja.json にも同等のキーを追加）

---

## ファイル構成まとめ

### 新規ファイル

| ファイル                                     | Phase | 責務                             |
| -------------------------------------------- | ----- | -------------------------------- |
| `src/lib/nostr/nip05.ts`                     | 1     | NIP-05 検証 + キャッシュ         |
| `src/web/routes/settings/+page.svelte`       | 1     | 設定ページ（リレー管理）         |
| `src/lib/nostr/nip19-decode.ts`              | 2     | NIP-19 デコード                  |
| `src/lib/nostr/content-link.ts`              | 2     | カスタム TLV エンコード/デコード |
| `src/web/routes/[nip19]/+page.svelte`        | 2     | NIP-19 ルーティング              |
| `src/web/routes/profile/[id]/+page.svelte`   | 2     | プロフィールページ               |
| `src/lib/stores/notifications.svelte.ts`     | 3     | 通知ストア                       |
| `src/lib/components/NotificationBell.svelte` | 3     | ベルアイコン + ドロップダウン    |
| `src/web/routes/notifications/+page.svelte`  | 3     | 通知ページ                       |

### 既存ファイル変更

| ファイル                                | Phase | 変更内容                             |
| --------------------------------------- | ----- | ------------------------------------ |
| `src/lib/stores/profile-utils.ts`       | 1     | Profile 型に nip05 フィールド追加    |
| `src/lib/stores/profile.svelte.ts`      | 1,2   | NIP-05 抽出・検証 + fetchFullProfile |
| `src/lib/stores/relays.svelte.ts`       | 1     | fetchRelayList + publishRelayList    |
| `src/lib/stores/follows.svelte.ts`      | 2     | followUser + unfollowUser            |
| `src/lib/components/CommentList.svelte` | 1,2   | NIP-05 バッジ + 著者名リンク         |
| `src/lib/components/ShareButton.svelte` | 2     | ncontent リンクコピー追加            |
| `src/web/routes/+layout.svelte`         | 1,3   | /settings リンク + NotificationBell  |
| `src/lib/i18n/en.json`                  | 1,2,3 | 新規キー追加                         |
| `src/lib/i18n/ja.json`                  | 1,2,3 | 新規キー追加                         |

---

## 設計上の注意事項

1. **NIP-05 CORS**: fetch 失敗時は `valid: null`（検証不可）。`false`（検証失敗）と区別。5秒タイムアウト
2. **kind:3 content 保全**: follow/unfollow 時、p-tags のみ変更し content フィールドは元の値を保持
3. **フォロワー数**: 概算表示。`limit: 500` クエリで「N+」形式。NIP-45 COUNT 対応リレーがあれば使用
4. **Relay hint は一時的**: nprofile/nevent/ncontent の relay hint はフェッチ操作のみに使用。ユーザーリレーに永続化しない
5. **Follow ボタン連打防止**: 操作中 disable + 最新 kind:3 取得してから変更
6. **共有リンクのプライバシー**: ncontent エンコードにはデフォルトリレーのみ含める。ユーザー固有リレーは含めない
7. **リレー管理の安全弁**: 最低1リレー必須。全削除時は警告 + 保存ブロック。リセットボタン提供
8. **通知 follow_comment の cap**: セッション中 50件まで。超過は最新のみ保持
9. **nevent の非 kind:1111**: 「Resonote のコメントではありません」表示 + I タグあればコンテンツリンク提供
10. **[nip19] ルート検証**: プレフィックス不正は 404。無効な bech32 もエラー表示
11. **NIP-05 長文 truncate**: コメント横は 20 文字上限、プロフィールはフル表示
12. **NIP-05 同時検証数**: 最大5件の同時検証。超過分はキューで待機（大量コメント表示時の HTTP リクエスト制御）
13. **NIP-65 unmarked relay**: `["r", url]`（マーカーなし）= read + write 両方。`["r", url, "read"]` = 読み取り専用、`["r", url, "write"]` = 書き込み専用
14. **プロフィールのコメント pagination**: `limit: 50` + 「もっと読み込む」ボタン（`until` で古いコメント取得）
15. **kind:3 未存在時の Follow**: ユーザーの kind:3 が未発見の場合、ターゲット pubkey のみを p-tag とした新規 kind:3 を作成（content は空文字列）
16. **rx-nostr の relay hint 使用**: per-request relay 指定 API があれば使用。なければ `addDefaultRelays()` → 取得 → `removeDefaultRelays()` で一時的に追加/削除
17. **カスタム TLV 実装**: `@scure/base`（nostr-tools の依存）の bech32 エンコーダを使用。TLV フォーマット（type 1byte + length 2byte BE + value）は自前実装
18. **Reply/Mention 区別**: 受信 kind:1111 に `["e", ...]` + `["p", myPubkey]` → reply。`["e", ...]` なし + `["p", myPubkey]` → mention。kind:7 + `["p", myPubkey]` → reaction。NIP-22 の e-tag は 3 要素（4番目の pubkey はオプション）のため、`["p", myPubkey]` で判定する方が他クライアント互換
19. **NIP-05 リダイレクト**: fetch 時に `redirect: 'error'` を指定（NIP-05 仕様: エンドポイントはリダイレクト禁止）
20. **NIP-02 p-tag 保全**: Follow/Unfollow 時、既存 p-tag の全要素（`["p", pubkey, relay_url, petname]`）を保持。新規 Follow は `["p", pubkey]` のみで追加
