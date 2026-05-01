# Code Audit Fixes Design Spec

Date: 2026-03-29

## Overview

2026-03-29 コード監査で検出された 8 件の issue に対する修正設計。
Issue 8 (emoji chunk) は既知につき対象外。

方針:

- NIP 標準寄せ (Issue 3, 4)
- CSP は現状維持 + ドキュメント化 (Issue 6)
- CI 境界強制は包括的に実施 (Issue 9)

---

## Issue 1: NIP-09 削除検証が未観測イベントを受理する

### 根本原因

`deletion-rules.ts` の `verifyDeletionTargets()` が `!originalPubkey` (元イベント未観測) のケースで削除を受理している。

```ts
// 現状: 未観測なら通す
return !originalPubkey || originalPubkey === event.pubkey;
```

### 修正設計

1. **条件反転**: 元イベントの pubkey が不明な場合は reject する

```ts
// 修正後: pubkey 一致時のみ通す
return originalPubkey !== undefined && originalPubkey === event.pubkey;
```

2. **pending deletion**: comment-view-model で未観測 deletion を pending セットに保持。元イベント受信時に pending を再照合して削除を適用する。
   - `pendingDeletions: Map<targetId, deletionEvent>` を追加
   - 新規イベント受信時に `pendingDeletions` をチェック
   - pubkey が一致すれば `deletedIds` に追加

3. **テスト修正**: 既存テストの「未観測 deletion を受理する」期待値を反転

### 対象ファイル

- `src/features/comments/domain/deletion-rules.ts`
- `src/features/comments/domain/deletion-rules.test.ts`
- `src/features/comments/ui/comment-view-model.svelte.ts`

---

## Issue 2: 本文引用の e-tag が replyTo を壊す

### 根本原因

`extractContentTags()` が content 内の `nostr:note1`/`nostr:nevent1` を e-tag として返し、`appendContentTags()` が `['e', eventId]` を追加。`commentFromEvent` の `findTagValue(tags, 'e')` が最初の e-tag を replyTo として解釈する。

### 修正設計

1. **q-tag 分離**: `extractContentTags()` の戻り値を変更

```ts
// 現状
return { pTags, eTags, tTags };

// 修正後
return { pTags, qTags, tTags };
```

content 内の `nostr:note1`/`nostr:nevent1` は quote であり、parent/reply ではない。NIP-18/NIP-22 に従い `q` タグとして出力する。

2. **appendContentTags 修正**: `['e', eventId]` → `['q', eventId]`

3. **commentFromEvent は変更不要**: `findTagValue(tags, 'e')` は引き続き reply parent 用 e-tag のみを拾う。q-tag は別タグなので干渉しない。

4. **回帰テスト**: content に `nostr:note1...` を含む top-level comment が `replyTo === null` になることを検証

### 対象ファイル

- `src/shared/nostr/content-parser.ts` (`extractContentTags`)
- `src/shared/nostr/events.ts` (`appendContentTags`)
- `src/shared/nostr/content-parser.test.ts`
- `src/shared/nostr/events.test.ts`

---

## Issue 3: mute list を NIP-51 互換に寄せる

### 根本原因

mute list の private content が NIP-44 のみ対応。NIP-04 由来のリストを読めない。tag は `p`/`word` のみで `t`/`e` 未対応。

### 修正設計

#### 読み取り側

1. **NIP-44 → NIP-04 fallback**: decrypt 時に NIP-44 を試み、失敗したら NIP-04 で再試行
2. **暗号方式の記憶**: どちらで復号できたかを state に保持 (`encryptionScheme: 'nip44' | 'nip04' | 'new'`)

#### 書き込み側

1. **新規作成時**: NIP-44 で暗号化
2. **NIP-04 由来の既存リスト更新時**: 保存前に確認ダイアログを表示
   - 選択肢 1: 「NIP-04 のまま保存」 — 互換性維持
   - 選択肢 2: 「NIP-44 に変換して保存」 — 新方式に移行
   - 暗黙の変換はしない。毎回ユーザーに確認する
3. **NIP-44 由来のリスト更新時**: NIP-44 でそのまま保存

#### tag サポート拡張

- `t` (hashtag mute) と `e` (event mute) の parse/publish を追加
- UI は `p`/`word` のみ表示で変更なし (parse のみ拡張し、他クライアントで追加された tag を消さない)

#### 暗号化サポート判定

- `hasNip44Support()` → `getEncryptionCapabilities()` に変更
- NIP-44 も NIP-04 もない場合のみエラー

### 対象ファイル

- `src/shared/browser/mute.svelte.ts`
- `src/features/mute/application/mute-actions.ts`
- `src/features/mute/ui/mute-settings-view-model.svelte.ts` (ダイアログ連携)
- `src/lib/components/ConfirmDialog.svelte` (既存ダイアログ再利用)

---

## Issue 4: bookmarks を NIP-51 標準寄せ

### 根本原因

kind:10003 で `i` タグのみ使用。NIP-51 標準の `e`/`a`/`r` タグは parse のみ。

### 修正設計

1. **読み取り拡張**: `parseBookmarkTags()` に `r` (URL) タグ対応追加
2. **BookmarkEntry 拡張**: `type: 'content' | 'event' | 'url'` に `url` variant 追加
3. **書き込み**: 外部コンテンツは引き続き `i` タグ (NIP-73 拡張)。変更なし
4. **ドキュメント**: CLAUDE.md に `i` タグ使用が Resonote 独自拡張である旨を明記
5. **tag 保全**: 他クライアントが追加した `e`/`a`/`r` タグを publish 時に消さない (現状の `addBookmarkTag`/`removeBookmarkTag` は他タグを保持するので OK)

