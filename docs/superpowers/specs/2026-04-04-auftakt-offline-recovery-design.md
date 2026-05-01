# auftakt Offline Recovery & WebSocket Lifecycle Design

## 1. Scope

auftakt の WebSocket 切断検知、オフライン復旧同期、kind:5 削除整合性、オフライン publish queue を設計する。汎用 Nostr runtime ライブラリとして mechanism を提供し、policy はアプリが差し替え可能な Strategy Pattern で実装する。

対象:

1. WebSocket 切断検知 (沈黙的切断含む)
2. ブラウザ online/offline イベント連携
3. Circuit Breaker (壊れかけ relay の自動回避)
4. Recovery Pipeline (coverage gap 同期)
5. kind:5 削除整合性 (forward + backward + 双方向チェック)
6. Tombstone 永続化と GC
7. Offline Publish Queue (ページリロード耐性)
8. 3G / 低速環境対応 (adaptive timeout, debounce)

## 2. Design Decisions

| Item             | Decision                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| 切断検知         | 3 層: Inactivity Monitor (受動) + Probe REQ (能動) + Browser Signal (環境)                             |
| Probe 方式       | NIP-01 準拠の impossible filter REQ → EOSE で生存確認。WebSocket ping は使わない (ブラウザ API 非対応) |
| 壊れた relay     | Circuit Breaker パターン (CLOSED → OPEN → HALF-OPEN)                                                   |
| Recovery 戦略    | RecoveryStrategy interface + DefaultRecoveryStrategy。アプリが差し替え可能                             |
| kind:5 forward   | `{ kinds: [5] }` を全 relay に常時購読                                                                 |
| kind:5 backward  | syncQuery ごとに `{ kinds: [5], #e: [取得した IDs] }` を自動実行。時間窓なし                           |
| Tombstone 保存先 | PersistentStore (IndexedDB)。起動時に flash of deleted content を防ぐ                                  |
| Offline publish  | PendingPublishRecord を PersistentStore に永続化。ページリロード後も再送可能                           |
| 3G 対応          | Adaptive probe timeout (RTT × 3) + Recovery debounce (stabilityWindow + cooldown)                      |

## 3. Heartbeat & Disconnection Detection

### 3.1 Layer 1: Inactivity Monitor (受動検知)

RelayConnection にメッセージ受信時刻を追跡する `#lastActivityAt` を追加。

- メッセージ受信 (EVENT, EOSE, OK, AUTH 等) ごとに `#lastActivityAt = Date.now()` でリセット
- `inactivityTimeout` (default 90s) 経過でメッセージ受信がなければ Layer 2 を発動
- forward subscription がアクティブなら EVENT が流れるため、通常は発火しない
- `inactivityTimeout` は `RelayConnectionConfig` で設定可能

### 3.2 Layer 2: Probe (能動検知)

Inactivity timeout 発火時、即座に close せず probe REQ を送信。

- Filter: `{ ids: ["0".repeat(64)], limit: 1 }` (impossible filter)
- NIP-01: relay は任意の REQ に EOSE を返す義務がある
- EOSE 受信 → 接続は生存。`#lastActivityAt` リセット、Layer 1 に戻る
- `probeTimeout` 内に EOSE なし → 接続は死亡。`socket.close()` → retry cycle

Probe timeout は adaptive:

```
初期値: 10s (保守的、3G でも安全)
観測後: max(observed RTT × 3, 5s)
RTT 計測: probe REQ 送信時刻 → EOSE 受信時刻
```

Probe REQ は専用の subId prefix `probe:` を使用し、ForwardAssembler (`fwd:`) / FetchScheduler (`fetch:`) の通常 REQ と干渉しない。

### 3.3 Layer 3: Browser Signal (環境シグナル)

RelayManager レベルで `window` の online/offline イベントを listen。RelayConnection は環境非依存に保つ。

- `offline` イベント → 全 relay の retry timer を一時停止
- `online` イベント → 全 non-terminal relay を staggered reconnect (100ms 間隔でずらして帯域圧迫を回避、backoff リセット)
- `navigator.onLine` は信頼性が低い (WiFi 接続済みだがインターネット不通を検知できない)。Layer 1+2 が本質的な検知で、Layer 3 は補助ヒント

Browser signal の listen は `createRuntime({ browserSignals?: boolean })` で無効化可能 (Node.js / テスト環境用)。

### 3.4 Circuit Breaker

