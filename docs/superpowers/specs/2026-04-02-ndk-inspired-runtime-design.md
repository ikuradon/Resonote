# NDK Inspired Runtime Design

## 目的

`@ikuradon/auftakt` 移行計画を廃止し、Resonote の要件に適合しつつ将来的に単独モジュールとして公開できる品質の Nostr runtime / data layer を再設計する。

このドキュメントは現時点で合意した方針の保存用メモであり、最終仕様ではない。

## このメモの使い方

- 会話ごとに決まったことを `決定ログ` に追記する
- 未決事項は `オープンクエスチョン` で管理する
- 方針が変わった場合は、古い案を消すのではなく `却下/保留` として残す
- 実装に入る前に、このメモから別途正式な仕様書へ昇格させる

## 現状認識

- `auftakt` の抽象は Resonote に対して低すぎ、REQ 分割・統合・購読完了待ち・fallback がアプリ側へ漏れた
- 一括置換の導入順も悪く、設計不一致が広範囲に波及した
- 要求整理が不十分で、ライブラリ選定基準も曖昧だった

## 決定ログ

### 2026-04-02 初回合意

- `auftakt` 移行計画は廃止し、Nostr runtime / data layer を再設計する
- NDK のような統合 runtime を目指す
- ただし公開 API は Resonote 固有に寄せすぎず、将来の TL クライアントにも使える形にする
- 永続層は `Dexie.js + IndexedDB`
- すべての読み取りはまず `store` を見る
- `store` が必要なときだけ REQ を立てる
- strategy は極力公開しない
- `Timeline.fromFilter(...)` は最初から reactive handle を返す
- `load()` と `live()` は分離する
- handle の `source` には `cache / relay / merged / optimistic` を含める
- 公開 API では `User` を aggregate root にし、`Profile` は `User` 配下の関連として見せる
- TL 表示用には `Event[]` ではなく `TimelineItem[]` を返す
- 独自 projection 値は `projection` 名前空間に載せる
- backfill は query coverage として扱い、coverage key は `filter + projection + policy` の hash を基本案とする
- anchor/cursor は `sortKey + id` で持つ
- `kind:5` は store レベルの tombstone として永続化する
- tombstone は projection 更新時反映を主軸にしつつ、query 時にも保険で適用する
- 昔の Twitter クライアントのような「前回見ていた位置から読む」体験を再現する
- `event.next()` ではなく timeline 依存の `before / after / loadAround / saveAnchor` を中心にする

### 2026-04-02 consistency model 合意

- consistency の優先順位は以下とする
  1. `verified tombstone`
  2. `optimistic local mutation`
  3. `fresh relay-backed record`
  4. `stale cached record`
- store が replaceable / addressable / deletion / optimistic の競合解決責任を持つ
- handle や UI は protocol 競合を意識せず、store が解決した「現在有効な record」を読む

### 2026-04-02 query/filter 合意

- raw Nostr filter に属するものは `filter` に入れてよい
  - `ids`
  - `authors`
  - `kinds`
  - `since`
  - `until`
  - `limit`
  - `search`
  - `#<tag>` 系
- ただし `since / until / limit` は query identity の hash には含めない
- hash は 2 種類に分ける
  - `queryIdentityKey`
    - 何を見たいかを識別する
    - `kinds / authors / ids / #tag / projection / 本質的条件` を含める
    - `since / until / limit / anchor / direction` は含めない
  - `fetchWindowKey`
    - 今回どの範囲を取得するかを識別する
    - `queryIdentityKey + since / until / limit / anchor / direction` を含める
- `backfill`, `projection`, `visibility`, `anchor`, `live`, `hydrate` など protocol filter ではないものは `filter` の外に出す

### 2026-04-02 plugin 境界合意

- plugin に許す拡張点は以下に限定する
  - `preset` 追加
  - `projection` 追加
  - `model / relation` 追加
  - `codec` 追加
  - `visibility rule` 追加
  - `optimistic update handler` 追加
- plugin はアプリ固有の意味論を追加する場所とする
- plugin には以下を許さない
  - request planner の内部アルゴリズム変更
  - relay batching/chunking の core ルール変更
  - tombstone 整合性ルール変更
  - store の基礎整合性ロジック変更

### 2026-04-02 runtime 責務境界合意

