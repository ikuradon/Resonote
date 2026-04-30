# auftakt Remaining Gaps Design (D7, D2, G1, C5, C3)

## 1. Scope

gap-analysis.md で「別 plan で対応」とされた大規模 gap 5 件の設計。

対象:

1. D7 — CLOSED message handling + reason-aware retry + queuing 有効化
2. D2 — Negentropy (NIP-77) 完全統合
3. G1 — `liveQuery` async 化 + SubscriptionManager + coverage bridge
4. C5 — Optimistic consistency cascade (Store 層)
5. C3 — `#tag` filter (strfry 風 tag index) + `search` stub

## 2. Design Decisions

| Item               | Decision                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D7 CLOSED handling | Reason-aware retry (`auth-required` → AUTH 再送, `rate-limited` → backoff) + subscription-limit → queuing mode 有効化 + capability `observed` 永続化     |
| D2 Negentropy      | Full NIP-77。vendored `Negentropy` を `NegentropySession` に統合。CLOSED fallback + capability `observed` 更新                                           |
| G1 liveQuery       | async 化。SyncEngine 内部で `getQueryCoverage` → `since` 設定 (coverage bridge)。`SubscriptionManager` 新設                                              |
| C5 Optimistic      | Store 層。`putEvent` で `clientMutationId` dedup (confirmed 到着時に optimistic row 自動削除)。`buildItems` で MemoryStore の pending publishes を merge |
| C3 #tag filter     | strfry 風 Dexie tag index テーブル。`search` は型のみ (`throw`)                                                                                          |

## 3. Implementation Order

```
Phase 1: D7 (CLOSED handling)
  ↓ unblocks
Phase 2: D2 (Negentropy) — CLOSED fallback を利用
  ↓ improves
Phase 3: G1 (async liveQuery + SubscriptionManager)
Phase 4: C5 (Optimistic consistency)
Phase 5: C3 (#tag filter + search stub)
```

Phase 3〜5 は互いに独立。Phase 1→2 は依存関係あり。

## 4. D7 — CLOSED Message Handling

### 4.1 closed-reason.ts (新規)

CLOSED reason parser。NIP-01 の CLOSED format: `["CLOSED", subId, "prefix:human-readable message"]`

```typescript
type ClosedReasonCategory =
  | 'auth-required' // → AUTH 後に再送
  | 'rate-limited' // → backoff 後に再送
  | 'subscription-limit' // → queuing mode 有効化
  | 'restricted' // → 即失敗 (filter 不許可)
  | 'error' // → 即失敗 (relay 内部エラー)
  | 'unknown'; // → 即失敗

interface ClosedReasonInfo {
  category: ClosedReasonCategory;
  prefix: string;
  message: string;
  retryable: boolean;
}

function parseClosedReason(reason: string): ClosedReasonInfo;
```

`retryable` は `auth-required` と `rate-limited` のみ `true`。

### 4.2 FetchScheduler の変更

`#executeShard` の message handler に CLOSED handler を追加:

```
CLOSED 受信 (subId 一致):
  clearTimeout(timer)
  off()
  reason = parseClosedReason(message[2])

  switch reason.category:
    'auth-required':
      // 将来: AUTH 後に再送。現在は即失敗
      send(['CLOSE', subId])
      finalize()

    'rate-limited':
      // 1回のみ delay 後に re-dispatch
      send(['CLOSE', subId])
      await delay(5000)
      retry same shard (retry count 管理、2回目は即失敗)

    'subscription-limit':
      // SlotCounter の max を現在の active shard 数に縮小
      slots.setMax(currentActiveShards)
      send(['CLOSE', subId])
      // shard を queue に戻す (slot 解放待ち)
      requeue shard

    'restricted' | 'error' | 'unknown':
      send(['CLOSE', subId])
      finalize() // 空結果で resolve
```

### 4.3 ForwardAssembler の変更

CLOSED handler を追加:

```
CLOSED 受信 (wire subId が自分のものか確認):
  reason = parseClosedReason(message[2])

  if reason.category === 'subscription-limit':
    // max_filters を縮小して rebuild
    this.#maxFilters = Math.max(1, currentWireSubIds.length - 1)
    this.#rebuild()

  // その他の reason: forward subscription は persistent なので無視
  // (relay が接続維持している限り、次の rebuild で再送される)
```

### 4.4 Capability observed 永続化

`subscription-limit` CLOSED 受信時、`RelayManager` 経由で `persistentStore.putRelayCapability`:

```typescript
{
  relayUrl: url,
  negentropy: existing.negentropy,
  nip11: existing.nip11,
  source: 'observed',
  lastCheckedAt: Date.now(),
  ttlUntil: Date.now() + capabilityTtlMs
}
```

`RelayCapabilityRecord` に `nip11?: Nip11Info` フィールドを追加 (relay lifecycle spec 準拠)。

### 4.5 FetchResult への reason 伝播

`RelayManager.fetch()` の返り値に CLOSED reason を含める:

```typescript
interface FetchResult {
  events: NostrEvent[];
  acceptedRelays: string[];
  failedRelays: string[];
  successRate: number;
  relayReasonCode?: 'OK' | 'CLOSED';
  relayReasonMessage?: string;
  closedReasons?: Record<string, ClosedReasonInfo>; // relay URL → reason
}
```

## 5. D2 — Negentropy (NIP-77) 完全統合

### 5.1 NegentropySession 実装補完

現在の stub (`this.#connection.send(['NEG-MSG', subId, ''])`) を vendored `Negentropy` クラスで置き換え。

```
start() フロー:
  1. localEvents から NegentropyStorageVector を構築
     for event in localEvents:
       storage.insert(event.created_at, hexToBytes(event.id))
     storage.seal()

  2. Negentropy インスタンス作成
     neg = new Negentropy(storage, frameSizeLimit=0)
     neg.setInitiator()

  3. initiate() → 初回メッセージ
     initMsg = await neg.initiate()
     hexMsg = bytesToHex(initMsg)

  4. NEG-OPEN 送信
     send(['NEG-OPEN', subId, filter, hexMsg])

  5. NEG-MSG 受信ループ:
     msg = hexToBytes(message[2])
     result = await neg.reconcile(msg)

     needIds += result.needIds.map(bytesToHex)
     haveIds += result.haveIds.map(bytesToHex)

     if result.output === undefined:
       // Reconciliation 完了
       send(['NEG-CLOSE', subId])
       return { needIds, haveIds, fallback: false }

     if rounds >= maxRounds:
       send(['NEG-CLOSE', subId])
       return { needIds, haveIds, fallback: true }

     send(['NEG-MSG', subId, bytesToHex(result.output)])

  6. CLOSED 受信 → return { needIds, haveIds, fallback: true }
```

### 5.2 RelayManager.fetch() の negentropy routing

```
fetch(input) の relay ごとのループ:
  method = input.methods?.[url] ?? 'fetch'

  if method === 'negentropy':
    // Step 1: local events 取得
    localEvents = await persistentStore.queryEvents(input.filter)

    // 初回同期の最適化: local events が 0 件なら negentropy をスキップ
    if localEvents.length === 0:
      return fetchScheduler.fetch({ filter, connection, slots, onEvent })

    // Step 2: NegentropySession で差分検出
    negResult = await new NegentropySession({
      connection, filter: input.filter,
      localEvents: localEvents.map(e => ({ id: e.id, created_at: e.created_at })),
      timeout: eoseTimeout, maxRounds: 10
    }).start()

    // Step 3: fallback → capability 更新 + 通常 fetch
    if negResult.fallback:
      await persistentStore.putRelayCapability({
        relayUrl: url, negentropy: 'unsupported',
        source: 'observed', lastCheckedAt: now, ttlUntil: now + ttl
      })
      return fetchScheduler.fetch({ filter, connection, slots, onEvent })

    // Step 4: needIds を FetchScheduler 経由で取得 (auto-shard)
    if negResult.needIds.length > 0:
      fetchScheduler.fetch({
        filter: { ids: negResult.needIds },
        connection, slots, onEvent
      })
  else:
    // 通常 fetch path (現行通り)
```