relay ごとに健全性を追跡し、壊れた relay を自動回避。

状態遷移:

```
       成功               N回連続失敗
CLOSED ──────────────→ OPEN
  ↑                     │
  │ 成功              cooldown
  │                     ↓
HALF-OPEN ←──── cooldown 完了
  │ 失敗
  └──────────────→ OPEN (cooldown 倍増)
```

| 状態      | 挙動                                                                                       |
| --------- | ------------------------------------------------------------------------------------------ |
| CLOSED    | 通常動作。連続失敗数をカウント                                                             |
| OPEN      | fetch / subscribe / recovery でこの relay をスキップ。breaker cooldown timer 稼働中        |
| HALF-OPEN | breaker cooldown 後、1 回 probe を試行。成功 → CLOSED、失敗 → OPEN (breaker cooldown 倍増) |

設定:

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number; // default 5
  cooldownMs: number; // default 60_000
  maxCooldownMs: number; // default 300_000
}
```

失敗としてカウントするもの:

- Probe timeout (EOSE が返らない)
- EOSE timeout (fetch で応答なし)
- WebSocket 接続失敗 (connect → 即 close)

失敗としてカウントしないもの:

- relay が正常に CLOSED を返す (subscription limit 等)
- relay が AUTH を要求する (NIP-42)
- WebSocket の正常 close (code 1000)

Circuit Breaker 状態は RelayManager 内部で管理。PersistentStore には保存しない (セッション単位でリセット)。

Circuit Breaker と RelayConnection のリトライの関係:

- **OPEN 遷移時**: RelayManager が `RelayConnection.dispose()` を呼び、物理接続とリトライ timer を停止する。接続試行は行わない。
- **HALF-OPEN 遷移時**: RelayManager が新しい `RelayConnection` を作成し、1 回の probe を実行する。
- **CLOSED 復帰時**: 新しい RelayConnection がそのまま通常動作に移行する。

これにより、Circuit Breaker が OPEN の間は RelayConnection のリトライが二重に走ることはない。

## 4. Recovery Pipeline

### 4.1 RecoveryStrategy Interface

```typescript
interface RecoveryContext {
  disconnectedAt: number;
  reconnectedAt: number;
  activeQueries: Array<{
    queryIdentityKey: string;
    fetchWindowKey: string;
    filter: Record<string, unknown>;
    filterBase: string;
    projectionKey: string;
    policyKey: string;
    relays: string[];
  }>;
  syncEngine: SyncEngine;
  persistentStore: PersistentStore;
  signal: AbortSignal;
}

interface RecoveryStrategy {
  onRecovery(context: RecoveryContext): Promise<void>;
}
```

`signal` により、recovery 中に再切断した場合に進行中の fetch を abort できる。

### 4.2 DefaultRecoveryStrategy

```
reconnected
  → wait stabilityWindow (default 5s)
  → [再切断?] → abort, 次の reconnect を待つ
  → [安定]
  →
  Step 1: Coverage gap fetch
    全 activeQueries に対して:
      relays = circuit breaker で健全な relay のみ
      syncEngine.syncQuery({
        filter, resume: 'force-rebuild',
        windowSince: disconnectedAt, windowUntil: reconnectedAt,
        completion: { mode: 'any' }
      })
    (syncQuery 内で kind:5 自動チェックが実行される — §5.2)

  Step 2: Pending publish retry
    persistentStore.listPendingPublishes()
    → createdAt 順に再送 (順序保持)
