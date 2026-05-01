# auftakt Relay Lifecycle & Completion Design

## 1. Scope

formal-spec.md のギャップ分析で判明した未実装 12 項目を解消し、auftakt を rx-nostr 非依存の実用 Nostr runtime に仕上げる。

対象:

1. RelayManager 自動再接続 + backoff
2. REQ replay on reconnect
3. 接続状態管理 + 公開 API
4. REQ batch/chunk (NIP-11 `max_subscriptions` / `max_filters` 尊重)
5. publish timeout
6. RelayManager `fetch()` 実装 (EOSE tracking)
7. RelayManager `probeCapabilities()` 実装
8. Temporary hints (nevent/nprofile relay hints)
9. Negentropy (NIP-77) プロトコル実装
10. Signer 実装 (nip07 / seckey / noop)
11. Event 署名検証パイプライン
12. Optimistic/failed row GC

## 2. Design Decisions

| Item                  | Decision                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| rx-nostr dependency   | Complete removal. Direct WebSocket implementation                                                |
| Reconnection strategy | Exponential backoff (with jitter) + off. Two modes only                                          |
| Connection strategy   | lazy + idle disconnect / lazy-keep. Per-relay selection                                          |
| EOSE handling         | `fetch()` (backward, completes on EOSE) / `subscribe()` (forward, persistent)                    |
| NIP-11 limits         | Fetch `max_subscriptions` / `max_filters`, queue + auto batch/shard                              |
| Event verification    | All received events + pre-signed publishes. `@noble/curves` via nostr-tools. Injectable verifier |
| Negentropy            | Vendor `hoytech/negentropy` JS. Protocol V1 (`0x61`). strfry compatible                          |
| Signer                | nip07 + seckey + noop. EventSigner interface. NIP-46 deferred                                    |
| WebSocket adapter     | Native WebSocket default + injectable `createConnection`                                         |
| Connection state API  | `getRelayState(url)` + `onConnectionStateChange(callback)`                                       |
| Relay origin info     | `onEvent` callback includes `from` (relay URL)                                                   |
| Batch/shard           | Automatic inside RelayManager. Respects NIP-11 `max_filters`                                     |

## 3. Aggregation Relay Model

### 3.0 Core Architecture

The entire auftakt module acts as an **internal aggregation relay**. From the consumer's perspective, it behaves like a single Nostr relay: you send a REQ (via `Timeline.fromFilter`), and the aggregation relay returns events from its local database and upstream relays transparently.