### 5.3 PersistentStore 参照

`RelayManager` の `#persistentStoreForRecovery` を `#persistentStore` にリネームし、negentropy の local event 取得にも使用。型を拡張:

```typescript
persistentStore?: {
  queryEvents(filter: Record<string, unknown>): Promise<Array<{ id: string; created_at: number }>>;
  listPendingPublishes(): Promise<Array<{ ... }>>;
  deletePendingPublish(eventId: string): Promise<void>;
  putRelayCapability(record: RelayCapabilityRecord): Promise<void>;
}
```

## 6. G1 — async liveQuery + SubscriptionManager

### 6.1 SubscriptionManager (新規: `core/sync/subscription-manager.ts`)

spec §3.0.3 / relay lifecycle §4.4 準拠。SyncEngine 内部コンポーネント。

```typescript
interface SubscriptionManagerConfig {
  relayManager: RelayManager;
  persistentStore: PersistentStore;
}

class SubscriptionManager {
  // Coverage-aware な logical subscription を追加
  async addSubscription(input: {
    logicalId: string;
    queryIdentityKey: string;
    filter: Record<string, unknown>;
    relays: string[];
    onEvent(event: NostrEvent, from: string): void | Promise<void>;
  }): Promise<void>;

  // Logical subscription を除去 → ForwardAssembler から filter 除去
  removeSubscription(logicalId: string): void;

  // Recovery 用: active queries を返す
  getActiveQueries(): Array<{
    queryIdentityKey: string;
    filter: Record<string, unknown>;
    relays: string[];
  }>;

  dispose(): void;
}
```

### 6.2 Coverage Bridge

`addSubscription` 内部フロー:

```
addSubscription(input):
  1. coverage = await persistentStore.getQueryCoverage(input.queryIdentityKey)

  2. effectiveFilter = { ...input.filter }
     if coverage?.windowUntil !== undefined:
       effectiveFilter.since = coverage.windowUntil
     else:
       effectiveFilter.since = Math.floor(Date.now() / 1000)

  3. relay ごとに relayManager.subscribe() を呼ぶ
     handle = relayManager.subscribe({
       filter: effectiveFilter,
       relays: input.relays,
       onEvent: async (event, from) =>
         if event.kind === 5:
           await tombstoneProcessor.processDeletion(event)
         else:
           // Pre-tombstone チェック + 昇格
           tombstone = await tombstoneProcessor.checkTombstone(event.id)
           if tombstone && !tombstone.verified && event.pubkey === tombstone.deletedByPubkey:
             await persistentStore.putTombstone({ ...tombstone, verified: true })
         await persistentStore.putEvent(event)
         await input.onEvent(event, from)
     })

  4. 内部 registry に登録
     this.#subscriptions.set(input.logicalId, { handle, input })
```

### 6.3 SyncEngine.liveQuery async 化

```typescript
// store-types.ts
export interface SyncEngine {
  syncQuery(input: { ... }): Promise<void>;
  liveQuery(input: {
    queryIdentityKey: string;
    filter: Record<string, unknown>;
    relays: string[];
    onEvent(event: NostrEvent, from: string): void | Promise<void>;
  }): Promise<{ unsubscribe(): void }>;  // sync → async
}
```

SyncEngine 内部実装:

```
async liveQuery(input):
  1. logicalId = `lq:${++counter}`

  2. await subscriptionManager.addSubscription({
       logicalId,
       queryIdentityKey: input.queryIdentityKey,
       filter: input.filter,
       relays: input.relays,
       onEvent: async (event, from) =>
         // tombstone 処理
         if event.kind === 5:
           await tombstoneProcessor.processDeletion(event)
         await input.onEvent(event, from)
     })

  3. deletion-watch ref-count 管理 (既存ロジック、全 relay に伝播)

  4. return { unsubscribe() }
       → subscriptionManager.removeSubscription(logicalId)
       → deletion-watch ref-count decrement
```

### 6.4 影響範囲

