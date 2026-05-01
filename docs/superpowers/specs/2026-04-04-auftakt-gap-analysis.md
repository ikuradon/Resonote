# auftakt Spec/Plan Gap Analysis (2026-04-04)

全 spec (4本) + 全 plan (8本) の全セクションを、実装コード全ファイルと 1:1 で突き合わせた結果。
別機能による補完調査済み。

## 補完調査サマリ

47 件中 **21 件が別コードパスで補完済み** → 残存 gap は **27 件** (高 5 / 中 14 / 低 8)。
A1 は設計変更により gap ではなくなったが、代わりに A6 (signer re-export 欠落) を追加。

| 判定                | 件数 | 説明                                      |
| ------------------- | ---- | ----------------------------------------- |
| 補完済み (削除)     | 16   | 別機能で完全に補われている                |
| 補完済み (実害なし) | 4    | stub だが呼び出し元がない等               |
| 設計変更により解消  | 1    | A1: createSigner → 個別 signer 方式に変更 |
| 残存 (実 gap)       | 26   | 要対応                                    |

---

## A. Runtime / Factory (5件)

### ~~A1. `createSigner()` が no-op stub~~ [解消]

- **設計変更**: rx-nostr と同等の方針で、抽象的な `createSigner()` ではなく個別 signer (`nip07Signer`, `seckeySigner`, `noopSigner`) を直接渡す方式に変更。`createSigner` は後方互換のために残存しているが使用されない
- **代替**: `core/signers/nip07-signer.ts`, `core/signers/seckey-signer.ts`, `core/signers/noop-signer.ts` が具象実装を提供
- **残存問題**: → A6 へ移動

### A6. 個別 signer が `auftakt/index.ts` から re-export されていない [低]

- **経緯**: A1 の設計変更により `createSigner` の代わりに個別 signer を public API とする方針だが、`auftakt/index.ts` に signer の re-export がない
- **実装**: `core/signers/index.ts` は `nip07Signer`, `seckeySigner`, `noopSigner` を export しているが、`auftakt/index.ts` からは未参照
- **影響**: 利用者が `$shared/nostr/auftakt` から signer にアクセスできず、`$shared/nostr/auftakt/core/signers` という内部パスを直接 import する必要がある

### A2. `Event.compose()` が no-op stub [低]

- **Spec**: §4.1 — `Event.compose(input)` で draft event を構築
- **実装**: `core/models/event.ts` — `static compose<TInput>(input: TInput) { return input; }` — 入力をそのまま返す
- **影響**: draft building, tag normalization, templating ロジックがない。利用者が自分で event 構造を組み立てる必要がある

### A3. `createRuntime()` に `retry` / `idleTimeout` / `temporaryRelayTtl` / `connect` config の pass-through がない [中]

- **Spec**: Relay Lifecycle §4.1 Configuration — `createRuntime({ retry: { strategy, initialDelay?, maxDelay?, maxCount? }, idleTimeout?, temporaryRelayTtl?, connect? })`
- **実装**: `core/runtime.ts:11-33` — config に `retry`, `idleTimeout`, `temporaryRelayTtl`, `connect` が宣言されておらず、`DefaultRelayManager` にも渡されない
- **影響**: retry strategy, idle timeout, WebSocket adapter injection がすべてハードコードされたデフォルトから変更不能

### A4. `createRuntime()` が `Nip11Registry` を生成・配線しない [高]

- **Spec**: Relay Lifecycle §4.3 — NIP-11 fetch は relay との初回接触時に並行実行し、`max_subscriptions` / `max_filters` を適用
- **実装**: `core/runtime.ts` — `Nip11Registry` を一切 import/生成していない。`DefaultRelayManager` に `nip11Registry: undefined` で渡される
- **影響**: production で NIP-11 slot limit が適用されない。`probeCapabilities()` が常に `'unknown'` を返す。`SlotCounter` は初期値 10 のまま relay の実制限を反映しない

### A5. `createRuntime()` が `TemporaryRelayTracker` を生成・配線しない [中]

- **Spec**: Relay Lifecycle §4.1 — `dormant` temporary relay は `temporaryRelayTtl` (default 5分) 後に `terminated` に昇格
- **実装**: `core/runtime.ts` — `TemporaryRelayTracker` を一切 import/生成していない。`DefaultRelayManager` に `temporaryRelayTracker: undefined` で渡される
- **影響**: hint relay が lazy mode にならず、全 relay が `lazy-keep` で動作。dormant TTL cleanup が動かない。また `RelayManager` 内で relay が `dormant` に遷移しても `tracker.markDormant()` を呼ぶコードがない

---

## B. Handle / 公開 API (8件)

### B1. `Event.fromId` handle に `live()` がない [中]

- **Spec**: §4.2 Handle 共通 API — すべての Handle に `load()`, `live()`, `dispose()` がある
- **実装**: `core/models/event.ts` — `Event.fromId()` が返す handle に `load()` はあるが `live()` がない
- **影響**: 単体イベントの live 更新（削除検知、reaction 追加など）ができない

### B2. `Event.fromId` handle に `dispose()` がない [低]

- **Spec**: §4.2 Handle 共通 API
- **実装**: top-level event handle に `dispose()` がない（`event.related.*` には各々 `dispose()` がある）
- **影響**: event handle のリソースリークはないが API 契約違反

### B3. `NostrLink.from` handle に `dispose()` がない [低]

- **Spec**: §4.2 Handle 共通 API
- **実装**: `core/models/nostr-link.ts` — `createLinkHandle` 返り値に `dispose()` がない
- **影響**: 同上

### B4. `Timeline.before/after/loadAround` に `options?` パラメータがない [低]

- **Spec**: §4.3 — `before(anchorOrItem, options?)`, `after(anchorOrItem, options?)`, `loadAround(anchor, options?)`
- **実装**: `core/handles/timeline-handle.ts` — 3メソッドとも第2引数がない
- **影響**: pagination の挙動をカスタマイズできない（limit 指定等）

### B5. `ListHandle.hasMore` が pagination で更新されない [中]

- **Spec**: §6.1 — `hasMore` フィールドはページネーションの残存を示す
- **実装**: `timeline-handle.ts` — `hasMore = false` で初期化され、`before()` / `after()` で一切更新されない
- **影響**: UI が「もっと読み込む」ボタンの表示/非表示を判断できない

