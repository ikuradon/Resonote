# auftakt Remaining Implementation Design

> spec.md の `[未実装]` マーカー 6 グループの実装設計。
> 実装順: C → B → A → E → D → F

---

## C. CircuitBreaker onHalfOpen 配線

### 背景

`CircuitBreaker` は `onHalfOpen` コールバックを受け付ける設計だが、`RelayManager` が `new CircuitBreaker(config)` する際に渡していない。HALF-OPEN 遷移時の probe reconnect が発火しない。

### 変更

**`core/relay/relay-manager.ts`**:

CircuitBreaker 生成箇所 (L200-202) で `onHalfOpen` コールバックを追加:

```typescript
this.#circuitBreakers.set(
  url,
  new CircuitBreaker({
    ...this.#cbConfig,
    onHalfOpen: () => this.#handleHalfOpen(url)
  })
);
```

`#handleHalfOpen(url)` は `#ensureConnection(url)` を呼んで probe reconnect を試みる。接続成功時は `recordRelaySuccess()`、失敗時は `recordRelayFailure()` が既存フローで呼ばれる。

### テスト

- CircuitBreaker が HALF-OPEN に遷移したとき `#handleHalfOpen` が呼ばれることを検証
- probe 成功 → CLOSED 遷移、失敗 → 再度 OPEN 遷移を検証

---

## B. liveQuery checkTombstone

### 背景

forward subscription で受信したイベントに対して `checkTombstone()` を呼んでいない。kind:5 が先に到着して pre-tombstone (`verified: false`) が作られた場合、後から本体イベントが来ても verified に昇格されず、削除済みイベントが表示され続ける。

### 現状

`subscription-manager.ts` (L65-81) に類似ロジックが存在するが、spec §11.2 が規定するフロー（`putEvent` の**前**に `checkTombstone` → 昇格）と一致しているか要検証。spec を正として `sync-engine.ts` の liveQuery onEvent を修正する。

### 変更

**`core/sync-engine.ts`** の liveQuery onEvent ハンドラ:

spec §11.2 のフローに従い、kind:5 以外のイベントに対して tombstone チェック + 昇格を `putEvent` の前に実行:

```typescript
onEvent: async (event, from) => {
  const nostrEvent = event as NostrEvent;

  // Pre-tombstone 昇格 (spec §11.2)
  if (nostrEvent.kind !== 5) {
    const tombstone = await tombstoneProcessor
      .checkTombstone(nostrEvent.id as string)
      .catch(() => undefined);
    if (
      tombstone &&
      !tombstone.verified &&
      nostrEvent.pubkey === tombstone.deletedByPubkey
    ) {
      await persistentStore
        .putTombstone({ ...tombstone, verified: true })
        .catch(() => undefined);
    }
  }

  await persistentStore.putEvent(nostrEvent);
  await Promise.resolve(input.onEvent(event, from)).catch(() => undefined);
},
```

### テスト

- pre-tombstone (verified: false) が存在する状態で本体イベント受信 → verified: true に昇格
- author 不一致 → 昇格しない
- tombstone なし → 通常の putEvent + onEvent フロー

---

## A. NIP-11 配線 (#2 + #7 + #8)

### 背景

1. `createRuntime` が `Nip11Registry` を自動生成せず RelayManager に渡していない
2. NIP-11 の `max_filters` が ForwardAssembler に反映されない
3. `store-types.ts` の `RelayCapabilityRecord` に `nip11` フィールドがない

### 変更

#### A-1. store-types.ts — 型追加

```typescript
export interface RelayCapabilityRecord {
  relayUrl: string;
  negentropy: 'supported' | 'unsupported' | 'unknown';
  nip11?: Nip11Info; // 追加
  source: 'config' | 'probe' | 'observed';
  lastCheckedAt?: number;
  ttlUntil?: number;
}
```

`Nip11Info` を `nip11-registry.ts` から import。`nip11-registry.ts` のローカル `RelayCapabilityRecord` 定義を削除し、`store-types.ts` の型を使用する。

