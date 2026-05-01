# Bookmarks + Mute List + Notification WoT Filter — Design Spec

## Overview

Resonote にブックマーク（kind:10003）、ミュートリスト（kind:10000, NIP-44 暗号化）、通知の WoT フィルタを追加する。

---

## Feature 1: ブックマーク

### データモデル

- **kind:10003** (NIP-51 bookmark list, replaceable event)
- 外部コンテンツ: `["i", "spotify:track:abc123", "https://open.spotify.com/track/abc123"]` (NIP-73 形式の i タグ拡張)
- Nostr コメント: `["e", eventId, relayHint]` (標準 NIP-51)
- NIP-51 仕様外の `i` タグだが、他クライアントは不明タグを無視するだけで害なし

### ストア

**新規ファイル**: `src/lib/stores/bookmarks.svelte.ts`

```typescript
interface BookmarkEntry {
  type: 'content' | 'event';
  // content: contentId (platform:type:id)
  // event: eventId
  value: string;
  hint?: string; // relay hint or open URL
}

let entries = $state<BookmarkEntry[]>([]);
let loading = $state(false);

export function getBookmarks() { ... }
export async function loadBookmarks(pubkey: string): Promise<void> { ... }
export async function addBookmark(contentId: ContentId, provider: ContentProvider): Promise<void> { ... }
export async function removeBookmark(contentId: ContentId): Promise<void> { ... }
export function isBookmarked(contentId: ContentId): boolean { ... }
export function clearBookmarks(): void { ... }
```

**loadBookmarks**:

1. kind:10003 を取得（backward request）
2. `i` タグ → BookmarkEntry (type: 'content')
3. `e` タグ → BookmarkEntry (type: 'event')

**addBookmark / removeBookmark**:

1. 現在のブックマークリストを保持
2. エントリを追加/削除
3. kind:10003 イベントを再構築して `castSigned()` で発行

### UI

- コンテンツページ（`[id]/+page.svelte`）に ★ トグルボタン追加（ShareButton の横）
  - ログイン時のみ表示
  - `isBookmarked()` で状態表示
  - クリックで `addBookmark()` / `removeBookmark()`
- `/bookmarks` ルート新規作成
  - ブックマーク一覧表示
  - content タイプ: プラットフォームアイコン + content ID + リンク
  - event タイプ: コメント内容プレビュー + コンテンツリンク
  - 削除ボタン

### ライフサイクル

- ログイン時: `loadBookmarks(pubkey)` を呼び出し（`auth.svelte.ts` の `onLogin` から）
- ログアウト時: `clearBookmarks()` を呼び出し

---

## Feature 2: ミュートリスト

### データモデル

- **kind:10000** (NIP-51 mute list, replaceable event)
- **全エントリを NIP-44 暗号化** して `content` フィールドに格納（lumilumi 方式）
- `tags` は空配列（公開エントリなし）
- 暗号化: `window.nostr.nip44.encrypt(pubkey, JSON.stringify(privateTags))`
- 復号: `window.nostr.nip44.decrypt(pubkey, content)`

### ミュート対象

- `["p", pubkey]` — ユーザーミュート
- `["word", "lowercase_string"]` — ワードミュート（小文字化して比較）

### ストア

**新規ファイル**: `src/lib/stores/mute.svelte.ts`

```typescript
interface MuteState {
  mutedPubkeys: Set<string>;
  mutedWords: string[];
  loading: boolean;
}

export function getMuteList() { ... }
export async function loadMuteList(pubkey: string): Promise<void> { ... }
export async function muteUser(pubkey: string): Promise<void> { ... }
export async function unmuteUser(pubkey: string): Promise<void> { ... }
export async function muteWord(word: string): Promise<void> { ... }
export async function unmuteWord(word: string): Promise<void> { ... }
export function isMuted(pubkey: string): boolean { ... }
export function isWordMuted(content: string): boolean { ... }
export function clearMuteList(): void { ... }
```

**loadMuteList**:

1. kind:10000 を取得（backward request）
2. `content` を NIP-44 で復号
3. JSON.parse して p/word タグを分類