### 対象ファイル

- `src/features/bookmarks/domain/bookmark-model.ts`
- `src/features/bookmarks/domain/bookmark-model.test.ts`
- CLAUDE.md

---

## Issue 5: ncontent prefix をドキュメント化

### 修正設計

1. **VALID_PREFIXES 分離**: `resolve-nip19-navigation.ts` で standard と custom を明示

```ts
const STANDARD_NIP19_PREFIXES = ['npub1', 'nprofile1', 'nevent1', 'note1', 'naddr1'];
const CUSTOM_PREFIXES = ['ncontent1'];
const VALID_PREFIXES = [...STANDARD_NIP19_PREFIXES, ...CUSTOM_PREFIXES];
```

2. **JSDoc 追記**: `encodeContentLink()` / `decodeContentLink()` に「Resonote 独自拡張、NIP-19 外」を明記

3. **CLAUDE.md 追記**: Architecture セクションに ncontent の仕様を記載
   - TLV 構造 (type 0: contentId, type 1: relay)
   - encode/decode の所在
   - 他クライアントでは decode 不可である旨

### 対象ファイル

- `src/features/nip19-resolver/application/resolve-nip19-navigation.ts`
- `src/shared/nostr/helpers.ts`
- CLAUDE.md

---

## Issue 6: CSP ドキュメント化

### 修正設計

コード変更なし。ドキュメントのみ。

1. **hooks.server.ts**: CSP ヘッダーのインラインコメントに `unsafe-eval` が必要な理由を追記
   - `@konemono/nostr-login` が内部で eval を使用
   - `unsafe-inline` は Svelte/Tailwind のスタイル注入に必要

2. **CLAUDE.md Gotchas 追記**:
   - CSP `unsafe-eval` は nostr-login 依存。ライブラリが改善されたら除去可能
   - `style-src unsafe-inline` は SvelteKit + Tailwind で実質必須

3. **将来の除去手順メモ**: nostr-login が eval 不要になった場合の CSP 更新手順

### 対象ファイル

- `src/hooks.server.ts` (コメントのみ)
- CLAUDE.md

---

## Issue 7: relay list を created_at で選択

### 根本原因

`relays-config.ts` と `relays.svelte.ts` で kind:10002/kind:3 の packet を到着順に上書き。`created_at` 比較なし。

### 修正設計

同コードベース内の正しいパターン (`client.ts:96`) を適用。

1. **relays-config.ts**:

```ts
let latestCreatedAt = 0;
// next callback 内:
if (packet.event.created_at > latestCreatedAt) {
  latestCreatedAt = packet.event.created_at;
  relayTags = packet.event.tags;
}
```

2. **relays.svelte.ts**: kind:10002 と kind:3 の両方で同様の timestamp 比較を追加

3. **テスト**: 複数 packet が到着した際に `created_at` が最大のものが採用されることを検証

### 対象ファイル

- `src/shared/nostr/relays-config.ts`
- `src/shared/nostr/relays-config.test.ts`
- `src/shared/browser/relays.svelte.ts`

---

## Issue 9: CI 境界強制 (包括的)

### 根本原因

structure guard は legacy store/i18n の2パターンのみ。三層構造の依存方向違反を検出できない。`shared/browser/` が features を直接 import する facade パターンが undocumented。

### 修正設計

3フェーズで実施。

#### Phase 1: ui → infra 直接 import 禁止

- `structure-guard.test.ts` に `src/features/*/ui/**` → `src/features/*/infra/**` の import 検出ルール追加
- `scripts/check-structure.mjs` にも同ルール追加

#### Phase 2: domain での browser API 使用禁止

- `src/features/*/domain/**` 内の `window`, `document`, `fetch`, `localStorage`, `indexedDB` 使用を検出
- import ベースではなく grep ベースの検査 (グローバル API は import なしで使えるため)

#### Phase 3: shared → features 逆流解消

- 現在の facade (`shared/browser/{comments,bookmarks,mute,profile,follows}.ts`) を feature 側に移動
  - 各 feature の `index.ts` (public export) を作成
  - route や他 feature は `$features/comments` から import
  - `shared/browser/` は feature-agnostic な API のみ残す
- structure guard に `src/shared/**` → `src/features/**` の import 禁止ルールを追加
- CLAUDE.md の Path Aliases / Architecture セクションを更新

### 対象ファイル

- `src/architecture/structure-guard.test.ts`
- `scripts/check-structure.mjs`
- `src/shared/browser/{comments,bookmarks,mute,profile,follows}.ts` (移動)
- 各 feature の `index.ts` (新規)
- CLAUDE.md

---

## 実施順序

依存関係と難度を考慮した推奨順:

1. Issue 1 (NIP-09 deletion) — セキュリティ、独立、低難度
2. Issue 7 (relay created_at) — バグ修正、独立、低難度
3. Issue 2 (q-tag 分離) — バグ修正、独立、中難度
4. Issue 5 (ncontent ドキュメント) — ドキュメント、独立、低難度
5. Issue 6 (CSP ドキュメント) — ドキュメント、独立、低難度
6. Issue 4 (bookmarks 標準寄せ) — 機能拡張、独立、中難度
7. Issue 3 (mute list NIP-51) — 機能拡張、独立、高難度
8. Issue 9 (CI 境界強制) — リファクタリング、他の修正完了後が望ましい

## Scope 外

- Issue 8 (emoji chunk) — 既知、対象外
- nostr-login の置換 — Issue 6 で方針決定済み (現状維持)
- ncontent の NIP 提案 — 将来検討