```

### 4.3 Debounce

```typescript
interface RecoveryConfig {
  stabilityWindow?: number; // default 5_000ms
  recoveryCooldown?: number; // default 60_000ms
  strategy?: RecoveryStrategy;
}
```

- **stabilityWindow**: reconnect 後、この時間切断しなければ recovery 開始
- **recoveryCooldown**: 前回の recovery **完了** から次の recovery までの最低間隔。cooldown 中に再切断→再接続しても skip

Recovery が abort で中断された場合は `recoveryCooldown` を発動 **しない** (完了していないため)。次の reconnect で `stabilityWindow` 経過後にすぐ新しい recovery を開始できる。

3G でフラッピングする場合、debounce により帯域の浪費を防ぐ。

### 4.4 disconnectedAt の記録と Recovery 発火条件

RelayManager が各 RelayConnection の `onStateChange` を購読 (#getOrCreateRelay 内で relay 作成時に登録)。

**記録ルール**:

- `connected → waiting-for-retrying` 遷移を検知した時点で、その relay の切断時刻を per-relay で記録
- `disconnectedAt` は全 relay の切断時刻のうち最も早いもの (first-wins)

**Recovery 発火条件**:

- 切断した relay のうち **少なくとも 1 つが reconnect** し、`stabilityWindow` を経過した時点で recovery 発火
- 全 relay の reconnect を待たない (壊れた relay が OPEN のまま復旧しない可能性がある)
- recovery の `activeQueries` には、reconnect した relay を含む query のみが対象
- 接続が途切れなかった relay は recovery 対象外 (live subscription が継続しているため gap がない)

### 4.5 AbortSignal の伝搬

Recovery 実行中に再切断した場合:

1. `AbortController.abort()` 発火
2. syncEngine.syncQuery 内で signal をチェック → 進行中の fetch を中断
3. PersistentStore への書き込みは commit 済みのものだけ残る
4. 次の reconnect で新しい recovery が gap を再計算

## 5. kind:5 Deletion Integrity

### 5.1 Forward: 常時購読

SyncEngine.liveQuery が呼ばれた時点で、`{ kinds: [5] }` を全 relay に自動登録。全 liveQuery で 1 relay につき 1 つの kind:5 subscription を共有。

到着した kind:5 は TombstoneProcessor で処理 (§5.3)。知らない author の kind:5 も DB に保存し、pre-tombstone として機能させる。

**Subscription slot 消費**: kind:5 購読は per-relay で 1 slot を常時消費する。SlotCounter の max から 1 を予約し、FetchScheduler / ForwardAssembler が使える slot 数は `max_subscriptions - 1` となる。

**参照カウント管理**: SyncEngine 内部で kind:5 購読の参照カウントを管理する。

- 最初の `liveQuery()` 呼び出し時に kind:5 subscription を `ForwardAssembler.addSubscription('deletion-watch', { kinds: [5] }, ...)` で登録
- 以降の `liveQuery()` は参照カウントをインクリメントするのみ
- `unsubscribe()` で参照カウントをデクリメント
- 参照カウントが 0 になったら `ForwardAssembler.removeSubscription('deletion-watch')` で kind:5 購読を解除
- 論理 ID `deletion-watch` は固定 (per-relay で共有)

### 5.2 Backward: syncQuery ごとの自動チェック

syncQuery が content events を取得した後、取得した event IDs に対して kind:5 を自動チェック。

```
syncQuery(filter):
  events = relayManager.fetch({ filter })
  eventIds = events.map(e => e.id)
  if (eventIds.length > 0):
    relayManager.fetch({
      filter: { kinds: [5], '#e': eventIds },   // 時間窓なし
      relays, completion: { mode: 'any' }
    })
```

時間窓を指定しないことで、100 年後の削除でも検出できる。

eventIds が 50 件超の場合は FetchScheduler の auto-shard (50 件チャンク) で分割。

### 5.3 Tombstone Processing

**設計原則**: `PersistentStore.putEvent` は純粋な保存操作として保つ。kind:5 の tombstone 処理は上位の `TombstoneProcessor` で明示的に実行する。これにより fake store との乖離を防ぎ、テスト容易性を維持する。

**TombstoneProcessor** (新規、`core/sync/tombstone-processor.ts`):

```typescript
interface TombstoneProcessor {
  // kind:5 イベントを処理して tombstone を作成
  processDeletion(deletionEvent: NostrEvent): Promise<void>;
  // 通常イベントの保存前に tombstone チェック
  checkTombstone(eventId: string): Promise<TombstoneRecord | undefined>;
}
```

**処理フロー (kind:5 到着時)**:

```
SyncEngine / liveQuery の onEvent callback:
  event を受信
  ↓
  if event.kind === 5:
    tombstoneProcessor.processDeletion(event)
      → e-tag / a-tag から target IDs / addresses を抽出
      → target event が DB にあれば author match を検証
      → 検証 OK → putTombstone(verified: true)
      → target が DB にない → putTombstone(verified: false) (pre-tombstone)
      → kind:5 event 自体も putEvent で保存
  else:
    tombstone = tombstoneProcessor.checkTombstone(event.id)
    → tombstone あり (verified: true) → putEvent するが Handle に deleted として通知
    → tombstone あり (verified: false) → author match 検証 → verified: true に昇格
    → tombstone なし → putEvent + 通常通知