```
┌──────────────────────────────────────────────────────────────────────┐
│                    auftakt (Aggregation Relay)                       │
│                                                                      │
│  Handle ──REQ──→ Store ──gap?──→ SyncEngine ──REQ'──→ RelayManager  │──→ Physical Relays
│    ↑               ↑                                       │         │
│    └── projection ─┘←───────── EVENT (write back) ─────────┘         │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

- **Store** = the aggregation relay's database. ALL reads go through Store. ALL incoming events (backward and live) are written to Store before reaching Handles.
- **SyncEngine** = the aggregation relay's sync logic. Re-interprets user's filter based on Store coverage, relay selection (outbox model), and backfill policy. Manages both backward (syncQuery) and forward (live) subscription strategy.
- **RelayManager** = the aggregation relay's upstream connection pool. Pure transport: WebSocket connections, wire protocol, batch/shard, dedup, verification. No sync strategy.

### 3.0.1 Data Flow Invariant

All builtin relation handles (profile, follows, relays, emojis, thread, reactions) already follow this pattern:

```typescript
onEvent: async (event) => {
  await store.putEvent(event); // 1. Write to Store (aggregation relay DB)
  await this.load(); // 2. Re-read from Store (consistency/replaceable/tombstone applied)
};
```

**This is the canonical pattern.** Live events and backward events both flow through Store. This ensures Store's consistency rules (replaceable dedup, tombstone, expiration) are applied uniformly.

Two variants of the canonical pattern exist, distinguished by Handle type:

**Full re-read variant** (User relations, Event relations):

```typescript
onEvent: async (event) => {
  await store.putEvent(event); // 1. Write to Store
  await this.load(); // 2. Re-read from Store (full consistency)
};
```

Suitable when: event frequency is low, result sets are small, replaceable events require immediate consistency.

**Incremental + periodic reconciliation variant** (Timeline handles):

```typescript
onEvent: async (event) => {
  await store.putEvent(event); // 1. Write to Store (persistence guarantee)
  const liveItem = buildItem(event); // 2. Project only the new event
  this.items = [...this.items, liveItem]; // 3. Incremental append
  // 4. Periodic reconciliation (every 30s or N events):
  //    full re-read from Store to apply tombstone/replaceable/expiration
};
```

Suitable when: event frequency is high, result sets are large. Full re-read on every event would cause `queryEvents` (IndexedDB full scan) + `buildItems` (full projection) to run N times per second, which is too expensive.

**Both variants satisfy the Store persistence invariant**: all live events are written to Store via `putEvent()`. The difference is only in how quickly Store consistency rules are reflected in the Handle's items:

|                                     | Full re-read             | Incremental + reconciliation                       |
| ----------------------------------- | ------------------------ | -------------------------------------------------- |
| Store persistence                   | Immediate                | Immediate                                          |
| Consistency (tombstone/replaceable) | Immediate                | Eventual (up to 30s delay)                         |
| Performance                         | O(total items) per event | O(1) per event + O(total items) per reconciliation |
| Use case                            | User/Event relations     | Timeline handles                                   |

TimelineHandle.live() currently bypasses Store entirely (no `putEvent`, no reconciliation). This must be corrected: at minimum, `putEvent()` must be called for every live event to maintain the Store persistence guarantee. The incremental projection + periodic reconciliation pattern recovers consistency without sacrificing performance.

**Reconciliation trigger**: whichever fires first:

- Time-based: 30 seconds since last reconciliation
- Count-based: 50 events since last reconciliation
- Manual: Handle.load() always does a full reconciliation

**putEvent failure handling**: If `putEvent()` fails (e.g., IndexedDB quota exceeded), log the error at warn level and continue with the incremental projection. The event is not persisted but remains in the in-memory items. Next `load()` call will re-sync from relays.

### 3.0.2 load() / live() Symmetry

|                               | load() (backward)             | live() (forward)                                                                                                        |
| ----------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Who decides what to fetch** | SyncEngine (coverage-aware)   | SyncEngine (coverage-aware since, relay selection)                                                                      |
| **Who executes relay REQ**    | RelayManager.fetch()          | RelayManager.subscribe()                                                                                                |
| **Where events are written**  | SyncEngine → Store.putEvent() | onEvent → Store.putEvent()                                                                                              |
| **How Handle reads**          | Store → buildItems()          | Relations: putEvent → load() (full re-read). Timeline: putEvent → incremental append + periodic reconciliation (§3.0.1) |

Both paths write to Store. SyncEngine coordinates both. The read strategy differs by Handle type for performance (§3.0.1).

### 3.0.3 SyncEngine "live 連携"

Formal spec §7 lists "live 連携" under SyncEngine's responsibilities. This means:

1. **Coverage bridge**: Set `since` on live subscriptions based on load()'s coverage endpoint, preventing gaps between backward fill and forward subscription. If coverage is null (load() not called), `since` defaults to `now` — only future events are received. This is by design: load() and live() are separate responsibilities (spec: "初期表示と継続購読は責務が違う"). Callers should await `load()` before calling `live()` for gapless coverage.
2. **Relay selection**: Apply outbox model consistently for both load and live
3. **Store persistence guarantee**: Ensure all live events are written to PersistentStore
4. **Logical subscription management**: Track which Handles want live updates, consolidate overlapping subscriptions

SyncEngine is the **coordinator** of live subscriptions, not the transport executor. It delegates physical execution to RelayManager.

**SyncEngine.liveQuery() interface:**

```ts
interface SyncEngine {
  // Existing
  syncQuery(input: { ... }): Promise<void>;