### B6. `source = 'optimistic'` が型にあるが実際に設定されない [低]

- **Spec**: §6.3 — `source` は `cache / relay / merged / optimistic` の 4 値
- **実装**: `types.ts` に `DataSource = 'cache' | 'relay' | 'merged' | 'optimistic'` があるが、Handle のどこにも `source = 'optimistic'` への代入がない
- **影響**: UI が optimistic データの来歴を表示できない

### B7. `state.deleted` / `state.optimistic` が設定されない [中]

- **Spec**: §6.4 — 標準 state は `hidden`, `deleted`, `optimistic`
- **実装**: `TimelineItemState` interface に 3 フィールドあるが、`TimelineItemBuilder.done()` は `state: {}` を返し、`applyVisibility()` は `hidden` のみ設定
- **影響**: 削除済みアイテムや optimistic アイテムを UI で区別できない

### B8. Registry API の名前空間が spec と異なる [低]

- **Spec**: §4.5 — `runtime.codecs.register(...)` 等、runtime 直下
- **実装**: `runtime.registry.registerCodec(...)` 等、`registry` 経由 + メソッド名が `registerX` 形式
- **影響**: API surface shape の差異のみ。機能的には同等

---

## C. Store / Query / Consistency (8件)

### C1. `ProjectionEngine` が runtime に存在しない [中]

- **Spec**: §7 — runtime は `RelayManager, SyncEngine, Store, ModelRegistry, ProjectionEngine` の 5 分割
- **実装**: `createRuntime()` の返り値に `projectionEngine` プロパティがない。`TimelineItemBuilder` が projection を構築するが、独立コンポーネントとして runtime に露出していない
- **影響**: projection 構築ロジックの plugin 差し替えや拡張がしにくい

### C2. PersistentStore に `projectionIndex` テーブルがない [低]

- **Spec**: §8.1 — PersistentStore は `event, coverage, tombstone, relay capability, projection index` を保持
- **実装**: `backends/dexie/schema.ts` — `projectionIndex` テーブルが存在しない
- **影響**: 現在は projection index を使う機能がないため実害なし

### C3. `queryEvents` filter に `search` / `#<tag>` がない [中]

- **Spec**: §9.1 — raw Nostr filter は `ids, authors, kinds, since, until, limit, search, #<tag>` をサポート
- **実装**: `store-types.ts` `QueryFilter` — `ids, authors, kinds, since, until, limit` のみ。`search` と `#<tag>` tag filter がない
- **影響**: local store から tag-based query や全文検索ができない。relay fetch には filter として渡せるが、local cache query では使えない

### C4. `queryIdentityKey` / `fetchWindowKey` の canonical builder がない [低]

- **Spec**: §9.2 — `queryIdentityKey` は `since/until/limit` を含めない。`fetchWindowKey` = `queryIdentityKey + since/until/limit/anchor/direction`
- **実装**: 両キーは caller が opaque string として提供。composition rule を検証する builder 関数がない
- **影響**: caller が誤って `since` を含む `queryIdentityKey` を作っても検出されない

### C5. Optimistic mutation が consistency cascade に統合されていない [中]

- **Spec**: §8.3 — Consistency 優先順位: 1. verified tombstone → 2. optimistic local mutation → 3. fresh relay-backed → 4. stale cached
- **実装**: Tier 1 (tombstone) は `isVisibleRecord()` / `filterSeedEvents()` で適用されるが、Tier 2 (optimistic) は read path で考慮されない。`MemoryStore.trackPublish` は存在するが `queryEvents` 結果とマージする統合ポイントがない
- **影響**: optimistic 更新が relay の古いデータで上書きされる可能性がある

### C6. `syncQuery` が `windowSince/windowUntil` を relay fetch filter に注入しない [高]

- **Spec**: Recovery spec §4.2 — `syncEngine.syncQuery({ windowSince: disconnectedAt, windowUntil: reconnectedAt })` で gap 期間のみ取得
- **実装**: `sync-engine.ts:97-102` — `relayManager.fetch({ filter: input.filter })` に `input.filter` をそのまま渡す。`windowSince` / `windowUntil` は `putQueryCoverage` / `putRelayCoverage` のメタデータにのみ保存され、実際の REQ filter の `since` / `until` に注入されない
- **影響**: recovery 時に全期間を再取得してしまい、帯域を浪費する。gap 期間の precision が効かない

### C7. GC が DexiePersistentStore で実行不能 [高]

- **Spec**: Plan E Task 9 — `Session.open()` で `gcExpiredOptimistic` を呼ぶ + `runtime.ts` に periodic GC timer
- **実装**: `session.ts:171` — `if (store && 'events' in store && store.events instanceof Map)` ガード。`runtime.ts:58` — 同じ `instanceof Map` ガード。`DexiePersistentStore` は `events` プロパティを Map として公開しないため、両方のパスが production では到達不能
- **影響**: optimistic row と stale pre-tombstone が永久に蓄積する。E5 (optimistic row 未削除) と連鎖

### C8. Backfill DSL に `preset` フィールドがない [低]

- **Spec**: §9.3 — 公開 v1 backfill DSL は `preset`, `window`, `resume` の 3 要素
- **実装**: `builtin/backfill.ts` `BackfillPolicy` — `window` と `resume` のみ。`preset` は registry key としてのみ存在
- **影響**: caller が `{ preset: 'timeline-default', window: {...} }` のように composable に指定できない

---

## D. Relay Manager / Transport (9件)

### D1. `RelayManager.fetch()` が `completion` policy を無視 [高]

- **Spec**: §11.3 — completion policy (`all/any/majority/ratio`) は publish 専用ではなく runtime 共通概念。fetch/sync でも coverage ベースで評価
- **実装**: `relay-manager.ts:269-319` — `completion` パラメータを受け取るが内部で一切参照せず、常に `Promise.all` で全 relay を await
- **影響**: `{ mode: 'any' }` でも最遅 relay がボトルネックになる。recovery の `completion: { mode: 'any' }` が意味をなさない

### D2. `fetch()` が `methods` map を無視 — negentropy path が死んでいる [高]

