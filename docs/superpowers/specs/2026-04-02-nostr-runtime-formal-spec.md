# Nostr Runtime Formal Spec

## 1. 目的

`@ikuradon/auftakt` 移行計画を廃止し、Resonote の要件に適合しつつ、将来的に単独モジュールとして公開できる品質の Nostr runtime / data layer を設計する。

この spec は以下を満たすことを目的とする。

- local-first な読み取り体験
- relay 差分や同期戦略を利用者 API から極力隠蔽すること
- NIP 標準を core に載せつつ、plugin-first な拡張構造を維持すること
- Resonote 固有要件を plugin/preset として分離可能であること

## 2. 非目的

- 初版で全 NIP を first-class API にすること
- relay 実装差を完全吸収すること
- Resonote 固有 projection を core default に混ぜること
- すべての backend を初版で実装すること

## 3. 設計原則

### 3.1 Plugin-First Core

- core でも plugin 思想を主軸にする
- NIP 標準機能も built-in plugin / built-in registry entry 的に扱う
- core は器と契約を提供し、意味論は registry 主導で構成する

### 3.2 Store-First Reads

- すべての読み取りはまず `store` を見る
- `store` が必要なときだけ REQ を立てる
- source of truth は persistent store
- freshness authority は relay

### 3.3 Strategy Hidden by Default

- 利用者に見せるのは高レベルな意図だけに留める
  - backfill が必要か
  - live が必要か
  - projection が何か
- relay batching/chunking や Negentropy 利用有無は内部実装に閉じ込める

### 3.4 Query Axis と View Axis の分離

- 同期は source axis で行う
- 表示は projection axis で行う
- 非時系列表示でも、同期軸は query coverage として管理する

## 4. 公開 API

### 4.1 Core Surface

- `createRuntime(config)`
- `createSigner(config)`
- `Session.open({ runtime, signer })`
- `User.fromPubkey(pubkey, { runtime })`
- `Event.fromId(id, options?)`
- `Event.compose(input)`
- `Timeline.fromFilter(options)`
- `NostrLink.from(value, { runtime })`

### 4.2 Handle 共通 API

- `load()`
- `live()`
- `dispose()`

### 4.3 Timeline API

- `before(anchorOrItem, options?)`
- `after(anchorOrItem, options?)`
- `loadAround(anchor, options?)`
- `saveAnchor()`

### 4.4 Publish API

- `session.send(draft, options?)`
- `session.cast(draft, options?)`
- `session.setDefaultRelays({ read, write, inbox? })`

### 4.5 Registry / Plugin API

- `runtime.codecs.register(...)`
- `runtime.projections.register(...)`
- `runtime.relations.register(...)`
- `runtime.backfillPolicies.register(...)`
- `runtime.visibilityRules.register(...)`
- `runtime.links.register(...)`

## 5. 公開モデル

### 5.1 User

- 公開 API では `User` を aggregate root にする
- `Profile` は `User` 配下の関連として見せる
- 内部では kind:0 projection として別管理する

例:

```ts
const user = User.fromPubkey(pubkey);

user.pubkey;
user.profile.current;
user.relays.current;
user.follows.current;
user.customEmojis.current;
```

### 5.2 Event

`Event` は protocol/domain object として保つ。

```ts
event.id;
event.kind;
event.content;
event.tags;
event.pubkey;
event.createdAt;
event.author;
event.related.thread;
event.related.reactions;
event.related.contentRef;
```

### 5.3 TimelineItem

`Timeline` は `Event[]` ではなく `TimelineItem[]` を返す。

- `event`: 生 event
- `projection`: feed/projection 固有の派生値
- `state`: UI/ローカル解釈による状態
- `visibility`: 可視性理由
- `meta`: core/custom メタ

### 5.4 NostrLink

`NostrLink` は core API に含める。built-in 標準型は少なくとも以下を持つ。

- `profile`
- `event`
- `addressable-event`

`nrelay` は deprecated のため built-in には含めない。`content` のような独自 link type は plugin 側で追加する。

## 6. Handle モデル

### 6.1 一覧系 handle

- `items`
- `loading`
- `error`
- `stale`
- `source`
- `hasMore`

### 6.2 単体系 handle

- `current`
- `loading`
- `error`
- `stale`
- `source`

### 6.3 `source`

`source` はデータ来歴を表す。

- `cache`
- `relay`
- `merged`
- `optimistic`

### 6.4 `state` と `visibility`