  // New: forward subscription management
  liveQuery(input: {
    queryIdentityKey: string;
    filter: Record<string, unknown>;
    relays: string[];
    onEvent(event: NostrEvent, from: string): void | Promise<void>;
  }): { unsubscribe(): void };
}
```

`liveQuery()` internally:

1. Reads Store coverage for `queryIdentityKey` → determines `since` (coverage bridge)
2. Applies relay selection (outbox model, bootstrap relays)
3. Registers with SubscriptionManager (logical subscription)
4. SubscriptionManager delegates to RelayManager.subscribe() (physical subscription)
5. On event received: `Store.putEvent(event)` → calls `onEvent` callback
6. Returns `{ unsubscribe() }` that removes from SubscriptionManager, triggering ForwardAssembler REQ rebuild

### 3.0.4 Component Responsibilities

| Component               | Aggregation relay role                            | Responsibilities                                                                                             |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Handle**              | Client connection                                 | Declare query intent, read from Store, project items                                                         |
| **Store**               | Relay database                                    | Persist events, query, consistency (replaceable/tombstone/expiration)                                        |
| **SyncEngine**          | Upstream sync logic                               | Coverage analysis, filter re-interpretation, relay selection, live subscription management                   |
| **SubscriptionManager** | Logical subscription registry (inside SyncEngine) | Track active logical subscriptions, consolidate overlapping filters, bridge load→live                        |
| **RelayManager**        | Upstream connection pool                          | Physical WebSocket connections, wire REQ execution, batch/shard, NIP-11 slot management, dedup, verification |

### 3.0.5 Internal Decomposition

**SyncEngine internals** (`src/shared/nostr/auftakt/core/sync/`):

- **`SyncEngine`** — Public API: `syncQuery()` (backward), `liveQuery()` (forward, new), coordination
- **`SubscriptionManager`** — Logical subscription registry: tracks which Handles want what filters on which relays. On subscribe/unsubscribe, re-interprets and delegates to RelayManager. Bridges load→live coverage gap.

**RelayManager internals** (`src/shared/nostr/auftakt/core/relay/`):

- **`RelayConnection`** — Single WebSocket lifecycle, state machine, reconnect logic, message send/receive, invalid message handling
- **`FetchScheduler`** — Backward REQ: shard generation, EOSE tracking per shard, slot queuing, Promise coordination
- **`ForwardAssembler`** — Forward REQ: physical filter array assembly per relay, REQ rebuild when SubscriptionManager changes logical subscriptions, wire-level slot management
- **`PublishManager`** — EVENT tracking, OK waiting, timeout, pending publish replay on reconnect
- **`Nip11Registry`** — HTTP fetch, caching with TTL, fallback on failure
- **`RelayManager`** — Public API orchestrator composing the above

## 4. RelayManager Transport

### 4.1 Connection Lifecycle

States:

- `initialized` — constructed, not yet connected
- `connecting` — WebSocket handshake in progress
- `connected` — WebSocket open, ready to send/receive
- `waiting-for-retrying` — closed unexpectedly, retry scheduled
- `retrying` — reconnection attempt in progress
- `dormant` — idle disconnect (lazy mode only), reconnects on next REQ
- `error` — max retries exceeded
- `rejected` — relay sent close code 4000 (do not retry)
- `terminated` — disposed, no further activity

Transitions:

```
initialized ──→ connecting ──→ connected ←─→ waiting-for-retrying ──→ retrying ──→ connected
                                   │              ↑                       │
                                   ↓              │                       ↓
                                dormant      retrying ─────────────→ error
                                   │
                            (next REQ) → connecting

Any state ──→ terminated (via dispose())
connected ──→ rejected (close code 4000)
error ──→ terminated (via dispose())
rejected ──→ terminated (via dispose())
retrying ──→ waiting-for-retrying (connection fails again during retry)
```

Connection modes per relay:

- **lazy** (default for temporary hint relays): Connect on first REQ/EVENT. Idle disconnect after `idleTimeout` (default 10s). Transitions to `dormant`. Next REQ triggers reconnect.
- **lazy-keep** (default for session default relays): Connect on first REQ/EVENT. No idle disconnect. Stays `connected` until disposed.

Relay mode tracking:

- RelayManager tracks each relay's mode (`lazy` or `lazy-keep`) via an internal `#relayModes` Map
- `subscribe()` / `fetch()` with relay URLs not in the default set automatically register as `lazy`
- `session.setDefaultRelays()` registers relays as `lazy-keep`

Temporary relay cleanup:

- `dormant` temporary relays (lazy mode) are promoted to `terminated` after `temporaryRelayTtl` (default 5 minutes) of continuous dormancy
- The cleanup timer resets if the relay receives a new REQ before TTL expires

Invalid message handling:

- `JSON.parse` failures on incoming WebSocket messages are caught and silently dropped (logged at debug level)
- Messages that don't match the Nostr wire protocol format (`["EVENT", ...]`, `["OK", ...]`, etc.) are silently dropped
- These do not trigger state transitions or error states

Reconnection:

- Strategy: `exponential` (default) or `off`
- Exponential: `delay = min(initialDelay * 2^(attempt-1) + jitter, maxDelay)`
- `initialDelay`: 1,000ms
- `maxDelay`: 60,000ms
- Jitter: `(Math.random() - 0.5) * 1000` (±500ms)
- `maxCount`: unlimited (default), configurable
- `off`: no reconnection (for tests or explicit control)