- **Spec**: Relay Lifecycle §4 + Plan E Task 3 — negentropy 対応 relay は `NegentropySession` で diff 取得 → missing IDs のみ fetch
- **実装**: `relay-manager.ts:269` — `methods?: Record<string, 'negentropy' | 'fetch'>` を受け取るが内部で一切参照しない。常に `FetchScheduler` による通常 fetch。`NegentropySession` は存在するが呼ばれない
- **影響**: negentropy 対応 relay でも全イベント再取得。差分同期の帯域削減効果がゼロ

### D3. `FetchScheduler` が `maxFilters` を無視 [中]

- **Spec**: Relay Lifecycle §4.4 — backward fetch でも `max_filters` を超えたら filter array を複数 REQ に分割
- **実装**: `fetch-scheduler.ts` — `shardFilter()` は使うが `splitFilters()` を呼ばない。`FetchInput` に `maxFilters?: number` があるが参照されない
- **影響**: 大量の filter を持つ backward fetch が relay の `max_filters` 制限に違反する可能性

### D4. `FetchScheduler` が EOSE 後に `CLOSE` を送信しない [中]

- **Spec**: Relay Lifecycle §4.4 — "Each shard subId auto-closes on EOSE"
- **実装**: `fetch-scheduler.ts` — EOSE 受信時に timer clear + finalize のみ。`['CLOSE', subId]` を relay に送信しない
- **影響**: relay 側で subscription が残り続け、slot を消費し続ける

### D5. `ForwardAssembler` に `SlotCounter` が統合されていない [中]

- **Spec**: Relay Lifecycle §4.4 — "Forward wire-level subIds count toward max_subscriptions alongside backward subIds. ForwardAssembler and FetchScheduler share a slot counter per relay"
- **実装**: `forward-assembler.ts` — constructor に `SlotCounter` パラメータがなく、wire subId の生成時に slot を acquire しない
- **影響**: forward subscription が slot 制限を無視して無制限に REQ を発行できる

### D6. kind:5 削除監視の slot 予約 (max - 1) がない [中]

- **Spec**: Recovery spec §5.1 — "SlotCounter の max から 1 を予約し、FetchScheduler / ForwardAssembler が使える slot 数は max_subscriptions - 1"
- **実装**: `relay-manager.ts:181` — `new SlotCounter(10)` で初期化。NIP-11 結果が来ても `slots.setMax(info.maxSubscriptions)` と raw 値をそのまま設定。-1 の予約なし
- **影響**: deletion-watch が slot を消費した結果、他の subscription が slot 不足でブロックされる可能性

### D7. CLOSED メッセージによる queuing 有効化が未実装 [中]

- **Spec**: Relay Lifecycle §4.3 — "When a relay sends CLOSED with a reason indicating subscription limit exceeded, ForwardAssembler/FetchScheduler immediately enable queuing regardless of NIP-11 state"
- **実装**: `forward-assembler.ts` / `fetch-scheduler.ts` — CLOSED メッセージのハンドラが一切ない
- **影響**: relay が subscription limit で CLOSED を返しても、同じ relay に即座に新 REQ を発行し続ける

### D8. `onConnectionStateChange` の signature が spec と異なる [低]

- **Spec**: §4.5 — `onConnectionStateChange(callback: (url: string, state: ConnectionState) => void): () => void` — global callback で url と state を受け取る
- **実装**: `relay-manager.ts:427` — `onConnectionStateChange(url: string, handler: (state: ConnectionState) => void)` — caller が URL を先に指定し、callback は state のみ
- **影響**: 全 relay の状態変化を一括監視する場合、relay ごとに個別登録が必要

### D9. `RelayConnection` が invalid message を debug log しない [低]

- **Spec**: Relay Lifecycle §4.1 — "JSON.parse failures ... logged at debug level"
- **実装**: `relay-connection.ts` — parse 失敗時に `return` のみ。log 出力なし
- **影響**: デバッグ時に不正メッセージの存在を検知しにくい

---

## E. Publish / Auth / Optimistic (7件)

### E1. `relayPolicy.author` フィールドが dead code [中]

- **Spec**: §11.4 — Publish Relay Policy の 3 層: `author`, `audience`, `override`。`author: 'write-relays'` は author の write relays を使う指示
- **実装**: `session.ts` — `relayPolicy?.author` は型に存在するが `#publish()` 内で一度も読まれない。`publishRelaySet.write` は常に `this.defaultRelays.write` から構築
- **影響**: `author` フィールドに別の値を渡しても挙動が変わらない。現時点では `'write-relays'` しか選択肢がないため実害は低いが、将来の拡張 (例: `author: 'read-relays'`) に対応できない

### E2. `relayReasonCode` が relay message prefix から parse されない [低]

- **Spec**: §11.5 — `relayReasonCode` は relay OK message の machine-readable prefix を保持
- **実装**: `relay-manager.ts:262-265` — `result.accepted ? 'OK' : 'CLOSED'` で粗く判定。relay が返す実際の prefix (例: `blocked:`, `rate-limited:`) を parse しない
- **影響**: failure reason の詳細が失われる

### E3. `PublishFailureReason` が `session.ts` で重複定義 [低]

- **Spec**: §11.5 — runtime 共通概念
- **実装**: `session.ts:21-28` で local type alias として定義。`types.ts:45-52` にも同一定義がある。`session.ts` は `types.ts` から import していない
- **影響**: 2 箇所の定義が乖離するリスク

### E4. `cast()` が signing 完了前に `publishing` に遷移する [中]

- **Spec**: §11.5 — `signing → publishing → partial/confirmed/failed`。`publishing` は署名完了後に遷移すべき
- **実装**: `session.ts:344` — `onPublishing` callback が `signer.signEvent()` **呼び出し前**に発火。Signer reject 時は `signing → publishing → failed` という不正な遷移
- **影響**: UI が「署名中」と「送信中」を正確に区別できない

### E5. Confirmed 後の optimistic row が自動削除されない [高]

- **Spec**: §11.6 — store が `clientMutationId` を使って optimistic row を confirmed row に畳む
- **実装**: `session.ts:420-425` — confirmed 後に実 event を `putEvent` するが、`optimistic:<clientMutationId>` の行は削除されない。`gcExpiredOptimistic` が confirmed 行を即削除する設計だが、C7 により DexiePersistentStore では GC が到達不能
- **影響**: optimistic 行が永久に残り、DB 肥大化。表示上は confirmed が優先されるが store には不要行が蓄積