`state` と `source` は分離する。

標準 `state`:

- `hidden`
- `deleted`
- `optimistic`

`muted` は state に置かず、visibility rule の理由として扱う。

`visibility`:

- `primaryReason`
- `flags`

## 7. Runtime 構成

runtime は以下の 5 つに分割する。

- `RelayManager`
  - relay 接続
  - relay 状態
  - REQ 実行
  - batch/chunk
- `SyncEngine`
  - backfill
  - Negentropy
  - resume
  - live 連携
- `Store`
  - 永続化
  - identity map
  - query
  - consistency
  - tombstone
- `ModelRegistry`
  - `User`, `Event`, `Timeline`, relation 定義
- `ProjectionEngine`
  - `TimelineItem` や custom projection の構築

## 8. Store / Cache / Sync

### 8.1 二段キャッシュ

- `MemoryStore`
- `PersistentStore`

`MemoryStore` は単なる cache ではなく以下を持つ runtime state manager とする。

- identity map
- inflight coordinator
- hot cache

`PersistentStore` は長期状態を保持する。

- event
- coverage
- tombstone
- relay capability
- projection index

### 8.2 読み取り順序

1. `MemoryStore`
2. `PersistentStore`
3. `SyncEngine / Relay`

### 8.3 Consistency 優先順位

1. `verified tombstone`
2. `optimistic local mutation`
3. `fresh relay-backed record`
4. `stale cached record`

Store が replaceable / addressable / deletion / optimistic の競合解決責任を持つ。

## 9. Query / Backfill / Coverage

### 9.1 Query API

raw Nostr filter に属するものは `filter` に入れてよい。

- `ids`
- `authors`
- `kinds`
- `since`
- `until`
- `limit`
- `search`
- `#<tag>` 系

ただし `since / until / limit` は query identity の hash には含めない。

### 9.2 2 種類の key

- `queryIdentityKey`
  - `kinds / authors / ids / #tag / projection / 本質条件`
- `fetchWindowKey`
  - `queryIdentityKey + since / until / limit / anchor / direction`

### 9.3 Backfill DSL

公開 v1 の `backfill` DSL:

- `preset`
- `window`
- `resume`

`resume` 候補:

- `none`
- `coverage-aware`
- `force-rebuild`

標準 preset 例:

- `none`
- `recent`
- `timeline-default`
- `thread`
- `notifications`
- `full-resume`

### 9.4 Coverage Schema

2 テーブル構成:

- `query_coverage`
- `relay_coverage`

`query_coverage` は query 系列全体、`relay_coverage` は relay ごとの実行結果を持つ。

## 10. Relay Selection / Outbox / Bootstrap

### 10.1 Bootstrap

- `DEFAULT_RELAYS` は bootstrap read relays
- bootstrap 時:
  1. `DEFAULT_RELAYS`
  2. `kind:10002` で user relay 解決
  3. session 既定 relay を更新

user relay が空または不正な場合は bootstrap relay を fallback として残す。

### 10.2 Session Relay API

```ts
session.setDefaultRelays({
  read: ['wss://relay1.example.com'],
  write: ['wss://relay2.example.com'],
  inbox: ['wss://relay3.example.com'] // optional
});
```

query 単位 relay は `append / replace` で適用する。

### 10.3 Outbox Model

relay 選択は `kind:10002` ベースの outbox model を内部 relay selection policy として使う。

- user の event を取得
  - user の write relays
- viewer 宛て通知/mention を取得
  - viewer の read relays
- publish
  - author の write relays
  - 必要に応じて tagged user の read relays

### 10.4 Temporary Hints

- `ncontent`
- `nevent`
- `nprofile`

などの relay hints は、その query だけの temporary relay として扱う。

- built-in link type の hint も、plugin が追加した link type の hint も、同じ temporary relay mechanism に載せる
- `ncontent` は built-in link type ではなく、plugin 追加 link の代表例として扱う

## 11. Publish / Auth / Optimistic

### 11.1 Session / Signer

- `User` は `pubkey` ベース identity
- `Session` は signer を持つ実行コンテキスト
- `Signer` は `nsec / extension / bunker / Nostr Connect` を吸収する

### 11.2 Publish API

- `cast(draft, options)`
  - fire-and-forget 寄り
  - publish handle を返す
- `send(draft, options)`
  - 完了判定まで await
  - publish result を返す

### 11.3 Completion Policy

runtime 共通概念として持つ。

- `all`
- `any`
- `majority`
- `ratio`