- runtime は以下の 5 つに分割する
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
    - Dexie 永続化
    - identity map
    - query
    - consistency
    - tombstone
  - `ModelRegistry`
    - `User`, `Event`, `Timeline` などのモデル/relation 定義
  - `ProjectionEngine`
    - `TimelineItem` や custom projection の構築
- `Store` は何でも屋にせず、projection は `ProjectionEngine` に分ける
- `RelayManager` は transport/connection に責務を限定し、同期方針は `SyncEngine` が持つ

### 2026-04-02 backfill policy DSL 合意

- 公開 v1 の `backfill` DSL は以下の 3 要素に絞る
  - `preset`
  - `window`
  - `resume`
- `resume` の候補値は以下を基本案とする
  - `none`
  - `coverage-aware`
  - `force-rebuild`
- `preset` は用途ベースで少数に絞る
  - 汎用ライブラリ標準例
    - `none`
    - `recent`
    - `timeline-default`
    - `thread`
    - `notifications`
    - `full-resume`
  - Resonote 固有のものは plugin 側へ置く
    - 例: `resonote-content-comments`
- preset は registry 経由で追加可能にする
- 将来ありうる拡張要素として以下を見越す
  - `direction`
  - `completion`
  - `freshness`
  - `budget`
- ただしこれらは公開 v1 には含めず、内部設計で見越すに留める

### 2026-04-02 codec 方針合意

- codec は単なる parser ではなく registry まで持つ
- codec の責務は以下に限定する
  - parse
  - normalize
  - minimal typed extraction
- codec には以下を持たせない
  - visibility 判定
  - relation 解決
  - feed projection 構築
  - sync policy
- codec registry は以下を満たす
  - kind ベース登録
  - tag/content decode helper を持てる
  - plugin から追加可能

### 2026-04-02 relation API 合意

- relation は plugin から追加可能にする
- ただし relation の返り値は必ず core の handle に統一する
- plugin は relation の意味論だけを追加する
  - 例: `User.bookmarks`, `Event.related.parent`
- `load / resolve / dispose` などのライフサイクル契約は core が握る
- relation API は公開拡張可能だが、実行モデルの一貫性は core が保証する

### 2026-04-02 projection builder 合意

- `TimelineItem` の projection 構築は単純 object 返却ではなく型付き builder で行う
- plugin 耐性のため、core 必須項目は builder メソッド経由でしか設定できないようにする
- 最小 API は以下を基本案とする
  - `build(event)`
  - `sortKey(value)`
  - `field(key, value)`
  - `state(partial)`
  - `meta(partial)`
  - `done()`
- `sortKey` は必須とし、`done()` 時に未設定なら失敗させる
- `position_ms` のような独自値は `field()` で `projection.*` に載せる
- `event` 本体や core 構造を plugin が壊せないようにする
- `meta` は `meta.core` と `meta.custom` に分ける
  - `meta.core`
    - core 予約領域
    - v1 では少なくとも `anchorKey` を持てるようにする
  - `meta.custom`
    - plugin / app 拡張領域
- flat な `meta` object にせず、reserved key 衝突を防ぐ

### 2026-04-02 Session / Signer 方針合意

- `User` は `pubkey` ベースの identity とする
- 書き込み可能な文脈は `Session` に分離する
- `Session` は `Signer` を持つ実行コンテキストとする
- `Signer` は `rx-nostr` の思想を継承し、`nsec / extension / bunker / Nostr Connect` を吸収する抽象とする
- 読み取り API と書き込み API は層を分ける
  - read core
    - `Runtime`, `Store`, `User`, `Event`, `Timeline`
  - write/auth core
    - `Signer`, `Session`, `publish`, `optimistic update`
- `pubkey` だけでは read-only 文脈に留め、署名が必要な処理は `Session.open({ signer })` 側へ寄せる

### 2026-04-02 publish pipeline 方針合意

- `Session` は「誰として書くか」を表す
- `Signer` は署名だけを担当する
- `Runtime` は publish pipeline 全体を実行する
- publish の内部責務は以下を含む
  - draft から unsigned event を構築する
  - signer で署名する
  - 必要なら optimistic event を store に先行反映する
  - relay publish を実行する
  - ack を受けて store 上の状態を確定させる
  - projection invalidation / rebuild を行う
- delete も通常 publish と同じ pipeline で扱い、`kind:5` を tombstone ルールへ流す

### 2026-04-02 custom emoji relation 合意

- `emoji-sets` は `User.customEmojis` という composite relation として扱う
- `load()` 時に以下を段階的に解決する
  - emoji list
  - 参照先の addressable emoji set 群