`liveQuery` の全 caller を `await` に更新:

- `core/handles/timeline-handle.ts` — `live()` で `await syncEngine.liveQuery()`
- builtin handles — 現在は `relayManager.subscribe()` 直接呼び出し。`liveQuery` への移行は G2 (別 gap) だが、interface 変更で型エラーが出る場合は合わせて修正

## 7. C5 — Optimistic Consistency (Store 層)

### 7.1 Consistency 優先順位 (spec §8.3)

```
1. verified tombstone     → 表示しない
2. optimistic local mutation → relay-backed より優先
3. fresh relay-backed     → stale cached より優先
4. stale cached           → 最低優先
```

### 7.2 putEvent での optimistic dedup

`PersistentStore.putEvent` が confirmed event (`clientMutationId` あり、`optimistic !== true`) を受け取った際、同じ `clientMutationId` の optimistic row を自動削除:

```
putEvent(event):
  if event.clientMutationId && event.optimistic !== true:
    // confirmed 到着 → optimistic row を削除
    delete event with id === `optimistic:${event.clientMutationId}`

  events.put(event)
```

E5 (confirmed 後の optimistic row が自動削除されない) が Store 層で根本解決される。

### 7.3 buildItems での optimistic merge

Handle の `buildItems` (TimelineItemBuilder) で PersistentStore の結果に MemoryStore の pending publishes を追加:

```
buildItems():
  // Step 1: PersistentStore から通常クエリ
  persistedResults = queryEvents(filter)

  // Step 2: MemoryStore の pending publishes を取得
  // (Session.cast() で trackPublish されたもの)
  for publish in memoryStore.publishes:
    if publish matches filter:
      // confirmed 版が persistedResults にあればスキップ
      if persistedResults has event with same clientMutationId:
        continue
      // optimistic event を追加
      persistedResults.push(publish.event with state.optimistic = true)

  // Step 3: 通常の projection + visibility
  return project(persistedResults)
```

### 7.4 実装箇所

- **FakePersistentStore**: `putEvent` 内で `clientMutationId` dedup
- **DexiePersistentStore**: `putEvent` 内で Dexie transaction で optimistic row を削除
- **MemoryStore**: 変更なし (`trackPublish` / `getPublish` / `removePublish` は既存)
- **TimelineItemBuilder / Handle**: `buildItems` 前に MemoryStore merge ロジック追加

## 8. C3 — #tag Filter + search Stub

### 8.1 QueryFilter 拡張

```typescript
// store-types.ts queryEvents の filter を拡張
queryEvents(filter: {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  search?: string;
  [key: `#${string}`]: string[] | undefined;
}): Promise<unknown[]>;
```

### 8.2 Tag Index テーブル (strfry 風)

Dexie に `eventTags` テーブルを追加:

```typescript
// schema.ts
eventTags: '[tagName+tagValue+eventId], eventId';

interface EventTagRecord {
  tagName: string; // single-letter tag name (e.g. 'e', 'p', 't', 'I')
  tagValue: string; // tag value
  eventId: string; // 参照先 event ID
}
```

### 8.3 putEvent 時の tag index 更新

```
putEvent(event):
  // 既存の event 保存...

  // Tag index を replace (delete + insert)
  await db.eventTags.where('eventId').equals(event.id).delete()
  for [name, value] of event.tags:
    if name.length === 1:  // NIP-01: single-letter tag のみ
      await db.eventTags.put({ tagName: name, tagValue: value, eventId: event.id })
```

### 8.4 deleteEvent 時の cleanup

```
deleteEvent(id):
  await db.eventTags.where('eventId').equals(id).delete()
  await db.events.delete(id)
```

### 8.5 queryEvents での #tag filter

NIP-01 準拠: `#<single-letter-tag>` のみ対象 (key length === 2)。multi-letter tag filter (`#relay` 等) は NIP-01 標準外のため非対応。