Configuration:

```ts
createRuntime({
  retry: {
    strategy: 'exponential' | 'off';
    initialDelay?: number;  // default 1000
    maxDelay?: number;      // default 60000
    maxCount?: number;      // default Infinity
  },
  idleTimeout?: number;              // default 10000
  temporaryRelayTtl?: number;        // default 300000 (5 min)
  connect?: (url: string) => RelayConnection;  // WebSocket adapter injection
})
```

### 4.2 REQ Replay on Reconnect

On reconnect, ForwardAssembler and FetchScheduler each replay their current state:

1. **ForwardAssembler**: Re-sends the current assembled REQ per relay (the latest filter array state derived from SyncEngine's SubscriptionManager). This is always the up-to-date state.
2. **FetchScheduler**: Re-sends any in-progress backward shards that have not yet received EOSE.
3. **PublishManager**: Re-sends pending EVENT messages from `#pendingPublishes`.
4. Messages queued while disconnected are buffered in `#outbox` and flushed on connect.

### 4.3 NIP-11 Integration

```ts
interface Nip11Info {
  maxSubscriptions?: number;
  maxFilters?: number;
  maxEventTags?: number;
  supportedNips?: number[];
}
```

- NIP-11 fetch runs in parallel with the WebSocket connect on first contact with a relay
- HTTP fetch `https://<relay-host>` with `Accept: application/nostr+json`
- Store result in `RelayCapabilityRecord.nip11` (extends existing schema)
- First REQ uses conservative defaults (unlimited). NIP-11 results apply to subsequent REQs
- On fetch failure (CORS, timeout, non-JSON response): treat as all-unlimited. Do not retry NIP-11 fetch until TTL expires
- `supported_nips` containing `77` is used as an additional signal for negentropy capability
- NIP-11 TTL default: 1 hour

CLOSED message handling:

- When a relay sends CLOSED with a reason indicating subscription limit exceeded (e.g., `too many subscriptions`), ForwardAssembler/FetchScheduler immediately enable queuing regardless of NIP-11 state
- If NIP-11 is still being fetched, wait for the result before retrying
- The observed limit is persisted as an `observed` source capability for future sessions

Extended `RelayCapabilityRecord`:

```ts
interface RelayCapabilityRecord {
  relayUrl: string;
  negentropy: 'supported' | 'unsupported' | 'unknown';
  nip11?: Nip11Info;
  source: 'config' | 'probe' | 'observed';
  lastCheckedAt?: number;
  ttlUntil?: number;
}
```

### 4.4 Auto Batch/Shard

Backward (`fetch()`) and forward (`subscribe()`) have different strategies:

**Backward (fetch) — shard + queue:**

- Each `fetch()` call generates one or more REQ messages, each with an independent subId
- Large `authors` / `ids` arrays (> 100 items): auto-shard into chunks of 100, emitting separate subIds
- `max_filters` exceeded: split filter array across multiple REQ messages
- Each shard subId auto-closes on EOSE. The `fetch()` Promise resolves when **all shards** across all target relays complete (or timeout). Events from all shards are merged into a single `FetchResult.events` array.
- When `max_subscriptions` is exceeded, shards are queued in FetchScheduler and dispatched as slots free up (EOSE auto-close releases slots)
- Missing event IDs from negentropy (§4) that exceed 100 are also auto-sharded through this path

**Forward (subscribe) — SyncEngine SubscriptionManager → RelayManager ForwardAssembler:**

SyncEngine's SubscriptionManager maintains a registry of logical subscriptions. ForwardAssembler (inside RelayManager) handles the physical REQ assembly per relay:

```ts
// Internal state per relay
type LogicalSubscription = {
  id: string; // logical subscription ID (opaque, returned to caller)
  filter: Filter; // the individual filter for this subscription
  onEvent: (event, from) => void;
};

// Per relay, the SubscriptionManager holds:
// - Map<logicalId, LogicalSubscription>
// - One or more assembled REQ subIds (wire-level)
```

Flow on each `subscribe()` / `unsubscribe()`:

1. SyncEngine's SubscriptionManager adds or removes the logical subscription from its registry (with coverage-aware `since` and selected relays)
2. SubscriptionManager notifies RelayManager that the logical subscription set has changed
3. RelayManager's ForwardAssembler collects all active logical filters for each relay into an array: `[filter1, filter2, filter3, ...]`
4. ForwardAssembler splits the array to fit within `max_filters` per REQ (default unlimited, from NIP-11)
5. ForwardAssembler auto-shards any filter with large `authors` / `ids` (> 100 items) into chunks of 100
6. ForwardAssembler packs filters into one or more wire-level REQ messages using forward subIds
7. ForwardAssembler sends each REQ to the relay (overwrite strategy: same subId replaces previous)
8. If the filter set becomes empty for a subId, send CLOSE

Event routing (demultiplex):

- When an EVENT arrives on a wire-level subId, ForwardAssembler checks which logical subscriptions' filters match the event (simple tag/kind/author matching)
- Calls `onEvent` on each matching logical subscription
- The canonical `onEvent` pattern writes to Store then re-reads (§3.0.1), ensuring consistency
- This avoids the need for filter merging/unmerging — filters are kept as-is in the array

REQ rebuild debouncing:

- Multiple subscribe/unsubscribe calls within the same microtask are batched into a single REQ rebuild via `queueMicrotask()`. This prevents N rapid changes from causing N REQ overwrites.

REQ replay on reconnect:

- ForwardAssembler replays the current assembled REQ state (step 3-7 above) — always the latest filter array, not individual history

Slot accounting:

- Forward wire-level subIds count toward `max_subscriptions` alongside backward subIds
- ForwardAssembler and FetchScheduler share a slot counter per relay

**Common:**

- Default chunk size: 100. This is a conservative value that works within most relays' per-filter value limits (e.g., strfry's `max_filter_values`). Not currently configurable (internal implementation detail per spec §3.3).
- NIP-11 `max_subscriptions` and `max_filters` are respected for both backward and forward