- batch/chunk は core 側で吸収し、公開 API には出さない
- `customEmojis.current` は flat 一覧ではなく set 単位構造を正とする
- flat 利用は補助 API へ逃がす
  - 例: `customEmojis.flat()`, `customEmojis.find(':cat:')`
- grouped-first にすることで `emoji-kitchen-mart` のような grouped UI に載せやすくする
- `customEmojis.current` の最小形は以下を基本案とする
  - `ref`
  - `title?`
  - `image?`
  - `description?`
  - `emojis`
- `emojis` の各要素は少なくとも以下を持つ
  - `shortcode`
  - `imageUrl`
  - `setAddress?`
- `source` や `loading` のような状態は handle 側が持ち、`current` は純データに留める

### 2026-04-02 state / visibility 合意

- `source` と `state` は分ける
  - `source`
    - データ来歴を表す
    - `cache / relay / merged / optimistic`
  - `state`
    - UI/ローカル解釈による item 状態を表す
- core の標準 `state` は最小限に絞る
  - `hidden`
  - `deleted`
  - `optimistic`
- `muted` は core state にしない
  - mute は visibility rule の一理由に過ぎず、block/CW/plugin rule などと同列に扱う
- 理由情報は `visibility` 側へ分離する
  - `visibility.primaryReason`
  - `visibility.flags`
- 通常 UI は `state.hidden` だけ見ればよく、理由が必要な UI だけ `visibility` を読む

### 2026-04-02 publish API 合意

- `rx-nostr` の思想は継承するが、publish API はそのまま踏襲せず改良する
- publish は `send` と `cast` を分ける
  - `cast(draft, options)`
    - fire-and-forget 寄り
    - optimistic 反映を先行しやすい
    - publish handle を返す
  - `send(draft, options)`
    - publish 完了判定まで await する
    - ack/確定状態を返す
- `send / cast` は `Session` 配下に置く
  - 例: `session.send(draft, ...)`, `session.cast(draft, ...)`

### 2026-04-02 completion policy 合意

- relay の部分失敗を前提に、完了判定は policy 化する
- `completion policy` は publish 専用ではなく runtime 共通概念として持つ
- ただし評価指標は用途ごとに分ける
  - publish
    - ack ベース
  - sync/backfill
    - coverage ベース
- v1 の候補値は以下を基本案とする
  - `all`
  - `any`
  - `majority`
  - `ratio`
- `ratio` は閾値を持てるようにする
  - 例: `minSuccessRate: 0.6`

### 2026-04-02 Negentropy fallback 合意

- `Negentropy` は必須前提にしない
- `SyncEngine` は relay ごとの capability を見て実行手段を切り替える
  - 対応 relay
    - Negentropy を優先する
  - 非対応 relay
    - `nostr-fetch` / 通常 REQ にフォールバックする
  - 不明 relay
    - 初回は非対応寄りに扱う
- relay capability は `SyncEngine` が cache する
- backfill policy は維持し、実行手段だけ切り替える
- `Negentropy` と通常 fetch の結果は同じ query coverage に合流させる

### 2026-04-02 publish return shape 合意

- `cast()` は publish handle を返す
  - 途中状態を reactive に追えるようにする
  - 主な用途は UI / fire-and-forget 寄りの publish
- `send()` は await 後の publish result を返す
  - 主な用途は手続き処理 / テスト / 厳密な完了待ち
- `cast()` の handle には以下を含める
  - `event`
  - `status`
  - `progress`
  - `error`
- `send()` の result には以下を含める
  - `event`
  - `status`
  - `acceptedRelays`
  - `failedRelays`
  - `successRate`

### 2026-04-02 relay capability cache 合意

- relay capability は `SyncEngine` 管轄にする
- capability 判定は 3 層で行う
  - `static hint`
  - `handshake/probe`
  - `observed result`
- 優先順位は以下とする
  1. `observed result`
  2. `static hint`
  3. `handshake/probe`
- capability は固定真実ではなく期限付き観測値として扱う
- 最低限 `negentropy` について以下を持てるようにする
  - `supported`
  - `unsupported`
  - `unknown`
- `lastCheckedAt` と `source` を持ち、一定期間後の再評価を可能にする

### 2026-04-02 relay set / bootstrap flow 合意