#### A-2. runtime.ts — Nip11Registry 自動生成

```typescript
const nip11Registry = new Nip11Registry({ persistentStore });

const relayManager =
  config.relayManager ??
  new DefaultRelayManager({
    // ...existing config...
    nip11Registry // 追加
  });
```

#### A-3. relay-manager.ts + forward-assembler.ts — max_filters 反映

`relay-manager.ts` の NIP-11 fetch コールバック内:

```typescript
if (this.#nip11Registry) {
  void this.#nip11Registry
    .get(url)
    .then((info) => {
      if (info.maxSubscriptions !== undefined) {
        slots.setMax(info.maxSubscriptions);
      }
      if (info.maxFilters !== undefined) {
        assembler.setMaxFilters(info.maxFilters); // 追加
      }
    })
    .catch(() => undefined);
}
```

`forward-assembler.ts` に `setMaxFilters(n)` メソッド追加:

```typescript
setMaxFilters(n: number): void {
  this.#maxFilters = Math.max(1, n);
  this.#rebuild();
}
```

`#rebuild()` は既存の wire REQ 再構築メソッド。

#### A-4. RelayManager config 型

`RelayManagerConfig` に `nip11Registry?: Nip11Registry` を追加。

### テスト

- createRuntime が Nip11Registry を生成して RelayManager に渡すことを検証
- NIP-11 で maxFilters=5 → ForwardAssembler の #maxFilters が 5 に設定される
- RelayCapabilityRecord に nip11 フィールドが永続化される

---

## E. FetchResult.closedReasons

### 背景

`FetchResult` が `{ events: unknown[] }` のみ。CLOSED reason が呼び出し元に伝わらない。

### 変更

**`core/relay/fetch-scheduler.ts`**:

```typescript
import type { ClosedReasonInfo } from './closed-reason.js';

interface FetchResult {
  events: unknown[];
  acceptedRelays: string[];
  failedRelays: string[];
  successRate: number;
  closedReasons?: Record<string, ClosedReasonInfo>;
}
```

`#executeShard` 内で:

- 正常完了 relay を `acceptedRelays` に追加
- CLOSED / エラー relay を `failedRelays` に追加
- CLOSED reason を `closedReasons` map に蓄積

`fetch()` で全 shard の結果を集約:

```typescript
return {
  events: allEvents,
  acceptedRelays: [...new Set(allAccepted)],
  failedRelays: [...new Set(allFailed)],
  successRate: allAccepted.length / (allAccepted.length + allFailed.length) || 0,
  closedReasons: Object.keys(allClosedReasons).length > 0 ? allClosedReasons : undefined
};
```

### テスト

- 全 relay 成功 → successRate: 1, closedReasons: undefined
- 1/3 relay CLOSED (rate-limited) → failedRelays に含まれ closedReasons にエントリ
- 全 relay 失敗 → successRate: 0

---

## D. Optimistic merge in buildItems

### 背景

`buildItems` が MemoryStore の pending publish を merge していない。`session.cast()` で楽観的に投稿しても relay 確認前の表示に反映されない。

### 設計方針

`PersistentStore.listOptimisticEvents()` は既に存在する。`timeline-handle.ts` の `buildItems()` で optimistic events を取得し、filter にマッチするものを seed events に merge する。

### 変更

**`core/handles/timeline-handle.ts`** の `buildItems()`:

```typescript
async function buildItems(options): Promise<TItem[]> {
  const projectionFactory = registry?.getProjection(projectionKey);
  const seedEvents = await filterSeedEvents(options);

  // Optimistic merge
  const optimisticEvents = await persistentStore.listOptimisticEvents().catch(() => []);
  const confirmedIds = new Set(seedEvents.map((e) => e.id));
  const pendingOptimistic = optimisticEvents.filter(
    (oe) => oe.optimistic && oe.publishStatus !== 'failed' && !confirmedIds.has(oe.id)
  );

  // pending optimistic を seed に追加して項目構築
  const allEvents = [...seedEvents];
  for (const oe of pendingOptimistic) {
    const full = await persistentStore.getEvent(oe.id);
    if (full) allEvents.push(full);
  }

  // created_at 降順ソート
  allEvents.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));

  return allEvents.map((event) => {
    const item = buildItem(event, projectionFactory);
    // optimistic フラグ設定
    if (pendingOptimistic.some((oe) => oe.id === event.id)) {
      item.state = { ...item.state, optimistic: true };
    }
    return item;
  });
}
```