### 4.5 Public Interface

```ts
// Minimal structure validated at the relay wire boundary
interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

interface FetchResult {
  events: NostrEvent[];
  acceptedRelays: string[];
  failedRelays: string[];
  successRate: number;
  relayReasonCode?: 'OK' | 'CLOSED';
  relayReasonMessage?: string;
}

interface PublishResult {
  acceptedRelays: string[];
  failedRelays: string[];
  successRate: number;
  relayReasonCode?: 'OK' | 'CLOSED';
  relayReasonMessage?: string;
}

type ConnectionState =
  | 'initialized'
  | 'connecting'
  | 'connected'
  | 'waiting-for-retrying'
  | 'retrying'
  | 'dormant'
  | 'error'
  | 'rejected'
  | 'terminated';

interface RelayManager {
  // Backward query: completes on EOSE from all relays (or timeout)
  fetch(input: {
    filter: Record<string, unknown>;
    relays: string[];
    methods?: Record<string, 'negentropy' | 'fetch'>;
    completion: CompletionPolicy;
    onEvent?(event: NostrEvent, from: string): void;
  }): Promise<FetchResult>;

  // Forward subscription: persistent until unsubscribed
  subscribe(input: {
    filter: Record<string, unknown>;
    relays: string[];
    onEvent(event: NostrEvent, from: string): void | Promise<void>;
  }): { unsubscribe(): void };

  // Publish event to write relays
  publish(event: NostrEvent, relaySet: RelaySet): Promise<PublishResult>;

  // NIP-42 relay authentication
  authenticate?(relaySet: RelaySet, signer: EventSigner): Promise<void>;

  // Probe relay capabilities (negentropy support, NIP-11)
  probeCapabilities?(
    relayUrls: string[]
  ): Promise<Record<string, 'supported' | 'unsupported' | 'unknown'>>;

  // Connection state
  getRelayState(url: string): ConnectionState;
  onConnectionStateChange(callback: (url: string, state: ConnectionState) => void): () => void;

  // Cleanup: close all connections, clear dedup set, cancel pending operations
  dispose(): void;
}
```

Boundary validation:

- All events received from relay WebSocket messages are structurally validated before signature verification: `id`, `pubkey`, `sig` must be strings, `kind` and `created_at` must be numbers, `tags` must be an array of arrays, `content` must be a string
- Events failing structural validation are silently dropped (same as invalid signatures)

### 4.6 Event Dedup

- `fetch()` and `subscribe()` deduplicate received events by `event.id`
- RelayManager maintains an internal LRU cache of seen event IDs (transport-layer dedup)
- Maximum capacity: 50,000 entries. When full, oldest entries are evicted (LRU)
- Same event arriving from multiple relays triggers `onEvent` only once (first arrival wins)
- The upper layer (`Event.fromId()`) additionally provides model-level identity mapping via `MemoryStore`, but RelayManager does not depend on MemoryStore. Transport-layer dedup is best-effort; the upper layer provides strict dedup
- LRU cache is cleared on `relayManager.dispose()`