- `DEFAULT_RELAYS` は bootstrap read relays として扱う
- session は `setDefaultRelays(...)` を何度でも呼べるようにする
- bootstrap 時は以下の順で relay set を構築する
  1. `DEFAULT_RELAYS` で開始する
  2. `kind:10002` を読んで user relay を解決する
  3. 以後の session 既定 relay を user relay ベースへ更新する
- user relay が空または不正な場合は bootstrap relay を fallback として残す
- query 単位では relay を追加/上書きできるようにする
  - `mode: 'append'`
  - `mode: 'replace'`
- `ncontent` の relay は恒久設定に混ぜず、その query だけ temporary read relay として追加する
- `nevent` / `nprofile` などの relay hints も同じ temporary relay の仕組みに乗せる

### 2026-04-02 outbox model 方針合意

- relay 選択は `kind:10002` を前提にした outbox model を取り込む
- ただし公開 API の主役にはせず、relay selection policy として内部化する
- 基本方針は以下とする
  - ある user の event を取得したい
    - その user の write relays を優先する
  - viewer 宛て通知/mention を取得したい
    - viewer の read relays を優先する
  - publish したい
    - author の write relays を優先する
    - tagged users の read relays は必要に応じて加える
- relay set の階層は以下とする
  1. bootstrap relays
  2. user relays (`kind:10002`)
  3. temporary hint relays (`ncontent` / `nevent` / `nprofile`)
- outbox model は `DEFAULT_RELAYS -> user relays -> temporary hint relays` の流れに統合する

### 2026-04-02 session relay API 合意

- `Session.setDefaultRelays(...)` は何度でも呼べるようにする
- relay set は単純配列ではなく `read / write` を分けた object で表す
- 基本形は以下を想定する

```ts
session.setDefaultRelays({
  read: ['wss://relay1.example.com'],
  write: ['wss://relay2.example.com'],
  inbox: ['wss://relay3.example.com'] // optional
});
```

- query 単位 relay は session 既定 relay の上に `append / replace` で適用する
- bootstrap 時は `DEFAULT_RELAYS` をこの API に流し込み、その後 user relay 解決結果で更新する
- `inbox` は v1 から optional で持てるようにし、`NIP-17` / `10050` 拡張の後方互換を確保する

### 2026-04-02 publish relay policy 合意

- publish relay policy は以下の 3 層に分ける
  - `author`
  - `audience`
  - `override`
- `author` は作者自身のどこへ publish するかを表す
  - 基本は `write-relays`
- `audience` は関連 user へどこまで広げるかを表す
  - 例: `none`, `tagged-read-relays`
- `override` はその publish だけ強制追加/置換する relay を表す
  - 例: `mode: 'append'`, `mode: 'replace'`
- v1 のデフォルトは以下を基本案とする
  - `author: 'write-relays'`
  - `audience: 'none'`
- mention/notification を強めたいケースでは `tagged-read-relays` を明示的に使う

### 2026-04-02 publish status 合意

- `cast()` の publish handle の `status` は以下を基本案とする
  - `signing`
  - `publishing`
  - `partial`
  - `confirmed`
  - `failed`
- `send()` の result の `status` は最終状態に絞る
  - `partial`
  - `confirmed`
  - `failed`
- `failed` は大分類に留め、詳細理由は別フィールドへ分離する
  - `failureReason`
- v1 の `failureReason` 候補は以下を基本案とする
  - `signer-unavailable`
  - `signer-rejected`
  - `invalid-event`
  - `no-write-relays`
  - `publish-timeout`
  - `all-relays-failed`
  - `completion-threshold-not-met`

### 2026-04-02 optimistic reconciliation 合意

- optimistic と confirmed の reconcile は `clientMutationId` を軸に行う
- publish ごとに runtime が内部で以下を持つ
  - `clientMutationId`
  - `draft`
  - `optimistic event row`
- relay ack / completion policy の結果に応じて、store が `clientMutationId` を使って optimistic row を confirmed row へ畳む
- publish 状態遷移の基本案
  - `signing`
  - `publishing`
  - `partial`
  - `confirmed`
  - `failed`
- `partial` / `failed` は短期保持し、retry/discard 可能にする
- 古い optimistic / partial / failed rows は GC 対象にできるようにする

### 2026-04-02 coverage schema 合意

- coverage は 2 テーブル構成を基本案とする
  - `query_coverage`
  - `relay_coverage`
- `query_coverage` は query 系列全体の状態を持つ
  - 例:
    - `queryIdentityKey`
    - `filterBase`
    - `projectionKey`
    - `policyKey`
    - `status`
    - `windowSince`
    - `windowUntil`
    - `lastSyncedAt`