publish は ack ベース、sync/backfill は coverage ベースで評価する。

### 11.4 Publish Relay Policy

3 層:

- `author`
- `audience`
- `override`

デフォルト:

- `author: 'write-relays'`
- `audience: 'none'`

### 11.5 Publish Status

`cast()` handle status:

- `signing`
- `publishing`
- `partial`
- `confirmed`
- `failed`

`send()` result status:

- `partial`
- `confirmed`
- `failed`

`failed` の詳細は `failureReason` で表す。

加えて publish result / publish handle は、relay 実装差を失わないために raw reason を保持する。

- `relayReasonCode`
  - `OK` / `CLOSED` の machine-readable prefix を保持する
- `relayReasonMessage`
  - relay が返した人間向けメッセージを保持する

`failureReason` は正規化済みの上位概念、`relayReasonCode` / `relayReasonMessage` は relay 生値として扱う。

### 11.6 Optimistic Reconciliation

- publish ごとに `clientMutationId` を持つ
- store が `clientMutationId` を使って optimistic row を confirmed row に畳む
- `partial / failed` は短期保持し retry/discard を許す

### 11.7 Auth

- `NIP-42` relay auth は signer ではなく session/connection 側責務
- protected event (`["-"]`) は publish pipeline で auth と結びつける

## 12. Content / Comment / Emoji / Link

### 12.1 External Content IDs

`i / I` と `k / K` は `NIP-73` / `NIP-22` により core built-in plugin 寄りで扱う。

### 12.2 Comments

- `kind:1111` comment は `NIP-22` と整合させる
- note thread (`NIP-10`) とは別系統として扱う

### 12.3 Custom Emojis

`User.customEmojis` は core built-in relation として扱ってよい。

`customEmojis.current` は grouped-first:

```ts
type CustomEmojiSet = {
  ref: string;
  title?: string;
  image?: string;
  description?: string;
  emojis: Array<{
    shortcode: string;
    imageUrl: string;
    setAddress?: string;
  }>;
};
```

### 12.4 NostrLink

`NostrLink` は built-in に `profile / event / addressable-event` を持つ。独自 link は plugin で追加する。

## 13. Schema

### 13.1 Tombstone

`kind:5` は raw event と tombstone projection の二重保存を行う。

`tombstones` テーブル基本形:

- `targetEventId`
- `targetAddress`
- `targetKindHint`
- `deletedByPubkey`
- `deleteEventId`
- `createdAt`
- `verified`
- `reason`

`targetEventId` と `targetAddress` は排他的ではなく、`NIP-09` の対象表現に応じてどちらか、または両方を保持できる形にする。

client は tombstone 適用前に、少なくとも以下を必須で検証する。

- delete event author と target author の一致
- `e` 対象か `a` 対象かに応じた target 正規化
- `k` tag がある場合の kind hint 整合

### 13.2 Relay Capability Cache

`relay_capabilities` テーブル:

- `relayUrl`
- `negentropy`
- `lastCheckedAt`
- `source`
- `ttlUntil`

`negentropy` 値:

- `supported`
- `unsupported`
- `unknown`

### 13.3 Expiration

`expiration` tag は relay 任せにせず、client/store 側でも除外を適用する。

## 14. 拡張点

plugin に許すもの:

- `preset`
- `projection`
- `model / relation`
- `codec`
- `visibility rule`
- `optimistic update handler`
- `links`

plugin に許さないもの:

- request planner 内部アルゴリズム変更
- relay batching/chunking core ルール変更
- tombstone 整合性ルール変更
- store の基礎整合性ロジック変更

## 15. Built-in / Custom の境界

- NIP 標準は core に含めてよい
- ただし実装形は registry 主導に保つ
- Resonote 固有は plugin/preset 側へ分離する

default に混ぜない例:

- `ncontent`
- `position_ms`
- `playback-comments`
- podcast/bookmark resolver 系

## 16. Open Questions

- `NostrLink` の失敗表現をどこまで構造化するか
- relay capability の TTL 詳細
- optimistic / partial / failed row の GC 条件
- built-in plugin の初期同梱範囲
- `expiration` を debug/forensics 用に見せる経路を残すか

## 17. 参考メモ

設計過程の保存用メモは以下に残す。

- [2026-04-02-ndk-inspired-runtime-design.md](/root/src/github.com/ikuradon/Resonote/docs/superpowers/specs/2026-04-02-ndk-inspired-runtime-design.md)