### 4.7 Timeouts

- **EOSE timeout**: Per-relay, 10,000ms default. After timeout, resolve with events received so far from that relay. Other relays continue independently.
- **Publish OK timeout**: Per-relay, 10,000ms default. After timeout, treat relay as failed with `failureReason: 'publish-timeout'`.
- Configurable via `createRuntime({ eoseTimeout?, publishTimeout? })`

## 4. Negentropy (NIP-77)

### 4.1 Library

- Vendor `hoytech/negentropy` `js/Negentropy.js` into `src/shared/nostr/auftakt/vendor/negentropy/`
- Write a TypeScript declaration file (`negentropy.d.ts`) alongside the vendored JS
- Add vendored path to ESLint ignore, Prettier ignore, and `svelte-check` exclude
- Protocol V1 (`0x61`), MIT license, zero dependencies
- Same author as strfry: compatibility guaranteed
- Upstream update procedure: compare vendored file against `hoytech/negentropy` main branch `js/Negentropy.js`, apply diff manually

### 4.2 Protocol Flow

```
Client                              Relay
  |                                   |
  |  NEG-OPEN(sub, filter, msg)       |
  |──────────────────────────────────→|
  |                                   |
  |  NEG-MSG(sub, msg)                |
  |←──────────────────────────────────|
  |                                   |
  |  NEG-MSG(sub, msg)                |  (repeat rounds until reconciled)
  |──────────────────────────────────→|
  |                                   |
  |  NEG-MSG(sub, msg)                |
  |←──────────────────────────────────|
  |                                   |
  |  NEG-CLOSE(sub)                   |
  |──────────────────────────────────→|
  |                                   |
  |  REQ(sub2, {ids: [missing...]})   |  (fetch missing events via normal REQ)
  |──────────────────────────────────→|
```

### 4.3 SyncEngine Integration

`SyncEngine.syncQuery()` checks relay capability:

- `negentropy: 'supported'` → Use NEG-\* protocol to get diff IDs → fetch missing events via REQ
- `negentropy: 'unsupported' | 'unknown'` → Fall back to normal REQ fetch
- Both paths write results to the same query coverage and persistent store
- Capability is cached with TTL in `RelayCapabilityRecord`

### 4.4 Error Handling

- **CLOSED instead of NEG-MSG**: If the relay sends CLOSED during a negentropy session (e.g., relay does not actually support negentropy despite capability probe), immediately fall back to normal REQ fetch for that relay. Update capability to `unsupported` with `source: 'observed'`.
- **NEG-MSG timeout**: Per-round timeout of 10,000ms (same as EOSE timeout). If no NEG-MSG is received within the timeout, send NEG-CLOSE and fall back to normal REQ fetch.
- **Max rounds**: Maximum 10 NEG-MSG round trips per session. If reconciliation is not complete after 10 rounds, send NEG-CLOSE and fetch any IDs discovered so far. This prevents infinite loops from buggy relay implementations.
- **Missing events fetch**: After NEG-CLOSE, the list of missing event IDs is fetched via normal REQ. If the list exceeds 100 IDs, it is auto-sharded through FetchScheduler (§3.4 backward shard path).

## 5. Signer

### 5.1 Interface

```ts
interface EventSigner {
  signEvent(params: Record<string, unknown>): Promise<Record<string, unknown>>;
  getPublicKey(): Promise<string>;
}
```

`EventSigner` is exported from `src/shared/nostr/auftakt/core/types.ts` as the single canonical type. All internal usages (`session.ts`, `store-types.ts` `authenticate` parameter) reference this type instead of inline definitions.

Note: spec §4.1 lists `createSigner(config)` as the public API. This design replaces it with individual factory functions for better type safety. The spec should be updated accordingly.

### 5.2 Implementations

**nip07Signer(options?)**

- Wraps `window.nostr` (NIP-07 browser extension)
- Optional `tags` parameter: appends fixed tags on every sign
- Throws if `window.nostr` is unavailable

**seckeySigner(key)**

- Accepts nsec (bech32) or hex secret key
- Signs using `@noble/curves` via `nostr-tools/pure`
- Suitable for tests, CLI tools, server-side usage