- `relay_coverage` は relay ごとの実行結果を持つ
  - 例:
    - `fetchWindowKey`
    - `queryIdentityKey`
    - `relayUrl`
    - `sinceCovered`
    - `untilCovered`
    - `status`
    - `method`
    - `lastCheckedAt`
- 公開 API は query 単位、内部実行は relay 単位なので、1 テーブルに混ぜず 2 層で保持する

### 2026-04-02 tombstone schema 合意

- tombstone は event 本体とは別テーブルで持つ
- `kind:5` は raw event と tombstone projection の二重保存を行う
- `tombstones` テーブルの基本形は以下を想定する
  - `targetEventId`
  - `deletedByPubkey`
  - `deleteEventId`
  - `createdAt`
  - `verified`
  - `reason`
- `verified` は削除適用可否の評価結果を表す
- query / projection では `verified = true` の tombstone を適用する
- event row に単純な `deleted` フラグだけを混ぜず、削除事実は独立した projection として扱う

### 2026-04-02 relay capability cache schema 合意

- relay capability は coverage と分けて専用テーブルで持つ
- `relay_capabilities` テーブルの基本形は以下を想定する
  - `relayUrl`
  - `negentropy`
  - `lastCheckedAt`
  - `source`
  - `ttlUntil`
- `negentropy` は以下を基本値とする
  - `supported`
  - `unsupported`
  - `unknown`
- capability は relay 自体の属性であり、query/window 単位の `relay_coverage` とは分ける
- `ttlUntil` を超えたら再評価可能にし、能力を永久固定しない

### 2026-04-02 NostrLink 方針合意

- `NostrLink` は core API に含める
- `npub / nprofile / note / nevent / ncontent` などを同じ入口で扱えるようにする
- `NostrLink` は拡張可能にし、独自 link type は registry 経由で追加できるようにする
- `ncontent` は core 特例ではなく `NostrLink` の拡張 link type として扱う
- route 解決や content/navigation 解決も `NostrLink.from(...)` を統一入口にできるようにする
- core built-in の `current` union は少なくとも以下を含む
  - `profile`
  - `event`
  - `addressable-event`
- `relay` (`nrelay`) は deprecated のため core built-in には含めない
- `content` のような独自 link type は plugin 側で追加する

### 2026-04-02 backend / memory cache 方針合意

- backend は分ける
  - `runtime-core`
  - `storage-backend`
  - `relay-backend`
  - `app/preset`
- `IndexedDB` は core に直結させず persistent store backend として扱う
- cache は二段構成を前提にする
  - `MemoryStore`
  - `PersistentStore`
- `MemoryStore` は単なる値キャッシュではなく、以下を含む runtime state manager とする
  - `identity map`
  - `inflight coordinator`
  - `hot cache`
- `PersistentStore` は app 再起動後の復元と長期状態を担当する
  - event
  - coverage
  - tombstone
  - relay capability
  - projection index
- 読み取りは以下の順で解決する
  1. `MemoryStore`
  2. `PersistentStore`
  3. `SyncEngine / Relay`

### 2026-04-02 Resonote custom separation 合意

- Resonote 固有機能は default API / default registry に混ぜない
- core は汎用の器だけを持ち、Resonote 固有の意味論は plugin/preset 側へ完全分離する
- default に混ぜない対象の例
  - `ncontent`
  - `resonote-content-comments`
  - `playback-comments`
  - `position_ms`
  - podcast/bookmark resolver 系
  - Resonote 前提の `customEmojis` 解決
- `NostrLink` は core に含めるが、default link type は汎用的なものに留める
- `content` link のような独自 link type も plugin 側へ寄せる

### 2026-04-02 plugin-first core 方針合意

- core でも plugin 思想を主軸にする
- NIP 標準機能も「core にハードコードされた特例」ではなく、built-in plugin / built-in registry entry に近い形で扱う
- core の責務は主に以下に留める
  - plugin を載せる器
  - lifecycle / consistency / handle 契約
  - sync / relay / store / projection の基盤
- NIP 標準機能は core に含めてよいが、実装形は plugin 的に差し替え/追加可能な構造を保つ
- `customEmojis` のような NIP 標準 relation は core に含めてよい
- Resonote 固有機能だけを plugin に逃がすのではなく、default も含めて registry 主導で構成する