### 注意事項

- `listOptimisticEvents()` は全 optimistic events を返すため、timeline の filter にマッチするかの検証が必要。ただし初版では全 optimistic を merge し、将来的に filter match を追加する。
- `clientMutationId` による confirmed dedup は `putEvent` 層で既に処理済み (spec §6.3)。buildItems は `confirmedIds` で重複排除するだけ。
- failed optimistic (`publishStatus: 'failed'`) は merge しない。

### テスト

- optimistic event が buildItems の結果に含まれ `state.optimistic: true`
- confirmed 後に同じイベントが重複しない
- failed optimistic は含まれない

---

## F. createRuntime config 4 項目

### 背景

`connect`, `retry`, `idleTimeout`, `temporaryRelayTtl` の config が createRuntime に存在しない。`RelayConnection` と `TemporaryRelayTracker` は既にこれらを受け付ける。pass-through が欠けているだけ。

### 変更

#### F-1. runtime.ts — config 型追加

```typescript
config: {
  // ...existing...
  connect?: (url: string) => WebSocketLike;
  retry?: {
    strategy: 'exponential' | 'off';
    initialDelay?: number;
    maxDelay?: number;
    maxCount?: number;
  };
  idleTimeout?: number;
  temporaryRelayTtl?: number;
}
```

#### F-2. runtime.ts — pass-through

```typescript
const nip11Registry = new Nip11Registry({ persistentStore });
const temporaryRelayTracker = new TemporaryRelayTracker({
  temporaryRelayTtl: config.temporaryRelayTtl ?? 300_000, // 5分デフォルト
  onDisposeRelay: (url) => relayManager.disposeRelay?.(url)
});

const relayManager =
  config.relayManager ??
  new DefaultRelayManager({
    // ...existing...
    nip11Registry,
    temporaryRelayTracker,
    connect: config.connect,
    retry: config.retry,
    idleTimeout: config.idleTimeout
  });
```

#### F-3. relay-manager.ts — config 受け取り + 伝播

`RelayManagerConfig` に追加:

```typescript
connect?: (url: string) => WebSocketLike;
retry?: { strategy: 'exponential' | 'off'; initialDelay?: number; maxDelay?: number; maxCount?: number };
idleTimeout?: number;
temporaryRelayTracker?: TemporaryRelayTracker;
```

`RelayConnection` 生成時にこれらを渡す。

### テスト

- `createRuntime({ connect: mockFactory })` → RelayConnection が mockFactory を使用
- `createRuntime({ retry: { strategy: 'off' } })` → 再接続しない
- `createRuntime({ temporaryRelayTtl: 1000 })` → TemporaryRelayTracker が 1s TTL で動作

---

## spec.md マーカー更新

実装完了後、以下の `[未実装]` マーカーを除去:

- L58-59: `Event.fromId`, `NostrLink.from` の live/dispose → **除去 + 「設計上不要」に変更**
- L145: Nip11Registry → 除去
- L146: TemporaryRelayTracker → 除去
- L190: buildItems MemoryStore merge → 除去
- L300: CircuitBreaker onHalfOpen → 除去
- L307: max_filters → ForwardAssembler → 除去
- L315: nip11 フィールド → 除去
- L340-350: closedReasons → 除去
- L723-726: connect/retry/idleTimeout/temporaryRelayTtl → 除去

残すマーカー (今回スコープ外):

- L579: k-tag 読み取り
- L598: TombstoneProcessor reason
- L671: search (意図的 not implemented)