```

**putEvent は副作用なし**。tombstone の作成・検証は TombstoneProcessor が SyncEngine レベルで明示的に行う。

到着順序 (kind:5 が先でも後でも) に依存しない整合性保証。

### 5.4 NIP-09 の a タグ対応

kind:5 は e-tag (event ID) と a-tag (addressable event address) の両方で削除対象を指定できる。putEvent の tombstone 処理は両方をカバー。

### 5.5 Tombstone 保存先

PersistentStore (IndexedDB) の tombstones テーブルに永続化。

理由: アプリ起動時に PersistentStore からキャッシュ済みイベントを読み込む際、tombstone が DB にあれば削除済みイベントを即座に除外できる。in-memory だと起動時に flash of deleted content が発生する。

既存の `TombstoneRecord`:

```typescript
interface TombstoneRecord {
  targetEventId?: string;
  targetAddress?: string;
  targetKindHint?: number;
  deletedByPubkey: string;
  deleteEventId: string;
  createdAt: number;
  verified: boolean;
  reason?: string;
}
```

- `verified: true` — target event が DB に存在し、author match 確認済み
- `verified: false` — pre-tombstone。target event 未到着

### 5.6 Tombstone GC

```
gcStaleTombstones:
  verified: true  → 永続保持 (削除の記録は消さない)
  verified: false → 7 日後に削除 (target が来なかった = 無関係)
```

既存の `gcExpiredOptimistic` と並行して `gcStaleTombstones` を実行。同じ GC timer で発火。

## 6. Offline Publish Queue

### 6.1 問題

現在の PublishManager は in-memory の pending queue のみ。ページリロードで pending publish が失われ、optimistic row だけが DB に残り、24h 後に GC で削除される。`session.cast()` は fire-and-forget の API 契約であり、ユーザーの投稿が消失するのは契約違反。

### 6.2 PendingPublishRecord

```typescript
interface PendingPublishRecord {
  eventId: string;
  signedEvent: NostrEvent; // 具体型: id, sig, pubkey, kind, created_at, tags, content
  relaySet: RelaySet;
  createdAt: number;
  attempts: number;
  lastAttemptAt?: number;
}
```

### 6.3 ライフサイクル

```
cast() / send()
  → signer.signEvent() → 署名済みイベント
  → persistentStore.putPendingPublish({ eventId, signedEvent, relaySet })
  → relayManager.publish(signedEvent, relaySet)
  → 成功 → persistentStore.deletePendingPublish(eventId), optimistic → confirmed
  → 失敗 → pending のまま DB に残る

--- ページリロード or reconnect ---

  Session.open() or DefaultRecoveryStrategy Step 2:
    → persistentStore.listPendingPublishes()
    → 各 pending に対して verifier(signedEvent) で署名検証
      → 検証失敗 → deletePendingPublish (改ざんされた可能性、再送しない)
      → 検証成功 → 再送へ
    → createdAt 順に再送 (投稿順序保持)
    → attempts < maxAttempts (default 10) → retry
    → attempts >= maxAttempts → deletePendingPublish + optimistic → 'failed'
```

投稿順序の保持が重要。「投稿してから削除」の順序が逆転すると、削除が先に成功して投稿が残る可能性がある。

### 6.4 PersistentStore への追加

```typescript
interface PersistentStore {
  // 既存メソッド...

  // Pending publish queue
  putPendingPublish(record: PendingPublishRecord): Promise<void>;
  deletePendingPublish(eventId: string): Promise<void>;
  listPendingPublishes(): Promise<PendingPublishRecord[]>;