### 2026-04-02 NIP 全体俯瞰で追加検討が必要と判明した点

- `NIP-73` により external content IDs は標準化されている
  - `i` / `I` タグを使う content 参照は Resonote 独自ではなく、core で扱う余地がある
  - `ncontent` 自体は独自拡張でも、`ContentRef` / external content ID の概念は core に寄せうる
- `NIP-22` により Comment は `1111` と `A / E / I / K / P` タグを持つ標準文脈がある
  - comment/thread/content root の relation 設計は NIP-22 と整合させる必要がある
- `NIP-17` により DM 用 relay (`10050`) は通常の read/write relay と別レイヤに分ける必要がある
- `NIP-42` により relay 認証は signer ではなく session/connection 側の責務として明示した方がよい
- `NIP-45` により `COUNT` は optional capability として認識するが、relay 実装状況を踏まえて first-class API 前提にはしない
- `NIP-46` により remote signer は core の `Signer` 抽象に正式に含めてよい
- `NIP-11` の `supported_nips` や relay 制限値は capability cache の将来拡張先として見越す

### 2026-04-02 NIP-22 / 51 / 73 / 77 反映方針

- external content IDs (`i / I` と `k / K`) は Resonote 独自ではなく、core built-in plugin 寄りで扱う
- `Comment` / comment thread は `NIP-22` と整合する形で設計し、`NIP-10` ベースの note thread とは別系統として扱う
- `User.customEmojis` は `NIP-30` / `NIP-51` に基づく core built-in relation として扱ってよい
- relay set は将来的に `read / write` だけでなく `inbox` (`10050`) 系統も見越して拡張可能にする
- `NIP-77` は event transfer そのものではなく差分検出プロトコルであることを明示し、transfer は `REQ` / `EVENT` 側で行う前提を保つ
- `COUNT` は optional capability として存在を認識するが、relay 実装状況を踏まえ、設計の前提や first-class public API にはしない

### 2026-04-02 NIP-09 / 17 / 19 / 30 / 31 / 40 / 70 反映方針

- `NostrLink` の built-in 標準型には `addressable-event` を含める
- `tombstone` schema は将来的に以下を持てる形を見越す
  - `targetAddress`
  - `targetKindHint`
- `kind:5` 適用時は author 一致の client-side 検証を必須前提にする
- relay set は将来的に `inbox` 系統を正式に持てるようにする
- `customEmojis` と `emoji-set-address` は core built-in 扱いで問題ない
- unknown custom event は `alt` tag を fallback 表示に使えるようにする
- `expiration` tag は relay 任せにせず、client/store 側でも除外を適用する
- protected event (`[\"-\"]`) は publish pipeline で `NIP-42` 認証と結びつけて扱えるようにする

### 2026-04-02 NIP-22 / NIP-73 / NIP-45 / NIP-77 を踏まえた補強

- `ContentRef` / external content ID は plugin 専用ではなく core built-in 寄りに扱う
  - `i / I` と `k / K` は `NIP-73` / `NIP-22` に基づく標準概念として扱う
  - `ncontent` 自体は独自拡張でも、`ContentRef` の概念は core に含めてよい
- comment thread は `NIP-22` ベースで別系統として扱う
  - `kind:1` note thread (`NIP-10`) と `kind:1111` comment thread (`NIP-22`) を混ぜない
- relay set は将来 `inbox` 系統を持てる前提にする
  - `NIP-17` / `10050` により DM 受信用 relay は通常の `read / write` と別
- `COUNT` は core 補助 API 候補として正式に見越す
  - follower count / reaction count / comment count の軽量取得に使う
- `NIP-77` は event transfer ではなく差分検出であることを明記する
  - Negentropy は `NEG-*` により IDs の差分を得る
  - 実イベント transfer は `REQ` / `EVENT` で別に行う

## 目指す方向

- NDK のような統合 runtime を目指す
- ただし公開 API は Resonote 固有に寄りすぎず、将来の TL クライアントにも使える形にする
- すべての読み取りはまず `store` を見る
- `store` が必要なときだけ REQ を立てる
- strategy は極力利用者へ見せない
- 利用者が指定するのは高レベルな意図に留める
  - backfill が必要か
  - live が必要か
  - projection が何か

## 永続層

- 永続層は `Dexie.js + IndexedDB`
- local store が source of truth
- relay は freshness authority

## API の基本方針