### E6. Pre-signed publish の署名検証がない [中]

- **Spec**: Relay Lifecycle §2 — "All received events + pre-signed publishes" に検証が必要
- **実装**: `relay-manager.ts:236-267` — `publish()` は受け取った event をそのまま `publishManager.publish()` に渡す。`verifier` を呼ばない
- **影響**: 不正な署名の event が relay に送信される可能性

### E7. Reactive NIP-42 auth が未対応 [中]

- **Spec**: §11.7 — NIP-42 relay auth は session/connection 側責務。protected event 以外でも relay が AUTH を要求する場合がある
- **実装**: `session.ts:327-342` — `isProtectedEvent(draft.tags)` の場合のみ `authenticate()` を呼ぶ。relay からの mid-publish AUTH challenge に対して自動で再送する仕組みがない
- **影響**: auth-required relay では非 protected event の publish が常に失敗する

---

## F. Recovery / Offline (11件)

### F1. AbortSignal が recovery 中断時に発火しない [高]

- **Spec**: Recovery §4.5 — recovery 中に再切断 → `AbortController.abort()` → 進行中 fetch 中断
- **実装**: `relay-manager.ts:468` — `signal: new AbortController().signal` で使い捨て signal を作成。AbortController への参照を保持しないため、再切断時に `.abort()` を呼べない
- **影響**: recovery 中に再切断しても fetch が走り続け、帯域を浪費し stale data が混入する可能性

### F2. `recoveryCooldown` が abort 時にも発動する [中]

- **Spec**: Recovery §4.3 — "Recovery が abort で中断された場合は recoveryCooldown を発動しない"
- **実装**: `relay-manager.ts:474` — `this.#lastRecoveryAt = Date.now()` を無条件に設定。abort/成功を区別しない
- **影響**: abort 後も cooldown が発動し、次の recovery 開始が遅延する

### F3. Recovery `activeQueries` が reconnect した relay の query に絞られない [中]

- **Spec**: Recovery §4.4 — "recovery の activeQueries には reconnect した relay を含む query のみが対象"
- **実装**: `relay-manager.ts:465` — `this.#syncEngine?.getActiveQueries?.()` が全 active queries を無条件に返す。reconnect した relay でフィルタリングしない
- **影響**: 切断していない relay の query も recovery 対象になり、不要な fetch が発生

### F4. Recovery relay 選択で Circuit Breaker が参照されない [中]

- **Spec**: Recovery §4.2 — DefaultRecoveryStrategy Step 1: `relays = circuit breaker で健全な relay のみ`
- **実装**: `recovery-strategy.ts:34` — `query.relays` をそのまま `syncEngine.syncQuery` に渡す。`canAttemptRelay()` を呼ばない
- **影響**: OPEN 状態の relay にも recovery fetch を試み、タイムアウトで遅延する

### F5. `DefaultRecoveryStrategy` Step 2 (pending publish retry) がない [中]

- **Spec**: Recovery §4.2 — Step 2: `persistentStore.listPendingPublishes()` → createdAt 順に再送
- **実装**: `recovery-strategy.ts:49-52` — コメントで「Session.open が担当する」と説明。recovery 中の再送パスなし
- **影響**: セッション中の reconnect では pending publish の再送が Session.open 起動時リトライのみ依存。ページリロードなしの reconnect では再送されない

### F6. `Session.open` pending publish retry で verifier 検証がない [中]

- **Spec**: Recovery §6.3 — "各 pending に対して verifier(signedEvent) で署名検証 → 検証失敗 → deletePendingPublish"
- **実装**: `session.ts:114-168` — `listPendingPublishes()` → 直接 retry。verifier を呼ばない
- **影響**: 改竄された pending event が relay に再送される可能性

### F7. `Session.open` が `gcStaleTombstones` を呼ばない [中]

- **Spec**: Recovery §6.5 — Step 2: GC は `gcExpiredOptimistic + tombstone GC`
- **実装**: `session.ts:170-177` — `gcExpiredOptimistic` のみ呼ぶ。`gcStaleTombstones` は periodic timer (runtime.ts) のみ
- **影響**: ページリロード直後の stale pre-tombstone が次の GC interval まで残る

### F8. `handleOfflineEvent` が retry timer を一時停止しない [中]

- **Spec**: Recovery §3.3 — `offline` イベント → 全 relay の retry timer を一時停止
- **実装**: `relay-manager.ts:495-498` — 空実装 + "future extensions" コメント
- **影響**: offline 中も exponential backoff timer が走り続け、online 復帰時に backoff が深い段階に進んでいる

### F9. `handleOnlineEvent` で backoff がリセットされない [高]

- **Spec**: Recovery §3.3 — `online` イベント → 全 non-terminal relay を staggered reconnect + backoff リセット
- **実装**: `relay-manager.ts:478-493` — staggered reconnect (100ms間隔) はあるが、`RelayConnection` の `#retryCount` をリセットしない。`ensureConnected()` は `initialized` / `dormant` 状態にしか効かず、`waiting-for-retrying` 状態の relay には何もしない
- **影響**: offline → online 復帰時に relay 接続が即座に回復しない。backoff が 60s まで進んでいると復帰に数十秒かかる

### F10. CB HALF-OPEN 遷移時に新 RelayConnection + probe を実行しない [中]

- **Spec**: Recovery §3.4 — "HALF-OPEN 遷移時: RelayManager が新しい RelayConnection を作成し、1 回の probe を実行する"
- **実装**: `circuit-breaker.ts` — timer で内部 state を `'half-open'` に変更するが、RelayManager への通知機構（callback, event emitter）がない。RelayManager は HALF-OPEN 遷移を検知できない
- **影響**: HALF-OPEN に遷移しても relay の健全性確認が能動的に行われない

### F11. `disconnectedAt` が per-relay ではなく global のみ [低]

- **Spec**: Recovery §4.4 — "per-relay で記録" + "全 relay の切断時刻のうち最も早いもの (first-wins)"
- **実装**: `relay-manager.ts:96` — `#disconnectedAt: number | null` 単一値。per-relay Map なし
- **影響**: per-relay の gap window 精度が失われるが、global first-wins で実用上は近似可能

---

## G. Live Subscription / Deletion (4件)