**noopSigner()**

- Pass-through: returns the event as-is without signing
- For pre-signed events (e.g., `rxNostr.cast()` equivalent)
- `getPublicKey()` throws (pubkey must be provided externally)

### 5.3 Future

NIP-46 (remote signer / bunker) conforms to the `EventSigner` interface and can be added as a separate module without breaking changes.

## 6. Connection State API

```ts
type ConnectionState =
  | 'initialized'
  | 'connecting'
  | 'connected'
  | 'waiting-for-retrying'
  | 'retrying'
  | 'dormant'
  | 'error'
  | 'rejected'
  | 'terminated';
```

- `relayManager.getRelayState(url)`: Returns current connection state for a relay. Returns `'initialized'` if the relay has never been contacted.
- `relayManager.onConnectionStateChange(callback)`: Subscribes to state changes. Returns an unsubscribe function `() => void`.
- Resonote's `relays.svelte.ts` uses these to display relay health in the UI.

## 7. Temporary Hints

nevent / nprofile / naddr relay hints are injected as temporary read relays:

- Temporary relays use `lazy` connection mode with idle disconnect (10s)
- Session default relays use `lazy-keep` (no idle disconnect)
- `NostrLink.from('nostr:nevent1...')` extracts hints and passes them through the query
- Manual addition via `Timeline.fromFilter({ relays: { mode: 'append', read: [...hints] } })`
- Temporary relays are not added to the session's default relay set
- Dormant temporary relays are disposed after `temporaryRelayTtl` (default 5 min) of continuous dormancy (§3.1)

## 8. Event Verification

**Receive path (relay → client):**

- All events received via `fetch()` and `subscribe()` are structurally validated (§3.5) then signature-verified before reaching `onEvent`
- Default verifier: `@noble/curves` secp256k1 (via nostr-tools)
- Invalid signatures are silently dropped (not forwarded to consumer)

**Publish path (client → relay):**

- Events signed by the session's own signer: verification skipped (trust signer)
- Pre-signed events via `noopSigner`: verified before sending to relay
- Invalid pre-signed events cause `failureReason: 'invalid-event'`

**Injection:**

```ts
createRuntime({
  verifier?: (event: unknown) => Promise<boolean>;  // override default
})
```

Useful for tests (`async () => true` to skip verification).

## 9. Optimistic/Failed Row GC

- Confirmed optimistic rows: the optimistic row is superseded by the confirmed row immediately on reconciliation
- Failed optimistic rows: retained for retry/discard. Automatically deleted after 24 hours (measured from `created_at` of the optimistic row)
- GC is owned by `PersistentStore` and triggered by:
  - `Session.open()` — run GC on startup
  - Periodic interval (default 1 hour, configurable via `createRuntime({ gcInterval? })`)
- `gcInterval` controls the periodic run interval. The 24-hour retention period is a separate fixed constant.

## 10. Default Values

| Parameter                               | Default           | Configuration                                |
| --------------------------------------- | ----------------- | -------------------------------------------- |
| EOSE timeout                            | 10,000ms          | `createRuntime({ eoseTimeout })`             |
| Publish OK timeout                      | 10,000ms          | `createRuntime({ publishTimeout })`          |
| Idle disconnect timeout                 | 10,000ms          | `createRuntime({ idleTimeout })`             |
| Temporary relay TTL                     | 300,000ms (5 min) | `createRuntime({ temporaryRelayTtl })`       |
| Reconnect initial delay                 | 1,000ms           | `createRuntime({ retry: { initialDelay } })` |
| Reconnect max delay                     | 60,000ms          | `createRuntime({ retry: { maxDelay } })`     |
| Reconnect jitter                        | +/-500ms          | Fixed                                        |
| Reconnect max attempts                  | Unlimited         | `createRuntime({ retry: { maxCount } })`     |
| Retry strategy                          | `'exponential'`   | `createRuntime({ retry: { strategy } })`     |
| Optimistic/failed GC interval           | 1 hour            | `createRuntime({ gcInterval })`              |
| Optimistic/failed retention             | 24 hours          | Fixed                                        |
| Auto-shard chunk size                   | 100               | Internal (not configurable)                  |
| NIP-11 capability TTL                   | 1 hour            | Internal                                     |
| NIP-11 fallback (on fetch failure)      | Unlimited         | Automatic                                    |
| Dedup LRU capacity                      | 50,000            | Internal                                     |
| Negentropy max rounds                   | 10                | Internal                                     |
| Negentropy per-round timeout            | 10,000ms          | Same as EOSE timeout                         |
| Timeline reconciliation interval        | 30s               | Internal                                     |
| Timeline reconciliation event threshold | 50 events         | Internal                                     |