- `Timeline.fromFilter(...)` は最初から reactive handle を返す
- `rune()` は不要
- ただし内部実装では query plan と handle を分離する
- `fromFilter()` は宣言のみで REQ は投げない
- `load()` で初回解決
- `live()` で継続購読開始
- 必要なら sugar として `loadAndLive()` は追加可能

## Handle の基本形

一覧系 handle:

- `items`
- `loading`
- `error`
- `stale`
- `source`
- `hasMore`

単体系 handle:

- `current`
- `loading`
- `error`
- `stale`
- `source`

`source` の値:

- `cache`
- `relay`
- `merged`
- `optimistic`

## User / Profile

- 公開 API では `User` を aggregate root にする
- `Profile` は `User` 配下の関連として見せる
- ただし内部では kind:0 projection として別管理する

例:

```ts
const user = User.fromPubkey(pubkey);

user.pubkey;
user.profile.current;
user.profile.loading;
user.profile.source;
user.relays.current;
user.follows.current;
```

## Event / TimelineItem

- `Event` は protocol/domain object として保つ
- TL 表示用には `Event[]` ではなく `TimelineItem[]` を返す
- `TimelineItem` は feed/projection object

`Event` の基本:

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
```

`TimelineItem` の役割:

- feed ごとの並び順

## 通しの疑似コード

```ts
// runtime bootstrap
const runtime = createRuntime({
  storage: {
    driver: 'dexie',
    database: 'resonote'
  },
  relays: {
    read: ['wss://r1.example', 'wss://r2.example'],
    write: ['wss://r1.example']
  }
});

// plugin registration
runtime.codecs.register('resonote-comment', {
  kinds: [1111],
  decode(event) {
    return {
      positionMs: event.tags.find(([name, key]) => name === 'position' && key === 'ms')?.[2]
        ? Number(event.tags.find(([name, key]) => name === 'position' && key === 'ms')?.[2])
        : null,
      contentRef:
        event.tags.find(([name]) => name === 'i')?.[1] ??
        event.tags.find(([name]) => name === 'I')?.[1] ??
        null
    };
  }
});

runtime.backfillPolicies.register('resonote-content-comments', {
  window: { sinceDays: 7, maxEvents: 500 },
  resume: 'coverage-aware'
});

runtime.projections.register('playback-comments', {
  build(ctx) {
    const decoded = ctx.event.decoded('resonote-comment');
    const sortKey = decoded?.positionMs ?? ctx.event.createdAt;

    return ctx.item
      .sortKey(sortKey)
      .field('positionMs', decoded?.positionMs ?? null)
      .state({
        muted: ctx.viewer.mutes.matchesEvent(ctx.event),
        fromFollow: ctx.viewer.follows.has(ctx.event.pubkey),
        fromWot: ctx.viewer.wot.has(ctx.event.pubkey)
      })
      .meta({
        anchorKey: `${sortKey}:${ctx.event.id}`
      })
      .done();
  }
});

runtime.relations.register('User', {
  bookmarks(user, ctx) {
    return ctx.records.single({
      kind: 'bookmark-list',
      owner: user.pubkey
    });
  }
});

// session bootstrap
const signer = createSigner({
  type: 'extension'
});

const session = await Session.open({
  runtime,
  signer
});

await session.load();

// session load internally resolves only high-level records
session.user.profile.current;
session.user.relays.current;
session.user.follows.current;
session.user.mutes.current;
session.user.bookmarks.current;

// content timeline
const timeline = Timeline.fromFilter({
  runtime,
  filter: {
    kinds: [1111, 7, 5, 17],
    '#I': [contentId],
    '#i': [contentId]
  },
  backfill: {
    preset: 'resonote-content-comments'
  },
  projection: 'playback-comments',
  visibility: {
    muteList: session.user.mutes,
    wot: session.user.follows.wot
  }
});

await timeline.load();
timeline.live();

// UI usage
for (const item of timeline.items) {
  item.event.content;
  item.event.author.pubkey;
  item.event.author.profile.current;
  item.event.author.profile.loading;
  item.projection.positionMs;
  item.state.fromWot;
  item.state.muted;
}

// restore previous reading position
const savedAnchor = timeline.saveAnchor();
const resumed = Timeline.fromFilter({
  runtime,
  filter: {
    kinds: [1111, 7, 5, 17],
    '#I': [contentId],
    '#i': [contentId]
  },
  backfill: {
    preset: 'resonote-content-comments'
  },
  projection: 'playback-comments',
  anchor: savedAnchor
});