**muteUser / unmuteUser / muteWord / unmuteWord**:

1. 現在のミュートリストを保持
2. エントリを追加/削除
3. NIP-44 で暗号化
4. kind:10000 イベントを `tags: []`, `content: encrypted` で `castSigned()`

### NIP-44 未対応ウォレット

- `window.nostr?.nip44` が undefined の場合、ミュート機能を無効化
- UI でミュートボタンを非表示 or disabled + ツールチップ「ウォレットが NIP-44 に対応していません」

### フィルタ適用

**CommentList.svelte**:

- `filteredComments` の算出時に `isMuted(c.pubkey)` と `isWordMuted(c.content)` でフィルタ

**notifications.svelte.ts**:

- `classifyEvent()` 内で `isMuted(event.pubkey)` チェック → ミュート済みならスキップ

### UI

- コメントの著者名横に「ミュート」メニュー項目（右クリック or ⋯ メニュー）
  - `muteUser(pubkey)` を呼び出し
- `/settings` にミュート管理セクション追加
  - ミュート済みユーザー一覧（npub + 表示名、解除ボタン）
  - ミュート済みワード一覧（追加/削除）

---

## Feature 3: 通知 WoT フィルタ

### 設定

- `/settings` に通知フィルタ設定を追加
- 選択肢: `all` / `follows` / `wot`
- localStorage に `resonote-notif-filter` として保存
- デフォルト: `all`

### 適用

- `notifications.svelte.ts` の通知表示時にフィルタ適用
- 購読自体は変えない（リレー側 `#p` フィルタは変更不可）
- `matchesFilter(pubkey, filter, myPubkey)` を既存の follows.svelte.ts から再利用

### UI

- `/settings` のリレー管理セクションの下に「通知」セクション追加
  - `all` / `follows` / `wot` のトグルボタン（CommentList のフィルタと同じパターン）

---

## ファイル構成

### 新規ファイル

| ファイル                                | 責務                 |
| --------------------------------------- | -------------------- |
| `src/lib/stores/bookmarks.svelte.ts`    | ブックマークストア   |
| `src/lib/stores/mute.svelte.ts`         | ミュートリストストア |
| `src/web/routes/bookmarks/+page.svelte` | ブックマークページ   |

### 既存ファイル変更

| ファイル                                             | 変更内容                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| `src/lib/stores/auth.svelte.ts`                      | onLogin/onLogout でブックマーク・ミュートの読み込み/クリア |
| `src/lib/components/CommentList.svelte`              | ミュートフィルタ適用 + ミュートメニュー                    |
| `src/lib/stores/notifications.svelte.ts`             | ミュートチェック + WoT フィルタ適用                        |
| `src/web/routes/settings/+page.svelte`               | ミュート管理 + 通知フィルタ設定                            |
| `src/web/routes/[platform]/[type]/[id]/+page.svelte` | ★ ブックマークボタン                                       |
| `src/lib/i18n/en.json`                               | 新規キー追加                                               |
| `src/lib/i18n/ja.json`                               | 新規キー追加                                               |

---

## 設計上の注意事項

1. **NIP-44 暗号化**: `window.nostr.nip44.encrypt(selfPubkey, plaintext)` — 自分自身の pubkey を使って暗号化（自分だけが復号可能）
2. **NIP-44 未対応**: `window.nostr?.nip44` が undefined → ミュート機能無効化（graceful degradation）
3. **ブックマーク i タグ**: NIP-51 仕様外だが互換性に問題なし（他クライアントは無視）
4. **ワードミュート**: 小文字化して比較。`content.toLowerCase().includes(word)` でマッチ
5. **ミュートの即時反映**: `muteUser()` 後、ローカル state を即時更新（リレー応答を待たない）
6. **通知フィルタ**: 表示時フィルタのみ（購読は変えない）。`matchesFilter()` を follows.svelte.ts から再利用
7. **ブックマーク更新の競合**: addBookmark/removeBookmark は最新 kind:10003 を取得してから変更（followUser と同じパターン）