```
queryEvents(filter):
  tagFilters = Object.keys(filter) で '#' prefix かつ length === 2 のものを抽出

  if filter.search !== undefined:
    throw new Error('search filter is not implemented')

  if tagFilters.length > 0:
    // 各 tag filter の候補 eventId を intersection で絞る
    candidateIds = null
    for key in tagFilters:
      tagName = key[1]
      values = filter[key]  // string[]

      // NIP-01: OR within a tag filter, AND across tag filters
      ids = db.eventTags
        .where('[tagName+tagValue+eventId]')
        .anyOf(values.map(v => [tagName, v]))
        .toArray() → unique eventIds → Set

      candidateIds = candidateIds ? intersection(candidateIds, ids) : ids

    // candidateIds で events テーブルを lookup
    records = db.events.where('id').anyOf([...candidateIds]).toArray()
    // 他の filter (kinds, authors, since, until) を post-filter
  else:
    // 既存ロジック (tag filter なし)
```

### 8.6 FakePersistentStore

Map ベースの in-memory tag index:

```typescript
const eventTags = new Map<string, Set<string>>(); // `${tagName}:${tagValue}` → Set<eventId>

// putEvent 時
for [name, value] of event.tags:
  if name.length === 1:
    key = `${name}:${value}`
    if !eventTags.has(key): eventTags.set(key, new Set())
    eventTags.get(key).add(event.id)

// queryEvents #tag filter
for key in tagFilters:
  tagName = key[1], values = filter[key]
  ids = union of eventTags.get(`${tagName}:${v}`) for v in values
  candidateIds = intersection(candidateIds, ids)
```

### 8.7 Dexie Schema Version

`eventTags` テーブル追加のため Dexie version bump が必要。

## 9. File Structure

### 新規ファイル

| File                                     | 責務                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| `core/relay/closed-reason.ts`            | CLOSED reason parser + retry 判定                                      |
| `core/relay/closed-reason.test.ts`       | テスト                                                                 |
| `core/sync/subscription-manager.ts`      | Logical subscription registry (coverage bridge, ForwardAssembler 委譲) |
| `core/sync/subscription-manager.test.ts` | テスト                                                                 |

### 変更ファイル

| File                                 | 変更内容                                                                              | Phase   |
| ------------------------------------ | ------------------------------------------------------------------------------------- | ------- |
| `core/relay/fetch-scheduler.ts`      | CLOSED handler + reason-aware retry + queuing mode                                    | 1       |
| `core/relay/forward-assembler.ts`    | CLOSED handler + queuing mode 有効化                                                  | 1       |
| `core/relay/relay-manager.ts`        | CLOSED reason 伝播 + negentropy routing + PersistentStore リネーム                    | 1, 2    |
| `core/relay/negentropy-session.ts`   | vendored Negentropy 統合 (stub → 実装)                                                | 2       |
| `core/store-types.ts`                | SyncEngine.liveQuery async 化 + RelayCapabilityRecord.nip11 + QueryFilter #tag/search | 1, 3, 5 |
| `core/sync-engine.ts`                | liveQuery async 化 + SubscriptionManager 統合                                         | 3       |
| `core/handles/timeline-handle.ts`    | live() の liveQuery await + buildItems optimistic merge                               | 3, 4    |
| `backends/dexie/persistent-store.ts` | putEvent optimistic dedup + eventTags テーブル + queryEvents #tag                     | 4, 5    |
| `backends/dexie/schema.ts`           | eventTags テーブル + version bump                                                     | 5       |
| `testing/fakes.ts`                   | queryEvents #tag + async liveQuery + putEvent optimistic dedup                        | 3, 4, 5 |

## 10. Default Values

| Parameter                      | Default       | Configuration                                |
| ------------------------------ | ------------- | -------------------------------------------- |
| CLOSED rate-limit retry delay  | 5,000ms       | Not configurable (internal)                  |
| CLOSED rate-limit max retries  | 1             | Not configurable (internal)                  |
| Negentropy max rounds          | 10            | Not configurable (internal)                  |
| Negentropy frame size limit    | 0 (unlimited) | Not configurable (internal)                  |
| Coverage bridge fallback since | `now`         | Automatic (no coverage = future events only) |