await resumed.loadAround(savedAnchor, { before: 30, after: 20 });
resumed.live();

// directional paging on projection order
await resumed.before(resumed.items.at(-1), { limit: 50 });
await resumed.after(resumed.items[0], { limit: 20 });

// lazy relation resolution
const parent = timeline.items[0].event.related.parent;
await parent.load();

// optimistic publish
const draft = Event.compose({
  kind: 1111,
  content: 'hello',
  tags: [['i', contentId]]
});

await session.publish(draft, {
  optimistic: true
});

// store-level deletion handling
// if kind:5 arrives while SPA is down:
// - next load syncs delete event
// - tombstone is persisted
// - projection excludes deleted item
// - thread-like views may render deleted placeholder instead
```

内部フローの要点:

- `Timeline.fromFilter()` は handle を作るだけで REQ は投げない
- `load()` 時にまず `Store` が cache / tombstone / coverage を見る
- 不足時だけ `SyncEngine` が backfill 要否を判断する
- `RelayManager` が batch/chunk を含めて REQ を実行する
- 取得結果は `Store` が永続化し、整合性を解決する
- `ProjectionEngine` が `TimelineItem` を構築する
- relation は必要になるまで lazy のまま維持する
- 表示用 projection
- visibility / optimistic 等の状態

## Projection

- `position_ms` のような独自設計を正式に載せられる API が必要
- 独自値は `projection` 名前空間に置く

例:

```ts
item.projection.positionMs;
item.projection.sortKey;
item.projection.score;
```

## Lazy 解決

- object を辿っただけでは REQ を投げない
- 実際に `load()` や handle 解決が必要になった時だけ `store` が解決する
- filter で落ちる item の先まで取りにいかない

## load / live

- `load()` と `live()` は分離する
- 理由:
  - 初期表示と継続購読は責務が違う
  - 無駄な REQ を防ぎやすい
  - テストしやすい

## backfill の考え方

- 表示順が時系列でなくても、同期軸は source axis として別に持つ
- 同期は source axis
- 表示は projection axis
- `contentId` 固有ではなく、汎用ライブラリでは query coverage として扱う
- coverage key は `filter + projection + policy` の hash を推す

## anchor / cursor

- 昔の Twitter クライアントのような「前回見ていた位置から読む」体験を再現可能にする
- `event.next()` ではなく timeline 依存の API にする

候補:

```ts
timeline.before(item);
timeline.after(item);
timeline.loadAround(anchor);
timeline.saveAnchor();
```

- anchor は `id` だけでなく `sortKey + id` を持つ

```ts
type TimelineAnchor = {
  id: string;
  sortKey: number | string;
};
```

## deletion / kind:5

- `kind:5` は store レベルの tombstone として扱う
- tombstone は永続化必須
- SPA 非起動時でも、次回同期時に deletion を取り込んで整合回復する
- 物理削除ではなく論理削除を主とする
- projection 更新時に反映するのを主軸にしつつ、query 時にも tombstone を保険で適用する

## 拡張点

公開拡張点として検討中のもの:

- `projection`
- `policy`
- `plugin / preset`
- `model / relation`
- `codec`
- `optimistic update`

ただし request planning の内部アルゴリズムは core で握る

## Resonote Flow のイメージ

```ts
const session = Session.login(pubkey);
await session.load();

const timeline = Timeline.fromFilter({
  kinds: [1111, 7, 5, 17],
  filter: {
    '#I': [contentId],
    '#i': [contentId]
  },
  backfill: {
    policy: 'content-comments'
  },
  projection: 'playback-comments'
});

await timeline.load();
timeline.live();
```

TL 上では:

```ts
timeline.items[0].event.content;
timeline.items[0].event.author.profile.current;
timeline.items[0].projection.positionMs;
```

## オープンクエスチョン

### 優先度高

### 優先度中

- `Timeline.fromFilter()` の filter に raw Nostr filter をどこまで露出するか
- `loadAndLive()` を sugar として最初から含めるか
- projection builder を単純 object 返却にするか、型付き builder にするか
- relation API をどこまで公開拡張可能にするか

### 優先度低

- package 分割の単位
- 名前空間設計
- デバッグ用メタデータの公開範囲

## 次回以降に更新する項目

- 今回新しく決まった設計方針
- 却下した案とその理由
- 新たに見つかった要件
- API 疑似コードの更新
- オープンクエスチョンの優先度見直し