  // Tombstone GC support
  listTombstones(filter: {
    verified?: boolean;
    createdBefore?: number;
  }): Promise<TombstoneRecord[]>;
  deleteTombstone(targetEventId: string): Promise<void>;
}
```

### 6.5 Session.open の実行順序

`Session.open()` での起動時処理は以下の順序で実行:

1. **Pending publish retry** — 先に再送し、optimistic row を confirmed/failed に確定
2. **GC (optimistic + tombstone)** — 確定済みの行のみを対象に GC

GC を先に実行すると、pending の optimistic row が削除されてから再送されるリスクがある。

## 7. 3G / Low Bandwidth Adaptations

| 要素                   | 対策                                                      |
| ---------------------- | --------------------------------------------------------- |
| Probe timeout          | Adaptive (RTT × 3, min 5s, 初期 10s)                      |
| Recovery timing        | stabilityWindow (5s) + recoveryCooldown (60s) で debounce |
| Recovery scope         | completion: 'any' で壊れた relay をブロッカーにしない     |
| Backoff + online event | online event で backoff リセット、offline で retry 停止   |
| Flap guard             | cooldown 中は recovery skip                               |
| Circuit Breaker        | 壊れた relay を自動回避、帯域の浪費を防止                 |

## 8. Configuration

```typescript
createRuntime({
  // Heartbeat
  inactivityTimeout?: number;    // default 90_000ms
  probeTimeout?: number;         // default 10_000ms (adaptive)

  // Circuit Breaker
  circuitBreaker?: {
    failureThreshold?: number;   // default 5
    cooldownMs?: number;         // default 60_000ms
    maxCooldownMs?: number;      // default 300_000ms
  };

  // Recovery
  recovery?: {
    stabilityWindow?: number;    // default 5_000ms
    recoveryCooldown?: number;   // default 60_000ms
    strategy?: RecoveryStrategy; // default DefaultRecoveryStrategy
  };

  // Browser signals
  browserSignals?: boolean;      // default true (false for Node.js/tests)

  // Publish
  maxPublishAttempts?: number;   // default 10

  // Tombstone
  preTombstoneTtlDays?: number;  // default 7
})
```

## 9. Default Values

| Parameter                    | Default         | Configuration                                             |
| ---------------------------- | --------------- | --------------------------------------------------------- |
| Inactivity timeout           | 90,000ms        | `createRuntime({ inactivityTimeout })`                    |
| Probe timeout (initial)      | 10,000ms        | `createRuntime({ probeTimeout })`                         |
| Probe timeout (adaptive)     | RTT × 3, min 5s | Automatic                                                 |
| Circuit breaker threshold    | 5 failures      | `createRuntime({ circuitBreaker: { failureThreshold } })` |
| Circuit breaker cooldown     | 60,000ms        | `createRuntime({ circuitBreaker: { cooldownMs } })`       |
| Circuit breaker max cooldown | 300,000ms       | `createRuntime({ circuitBreaker: { maxCooldownMs } })`    |
| Recovery stability window    | 5,000ms         | `createRuntime({ recovery: { stabilityWindow } })`        |
| Recovery cooldown            | 60,000ms        | `createRuntime({ recovery: { recoveryCooldown } })`       |
| Max publish attempts         | 10              | `createRuntime({ maxPublishAttempts })`                   |
| Pre-tombstone TTL            | 7 days          | `createRuntime({ preTombstoneTtlDays })`                  |
| Browser signals              | true            | `createRuntime({ browserSignals })`                       |

## 10. File Structure

| File                                    | 責務                                                 |
| --------------------------------------- | ---------------------------------------------------- |
| `core/relay/heartbeat.ts`               | Inactivity monitor + probe logic                     |
| `core/relay/heartbeat.test.ts`          | テスト                                               |
| `core/relay/circuit-breaker.ts`         | Circuit Breaker 状態管理                             |
| `core/relay/circuit-breaker.test.ts`    | テスト                                               |
| `core/sync/recovery-strategy.ts`        | RecoveryStrategy interface + DefaultRecoveryStrategy |
| `core/sync/recovery-strategy.test.ts`   | テスト                                               |
| `core/sync/tombstone-processor.ts`      | kind:5 tombstone 作成・検証ロジック                  |
| `core/sync/tombstone-processor.test.ts` | テスト                                               |

変更:

| File                                 | 変更内容                                                       |
| ------------------------------------ | -------------------------------------------------------------- |
| `core/relay/relay-connection.ts`     | Heartbeat 統合 (#lastActivityAt, probe 発動)                   |
| `core/relay/relay-manager.ts`        | Circuit Breaker 統合, browser signal listener, recovery 管理   |
| `core/sync-engine.ts`                | syncQuery に kind:5 自動チェック追加                           |
| `core/store-types.ts`                | PersistentStore に pending publish + tombstone GC メソッド追加 |
| `core/models/session.ts`             | Session.open で pending publish retry                          |
| `core/gc.ts`                         | gcStaleTombstones 追加                                         |
| `testing/fakes.ts`                   | fake store に pending publish メソッド追加                     |
| `backends/dexie/persistent-store.ts` | pending publish テーブル追加                                   |
| `backends/dexie/schema.ts`           | Dexie schema version bump                                      |