### G1. `SyncEngine.liveQuery` に coverage-aware `since` がない [高]

- **Spec**: Relay Lifecycle §3.0.3 — "Set since on live subscriptions based on load()'s coverage endpoint. Coverage が null なら since = now"
- **実装**: `sync-engine.ts:157-222` — `liveQuery` は `input.filter` をそのまま `relayManager.subscribe` に渡す。`getQueryCoverage` を呼んで `since` を設定するコードがない
- **影響**: load() → live() の間に gap が生じる。live が coverage endpoint より前のイベントを取りこぼす、または coverage endpoint がない場合に過去の全イベントを受信する

### G2. Builtin relation handles が `syncEngine.liveQuery` を使わない [高]

- **Spec**: Relay Lifecycle §3.0.1 / Plan D Task 5 — 全 Handle の `live()` は SyncEngine 経由
- **実装**: `builtin/users.ts`, `builtin/relays.ts`, `builtin/emojis.ts`, `builtin/comments.ts` — 全て `relayManager?.subscribe?.(...)` を直接呼ぶ。input 型にも `syncEngine` がない
- **影響**: builtin relation の live event が PersistentStore に書き込まれない (Store persistence guarantee 違反)。coverage bridge もない

### G3. deletion-watch が後続 liveQuery で追加された relay に伝播しない [中]

- **Spec**: Recovery §5.1 — "全 liveQuery で 1 relay につき 1 つの kind:5 subscription を共有"
- **実装**: `sync-engine.ts:168-186` — `if (this.#deletionWatchRefCount === 1)` で最初の liveQuery 呼び出し時の relays にのみ登録。後続の liveQuery が新 relay を追加しても kind:5 subscription は作られない
- **影響**: 後から追加された relay 経由の kind:5 削除イベントを検知できない

### G4. `SyncEngine.liveQuery` が store-types.ts で optional (`liveQuery?`) [低]

- **Spec**: §7 / Relay Lifecycle §3.0.3 — SyncEngine の core capability
- **実装**: `store-types.ts:155` — `liveQuery?` (optional)
- **影響**: interface 準拠の SyncEngine 実装が liveQuery を省略しても型エラーにならない

---

## H. Tombstone / Schema / Auth (5件)

### H1. `tombstone-processor` が `k` tag kind-hint を読まない [中]

- **Spec**: §13.1 — "k tag がある場合の kind hint 整合" を client が必須で検証
- **実装**: `core/sync/tombstone-processor.ts` — `k` tag を一切読まない。`targetKindHint` フィールドは型にあるが `putTombstone` 時に設定されない
- **影響**: kind 不一致の不正な deletion event が tombstone として通過する可能性

### H2. a-tag tombstone が `verified: true` に昇格しない [中]

- **Spec**: Recovery §5.3 — target event が DB に存在し author match 確認済み → `verified: true`
- **実装**: `tombstone-processor.ts` `#processAddressTarget()` — address 文字列から author を取り出して比較するが、実際の addressable event を DB から検索しない。常に `verified: false` で保存
- **影響**: addressable event の削除が永久に pre-tombstone のまま。7日後に GC で消える

### H3. `checkTombstone` が eventId のみ — address-based tombstone を検出できない [高]

- **Spec**: Recovery §5.3 — 通常イベント保存前に tombstone チェック
- **実装**: `tombstone-processor.ts` — `checkTombstone(eventId)` は `getTombstone({ targetEventId: eventId })` のみ。`targetAddress` で保存された tombstone を検出するパスがない
- **影響**: a-tag で削除された addressable event が tombstone を通過して表示される

### H4. `deleteTombstone` interface が `targetEventId` のみ — address-based tombstone を GC 削除できない [中]

- **Spec**: Recovery §5.6 / §6.4
- **実装**: `store-types.ts` — `deleteTombstone(targetEventId: string)`。Dexie 実装は `where('targetEventId').equals(...)` でクエリ。`targetAddress` で保存された tombstone は hit しない。`gc.ts` は `tombstone.targetEventId ?? tombstone.targetAddress` を渡すが interface 名が `targetEventId` なのでパラメータの意味が曖昧
- **影響**: address-based の stale pre-tombstone が GC で削除されず永久に残る

### H5. NIP-42 AUTH event に `["challenge", challenge]` tag がない [中]

- **Spec**: NIP-42 — AUTH event は `["challenge", "<challenge-string>"]` tag を含む
- **実装**: `relay-manager.ts:362-369` — `tags: [['relay', url]]` のみ。challenge は `content` に入っている
- **影響**: relay が NIP-42 準拠で `challenge` tag を検証する場合、AUTH が拒否される

---

## I. 型 / 構造 / Minor (4件)

### I1. `EventSigner` 型の統一未完了 [低]

- **Spec**: Plan Signers Task 5 — session.ts / store-types.ts の inline signer 型を canonical `EventSigner` に統一
- **実装**: `session.ts` / `store-types.ts` ともに `EventSigner` を import せず、inline 構造型 `{ signEvent(...): ...; getPublicKey(): ... }` を使用
- **影響**: 型の乖離リスクのみ。構造的互換性は維持されている

### I2. `RelayCapabilityRecord` に `nip11?` フィールドがない [低]

- **Spec**: Relay Lifecycle §4.3 Extended Record — `nip11?: Nip11Info`
- **実装**: `store-types.ts` `RelayCapabilityRecord` — `relayUrl, negentropy, source, lastCheckedAt?, ttlUntil?` のみ。`nip11` フィールドなし
- **影響**: NIP-11 情報が Nip11Registry の in-memory cache にしかなく、persistent store から再読み込みできない

### I3. `optimistic update handler` の registry slot がない [低]

- **Spec**: §14 — plugin に許すもの: `preset, projection, model/relation, codec, visibility rule, optimistic update handler, links`
- **実装**: `core/registry.ts` — `registerOptimisticUpdateHandler` メソッドなし
- **影響**: optimistic update の挙動を plugin から差し替えできない

### I4. `customEmojis.current` の順序が inline-first [低]

- **Spec**: §12.3 — grouped-first (referenced/named sets が先、inline が後)
- **実装**: `builtin/emojis.ts:186` — `sets.push(inlineSet)` が先、referenced sets が後
- **影響**: emoji-kitchen 的な grouped UI で inline が先頭に来る

---

## 統計