## 11. External Dependencies

| Package                          | Purpose                                   | Status                  |
| -------------------------------- | ----------------------------------------- | ----------------------- |
| `nostr-tools` (nip19 subpath)    | bech32 encode/decode                      | Existing                |
| `nostr-tools/pure`               | seckeySigner signing + event verification | Existing                |
| `dexie`                          | PersistentStore (IndexedDB)               | Existing                |
| `hoytech/negentropy` JS (vendor) | NIP-77 set reconciliation                 | New (vendor, zero deps) |

Removed dependencies after migration:

- `rx-nostr`
- `@rx-nostr/crypto`
- `rxjs`

## 12. Testing

- `createConnection` injection (§3.1) enables testing without real WebSocket connections
- Existing `createFakeRelayManager()` pattern is preserved for unit tests of Session, Timeline, User, Event. The fake must be updated to match the new `onEvent(event, from)` signature (§13 breaking change)
- New `RelayConnection` / `FetchScheduler` / `ForwardAssembler` / `PublishManager` each get dedicated unit tests with injected fake connections
- SyncEngine's `SubscriptionManager` tested for logical subscription lifecycle (add/remove/consolidate) and coverage bridge (load→live `since` handoff)
- Integration tests use `@ikuradon/tsunagiya` MockPool (existing pattern) for WebSocket-level testing
- State machine transitions tested as pure functions extracted from `RelayConnection`

## 13. Migration Notes

### Breaking Changes to `store-types.ts`

The `RelayManager` interface in `store-types.ts` requires the following changes:

1. `fetch()`: Add optional `onEvent?(event: NostrEvent, from: string)` parameter. Change from `fetch?` (optional method) to `fetch` (required).
2. `subscribe()`: Change `onEvent(event: unknown)` to `onEvent(event: NostrEvent, from: string)`. Change from `subscribe?` (optional method) to `subscribe` (required).
3. `probeCapabilities()`: Change from optional to required.
4. Add `getRelayState()`, `onConnectionStateChange()`, `dispose()`.
5. Add `NostrEvent` and `EventSigner` types to `types.ts`.

All call sites (SyncEngine `this.#relayManager.fetch?.()` → `this.#relayManager.fetch()`) and test fakes (`createFakeRelayManager`) must be updated.

### Breaking Changes to `SyncEngine`

The `SyncEngine` interface in `store-types.ts` requires the following addition:

1. `liveQuery()`: New method for forward subscription management. SyncEngine coordinates coverage-aware `since`, relay selection, and Store persistence.
2. All Handle `live()` methods (TimelineHandle, User relations, Event relations) must route through `SyncEngine.liveQuery()` instead of calling `RelayManager.subscribe()` directly.
3. `SubscriptionManager` is a new internal component of SyncEngine (under `src/shared/nostr/auftakt/core/sync/`).

### Dexie Schema

- `RelayCapabilityRecord` gains `nip11?: Nip11Info` field. Dexie handles new optional fields without a version bump.
- If `nip11.maxSubscriptions` indexing is needed later, a Dexie version increment is required.

### Coexistence

- rx-nostr removal is a separate phase after auftakt RelayManager is feature-complete
- Both can coexist during migration (auftakt uses its own WebSocket connections, separate from rx-nostr's pool)
- Feature code migrates one module at a time: start with new features on auftakt, migrate existing features incrementally

## 14. Spec Updates Required

The following sections of `2026-04-02-nostr-runtime-formal-spec.md` need updating after this design is approved:

- §4.1: Replace `createSigner(config)` with `nip07Signer()` / `seckeySigner()` / `noopSigner()`
- §7: Add RelayManager connection lifecycle, state management, batch/chunk, NIP-11 details, internal decomposition. Add SyncEngine.liveQuery() and SubscriptionManager to SyncEngine's responsibilities. Document aggregation relay model as core architecture.
- §13.2: Extend `RelayCapabilityRecord` with `nip11?: Nip11Info`
- §16: Close resolved open questions:
  - relay capability TTL: 1 hour default
  - optimistic/partial/failed row GC: 24h retention, 1h interval, owned by PersistentStore
  - `NostrLink` failure: not in scope (deferred)
  - `expiration` debug: not in scope (deferred)