| 重要度   | 件数   |
| -------- | ------ |
| 高       | 10     |
| 中       | 25     |
| 低       | 12     |
| **合計** | **47** |

### 高重要度 10 件

1. **A4** — Nip11Registry 未配線 (NIP-11 slot limit 不適用)
2. **C7** — GC が DexiePersistentStore で実行不能
3. **D2** — negentropy path が死んでいる
4. **F1** — AbortSignal が recovery 中断で発火しない
5. **F9** — online 復帰時に backoff がリセットされない
6. **G1** — liveQuery に coverage-aware since がない (SubscriptionManager 未使用)

---

## 補完調査結果

### 補完済み → Gap リストから除外 (21件)

| Gap | 判定     | 理由                                                                                                                                                                          |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | 設計変更 | rx-nostr と同等の方針で個別 signer 方式に変更。`createSigner` は後方互換残存のみ。代わりに A6 (re-export 欠落) を追加                                                         |
| A2  | 実害なし | `Event.compose()` は codebase 全体で一度も呼ばれない。caller が draft を直接構築                                                                                              |
| B4  | 設計意図 | `before/after/loadAround` は anchor 設定のみ担当。options は `Timeline.fromFilter()` で設定済み。caller は `.before(item).load()` チェーン                                    |
| B8  | 内部のみ | Registry API は `builtin/` 内部からしか呼ばれない。外部 contract なし                                                                                                         |
| C1  | 補完済み | `TimelineItemBuilder` が projection 構築を完全に担当。独立 `ProjectionEngine` を必要とするコードなし                                                                          |
| C2  | 補完済み | `projectionIndex` を必要とするコードなし。`queryCoverage.projectionKey` が同等の役割                                                                                          |
| C4  | 補完済み | `timeline-handle.ts` の `getQueryIdentityKey` / `getEffectiveWindow` が一貫したパターンで構築。乖離なし                                                                       |
| C6  | 部分補完 | `timeline-handle.ts load()` は caller 側で `since/until` を filter に含めて渡す。**ただし `DefaultRecoveryStrategy` は filter に window を含めない → recovery path は未補完** |
| C8  | 補完済み | `BackfillConfig` に `preset` field があり、registry lookup で等価に動作                                                                                                       |
| D1  | 補完済み | `syncQuery` は全 relay から結果を集めて coverage に書く設計。early termination 不要。`completionSatisfied()` は publish path で使用                                           |
| D3  | 補完済み | `FetchScheduler.fetch()` は常に単一 filter。複数 filter 分割が必要なケースが実在しない                                                                                        |
| D5  | 補完済み | `ForwardAssembler` は filter を 1-2 本の wire REQ に coalesce するため slot 消費が少ない。`FetchScheduler` が slot 管理                                                       |
| D6  | 補完済み | deletion-watch は `ForwardAssembler` 経由で `SlotCounter` を消費しない。slot 予約不要                                                                                         |
| D8  | 実害なし | `onConnectionStateChange` は codebase 全体で一度も呼ばれない                                                                                                                  |
| E1  | 補完済み | `author` の唯一の有効値 `'write-relays'` がデフォルト動作と一致                                                                                                               |
| F2  | 連鎖消滅 | F1 により abort が発火しないため、この gap は到達不能                                                                                                                         |
| F3  | 補完済み | global `disconnectedAt` による over-recovery はイベント取りこぼしなし (帯域浪費のみ)                                                                                          |
| F5  | 補完済み | `PublishManager.replayPending()` が `onReconnect` で毎回呼ばれる (in-memory pending)。永続 pending は `Session.open` でカバー                                                 |
| F11 | 補完済み | global first-wins で correctness は保証。per-relay precision は帯域最適化のみ                                                                                                 |
| G4  | 補完済み | 全実装 (SyncEngine, fake) が `liveQuery` を提供。optional typing は防御的記法のみ                                                                                             |
| I1  | 補完済み | TypeScript の structural typing により inline 型と `EventSigner` は構造互換                                                                                                   |

### 補完不十分 → Gap として残存する修正 (3件の判定変更)

| Gap | 変更  | 理由                                                                                                                                                                   |
| --- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C6  | 高→中 | `timeline-handle.ts` は補完済みだが recovery path (`DefaultRecoveryStrategy`) は未補完。recovery 限定の gap に縮小                                                     |
| G2  | 高→低 | builtin handles は `putEvent → load()` を手動で行っており Store persistence guarantee は満たす。`liveQuery` 未使用は coverage bridge (since) の欠如のみ。G1 に集約可能 |
| H3  | 高→低 | `filterSeedEvents` が `getTombstone` を eventId と address の両方で呼ぶ。`checkTombstone` の狭さは caller が補完                                                       |

### 残存 Gap 最終リスト (26件)

#### 高 (5件)

| #   | ID  | 内容                                                                                                                                           |
| --- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A4  | `createRuntime()` が `Nip11Registry` を生成・配線しない — NIP-11 slot limit が production で不適用                                             |
| 2   | C7  | `gcExpiredOptimistic` / `gcStaleTombstones` が `instanceof Map` ガードで DexiePersistentStore で実行不能 → E5 (optimistic row 永久残存) と連鎖 |
| 3   | D2  | `fetch()` が `methods` map を無視 — negentropy path が完全に死んでいる                                                                         |
| 4   | F1  | AbortSignal が recovery 中断時に発火しない — AbortController 参照未保持                                                                        |
| 5   | G1  | `SyncEngine.liveQuery` に coverage-aware `since` がない — `SubscriptionManager` が存在するが未使用                                             |

#### 中 (14件)

| #   | ID  | 内容                                                                                                |
| --- | --- | --------------------------------------------------------------------------------------------------- |
| 6   | A3  | `createRuntime()` に `retry`/`idleTimeout`/`temporaryRelayTtl`/`connect` config pass-through がない |
| 7   | A5  | `createRuntime()` が `TemporaryRelayTracker` を生成・配線しない + `markDormant` 未呼び出し          |
| 8   | B1  | `Event.fromId` handle に `live()` がない                                                            |
| 9   | B5  | `ListHandle.hasMore` が pagination で更新されない                                                   |
| 10  | B7  | `state.deleted` / `state.optimistic` が builder/visibility engine で設定されない                    |
| 11  | C3  | `queryEvents` filter に `search` / `#<tag>` がない                                                  |
| 12  | C5  | Optimistic mutation が consistency cascade (priority #2) に統合されていない                         |
| 13  | C6  | `DefaultRecoveryStrategy` が filter に `windowSince/windowUntil` を注入しない (recovery 限定)       |
| 14  | D4  | `FetchScheduler` が EOSE 後に `CLOSE` を送信しない                                                  |
| 15  | D7  | CLOSED メッセージ (subscription limit) による queuing 有効化が未実装                                |
| 16  | E4  | `cast()` が signing 完了前に `publishing` に遷移する (`onPublishing` が 2 回発火)                   |
| 17  | F4  | Recovery relay 選択で Circuit Breaker が参照されない                                                |
| 18  | F9  | `handleOnlineEvent` で backoff がリセットされない / `waiting-for-retrying` に効かない               |
| 19  | F10 | CB HALF-OPEN 遷移時に能動的な probe を実行しない (次の organic use 依存)                            |

#### 低 (7件)

| #   | ID  | 内容                                                                                                 |
| --- | --- | ---------------------------------------------------------------------------------------------------- |
| 20  | A6  | 個別 signer (`nip07Signer` 等) が `auftakt/index.ts` から re-export されていない                     |
| 21  | B2  | `Event.fromId` / `NostrLink.from` handle に `dispose()` がない (subscription 未保持のため leak なし) |
| 22  | B6  | `source = 'optimistic'` が一度も設定されない (consumer なし)                                         |
| 23  | D9  | `RelayConnection` が invalid message を debug log しない                                             |
| 24  | E2  | `relayReasonCode` が relay message prefix から parse されない                                        |
| 25  | E3  | `PublishFailureReason` が `session.ts` で重複定義                                                    |
| 26  | H2  | a-tag tombstone が `verified: true` に昇格しない + `deleteTombstone` が address-based に非対応       |
| 27  | H5  | NIP-42 AUTH event に `["challenge", challenge]` tag がない                                           |

---

## 修正結果 (2026-04-04 実施)

### 修正済み (21件)

| #   | ID  | 重要度 | 内容                                                                                                                                                                                       | 修正ファイル                                                                                                                                                  |
| --- | --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | C7  | 高     | GC の `instanceof Map` ガード除去 → `listOptimisticEvents` interface 経由に変更。DexiePersistentStore で GC が動作するようになった                                                         | `core/gc.ts`, `core/gc.test.ts`, `core/store-types.ts`, `core/runtime.ts`, `core/models/session.ts`, `backends/dexie/persistent-store.ts`, `testing/fakes.ts` |
| 2   | F1  | 高     | `#recoveryAbortController` フィールド追加。`#executeRecovery` で AbortController を保持し、`onStateChange` で再切断時に `.abort()` を呼ぶ                                                  | `core/relay/relay-manager.ts`, `core/relay/relay-manager.test.ts`                                                                                             |
| 3   | C6  | 中     | `syncQuery` 内で `input.windowSince`/`windowUntil` を relay fetch filter の `since`/`until` に注入                                                                                         | `core/sync-engine.ts`, `core/sync-engine.test.ts`                                                                                                             |
| 4   | D4  | 中     | `FetchScheduler.#executeShard` の EOSE handler と timeout handler に `connection.send(['CLOSE', subId])` を追加                                                                            | `core/relay/fetch-scheduler.ts`, `core/relay/fetch-scheduler.test.ts`                                                                                         |
| 5   | H5  | 低→中  | `authenticate()` で AUTH event の tags に `['challenge', relay.challenge]` を追加。`content` を空文字列に変更 (NIP-42 準拠)                                                                | `core/relay/relay-manager.ts`                                                                                                                                 |
| 6   | E4  | 中     | `#publish` 内の `onPublishing` 呼び出しを `signer.signEvent()` 完了後に移動。signing 前の `onPublishing` を削除                                                                            | `core/models/session.ts`                                                                                                                                      |
| 7   | F9  | 中     | `RelayConnection` に `resetBackoff()` と `forceReconnect()` public メソッドを追加。`handleOnlineEvent()` で `forceReconnect()` を呼んで `waiting-for-retrying` 状態の relay も即座に再接続 | `core/relay/relay-connection.ts`, `core/relay/relay-manager.ts`                                                                                               |
| 8   | F4  | 中     | `RecoveryContext` に `canAttemptRelay?` フィールド追加。`DefaultRecoveryStrategy` が健全な relay のみに recovery fetch を実行                                                              | `core/sync/recovery-strategy.ts`, `core/relay/relay-manager.ts`                                                                                               |
| 9   | F10 | 中     | `CircuitBreakerConfig` に `onHalfOpen` callback 追加。`#openCircuit` の cooldown timer で `half-open` 遷移時に callback を発火                                                             | `core/relay/circuit-breaker.ts`                                                                                                                               |
| 10  | G3  | 中     | `liveQuery` の deletion-watch 登録から `if (this.#deletionWatchRefCount === 1)` ガードを除去。全 `liveQuery` で新 relay を検出して kind:5 subscription を追加                              | `core/sync-engine.ts`                                                                                                                                         |
| 11  | A6  | 低     | `nip07Signer`, `seckeySigner`, `noopSigner` を `auftakt/index.ts` から re-export                                                                                                           | `index.ts`                                                                                                                                                    |
| 12  | E3  | 低     | `session.ts` のローカル `PublishFailureReason` 型定義を削除し `types.ts` から import                                                                                                       | `core/models/session.ts`                                                                                                                                      |
| 13  | D9  | 低     | `RelayConnection` の JSON parse 失敗時にコメントでデバッグ意図を記録 (console.debug は lint ルール違反のため不使用)                                                                        | `core/relay/relay-connection.ts`                                                                                                                              |
| 14  | H2  | 低     | `#processAddressTarget` で addressable event を `queryEvents` で DB 検索し、存在すれば `verified: true` で tombstone を作成。`targetKindHint` も設定                                       | `core/sync/tombstone-processor.ts`                                                                                                                            |
| 15  | E5  | 高     | C7 解消により GC が DexiePersistentStore で動作 → confirmed optimistic row の自動削除が production で有効に                                                                                | (C7 に連鎖)                                                                                                                                                   |
| 16  | F2  | 中     | `#executeRecovery` で `completed` フラグを追跡。abort/失敗時は `#lastRecoveryAt` を設定しない → cooldown が次の recovery を阻害しない                                                      | `core/relay/relay-manager.ts`                                                                                                                                 |

### Plan F (offline recovery) 未コミット変更で解消済み (5件)

以下は今回のセッション以前の未コミット変更で既に解消されていた gap:

| #   | ID  | 重要度 | 内容                                                                          | 対応ファイル                  |
| --- | --- | ------ | ----------------------------------------------------------------------------- | ----------------------------- |
| 17  | —   | —      | `browserSignals` config の `createRuntime` 配線                               | `core/runtime.ts`             |
| 18  | —   | —      | `circuitBreaker` config の `createRuntime` 配線                               | `core/runtime.ts`             |
| 19  | —   | —      | `recovery` config (stabilityWindow, recoveryCooldown) の `createRuntime` 配線 | `core/runtime.ts`             |
| 20  | —   | —      | `disconnectedAt` 記録 + `#scheduleRecovery` + `#executeRecovery`              | `core/relay/relay-manager.ts` |
| 21  | —   | —      | kind:5 自動チェック (syncQuery 後の backward deletion fetch)                  | `core/sync-engine.ts`         |

### 未修正 — 別 plan で対応 (5件)

| #   | ID  | 重要度 | 内容                                                             | 理由                                                                                                                                                                                                                   |
| --- | --- | ------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | D2  | 高     | `fetch()` が `methods` map を無視 — negentropy path が死んでいる | `NegentropySession` 統合は大規模 feature。`core/relay/relay-manager.ts` の `fetch()` 内で `methods` を参照し `NegentropySession` に分岐するロジックが必要。対象: `core/relay/relay-manager.ts`, `vendor/negentropy.ts` |
| 2   | G1  | 高     | `SyncEngine.liveQuery` に coverage-aware `since` がない          | `liveQuery` は同期メソッドだが `getQueryCoverage` は async。API を async 化するか、fire-and-forget で filter を事後変更するかの設計判断が必要。対象: `core/sync-engine.ts`, `core/handles/timeline-handle.ts`          |
| 3   | C5  | 中     | Optimistic mutation が consistency cascade に統合されていない    | `MemoryStore.trackPublish` と `queryEvents` 結果のマージポイント設計が必要。対象: `core/memory-store.ts`, `core/sync-engine.ts` または新規 consistency-resolver                                                        |
| 4   | C3  | 中     | `queryEvents` filter に `search` / `#<tag>` がない               | local store の tag-based query は NIP-01 filter 拡張。対象: `core/store-types.ts` (QueryFilter 型), `testing/fakes.ts`, `backends/dexie/persistent-store.ts`                                                           |
| 5   | D7  | 中     | CLOSED メッセージによる queuing 有効化が未実装                   | `ForwardAssembler` / `FetchScheduler` に CLOSED handler + queuing mode の設計が必要。対象: `core/relay/forward-assembler.ts`, `core/relay/fetch-scheduler.ts`                                                          |

### 未修正 — 実害なし / 低優先度 (5件)

| #   | ID  | 重要度 | 内容                                                                    | 理由                                                                                                                                                                             |
| --- | --- | ------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A3  | 中     | `retry`/`idleTimeout`/`temporaryRelayTtl`/`connect` config pass-through | `circuitBreaker`/`recovery`/`browserSignals` は配線済み。残りは利用者が `RelayManager` を直接作成すれば設定可能                                                                  |
| 2   | A5  | 中     | `TemporaryRelayTracker` の `createRuntime` 配線                         | `RelayManager` は tracker を optional で受け付け済み。`createRuntime` での自動生成のみ未対応                                                                                     |
| 3   | B1  | 中     | `Event.fromId` handle に `live()` がない                                | live 更新の設計が未確定。subscription 未保持のため leak なし                                                                                                                     |
| 4   | B2  | 低     | `Event.fromId` / `NostrLink.from` に `dispose()` がない                 | subscription 未保持のため leak なし。API 契約のみ                                                                                                                                |
| 5   | B5  | 中     | `ListHandle.hasMore` が pagination で更新されない                       | `before()`/`after()` の fetch 結果から `hasMore` を更新するロジック追加が必要。対象: `core/handles/timeline-handle.ts`                                                           |
| 6   | B6  | 低     | `source = 'optimistic'` が設定されない                                  | consumer が存在しない                                                                                                                                                            |
| 7   | B7  | 中     | `state.deleted`/`state.optimistic` が設定されない                       | `TimelineItemBuilder` または `applyVisibility` での tombstone/optimistic チェック追加が必要。対象: `core/handles/timeline-handle.ts`, `core/projection/timeline-item-builder.ts` |
| 8   | E2  | 低     | `relayReasonCode` が relay message prefix から parse されない           | relay OK message の prefix parse は情報的。機能影響なし                                                                                                                          |

### フロー検証で発見された追加 gap (2026-04-04)

ユーザーフロートレースにより発見。上記の gap analysis では検出できなかった動線の破綻。

| #   | ID  | 重要度 | 内容                                                                                                                                                                          | 対象ファイル                     |
| --- | --- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | FV1 | 高     | `Session.open` の pending publish retry 成功時に optimistic row の `publishStatus` を `'confirmed'` に更新しない → `'pending'` のまま永久残存。GC は `'pending'` を削除しない | `core/models/session.ts`         |
| 2   | FV2 | 高     | `liveQuery` の onEvent で非 kind:5 event に対して `checkTombstone` + pre-tombstone 昇格を行わない → 削除されたはずの event が表示され続ける                                   | `core/sync-engine.ts`            |
| 3   | FV3 | 中     | pending publish retry 前の `verifier` 検証がない (元 F6)。gap analysis の remediation リストから脱落                                                                          | `core/models/session.ts`         |
| 4   | FV4 | 低     | `AbortSignal` が `syncQuery` 内部の fetch に伝搬しない (query 間チェックのみ)。許容する設計判断として spec に明記済み                                                         | `core/sync/recovery-strategy.ts` |
| 5   | FV5 | 低     | negentropy: local events 0 件 (初回同期) の場合、通常 fetch より非効率。スキップロジックなし                                                                                  | `core/relay/relay-manager.ts`    |
