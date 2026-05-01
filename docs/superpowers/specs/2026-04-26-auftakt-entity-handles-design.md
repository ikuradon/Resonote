# Auftakt Entity Handles Design

Date: 2026-04-26
Branch: `feat/auftakt`

## Summary

この設計は、`@auftakt/resonote` に NDK-like な Entity Handles を追加する。
目的は、app code が低レベルな read / relay hint / addressable lookup を直接組み
合わせなくても、coordinator-safe な high-level API で event、user profile、
addressable event、relay set、relay hints を扱えるようにすることである。

NDK の使いやすさは `ndk.getUser(...).fetchProfile()` のような object handle
にある。ただし Resonote では NDK の mutable object model をそのままコピーしない。
Handle は coordinator へ委譲する薄い API object とし、結果は
settlement-first に返す。

## Current Context

Strict coordinator surface は既に app-facing event IO の境界になっている。Reads、
subscriptions、publish、repair、materialization は coordinator-owned validation、
durable storage、hot indexes、visibility filtering を通る前提である。

Relay selection and outbox routing completion gate はこの HANDOFF の Task 2 で確認
済みである。Entity Handles は caller-built relay fan-out を作らず、既存の
coordinator-owned relay selection policy を使う。

Current public API は `createResonoteCoordinator()` の戻り値に高レベル operation を
集約している。`@auftakt/resonote` package root は `.` だけを export し、raw
request/session APIs、repair internals、routing helpers、plugin internals は公開しな
い contract tests を持つ。Plugin API は projection、read model、flow registration
に限定されている。

## Goals

- NDK-like な使いやすさを `ResonoteCoordinator` 上の handle factory として追加する。
- Handle creation と read execution を分け、何が handle で何が read result かを明確
  にする。
- Handle result は `ReadSettlement` と handle-level state を必ず含む。
- Handles は coordinator reads、read models、relay selection policy、visibility
  filtering へ委譲する。
- Existing facade functions は source-interoperable に残す。
- Public package closure と plugin isolation を維持する。

## Non-Goals

- NDK の mutable `NDKEvent` / `NDKUser` model の完全コピー。
- `event.react()`, `event.zap()`, `event.publish()`, `user.publish()` などの mutation
  helper。
- Wallet、zap、DM、session switching、signer lifecycle。
- Generic timeline handle や full reactive UI store。
- Package-level `event(coordinator, id)` / `profile(coordinator, pubkey)` factory
  exports。
- Raw relay session、raw WebSocket packet、raw Dexie handle、raw Dexie row、
  materializer queue、plugin registry internals、mutable routing index、transport
  subscription id の公開。

## Public Surface

Entity Handles は `ResonoteCoordinator` methods として追加する。

```ts
interface ResonoteCoordinator {
  getEvent(input: EventHandleInput): EventHandle;
  getUser(input: UserHandleInput): UserHandle;
  getAddressable(input: AddressableHandleInput): AddressableHandle;
  getRelaySet(subject: RelaySetSubject): RelaySetHandle;
  getRelayHints(eventId: string): RelayHintsHandle;
}
```

NDK に寄せるが、`event(id)` / `profile(pubkey)` のような短い noun method にはしな
い。`getUser()` や `getEvent()` は「handle を作る」ことが明確であり、
`fetchProfile()` や `fetch()` が read execution を表す。

初期 input は parsed canonical values に限定する。

```ts
interface EventHandleInput {
  readonly id: string;
  readonly relayHints?: readonly string[];
}

interface UserHandleInput {
  readonly pubkey: string;
}

interface AddressableHandleInput {
  readonly kind: number;
  readonly pubkey: string;
  readonly d: string;
}
```

`npub`, `nprofile`, `note`, `nevent`, `naddr` などの NIP-19 raw string input は将来の
thin overload として追加できるが、この wave では必須にしない。既存 NIP-19 resolver
は引き続き parsed values と relay hints を coordinator へ渡す。

## Handle Responsibilities

### EventHandle

`EventHandle` は event id と optional temporary relay hints を保持する。

```ts
interface EventHandle {
  readonly id: string;
  fetch(options?: EntityFetchOptions): Promise<EntityReadResult<StoredEvent>>;
}
```

`fetch()` は `coordinator.fetchNostrEventById(id, relayHints)` または同等の
coordinator read path を使う。Relay hints は temporary relay candidates として扱い、
durable defaults へ昇格しない。

Explicit `repair()` は初期 surface に含めない。Read 中に coordinator repair が走っ
た場合は、result state と settlement で `repaired` を表現する。Future multi-relay
repair coordinator を handle から呼ぶ API は、後続の focused design で扱う。

### UserHandle

`UserHandle` は NDK の `getUser(...).fetchProfile()` に寄せる。

```ts
interface UserHandle {
  readonly pubkey: string;
  fetchProfile(options?: EntityFetchOptions): Promise<UserProfileReadResult>;
}
```

`fetchProfile()` は kind `0` の latest profile event を coordinator path で取得する。
Result は raw event と best-effort parsed profile を分ける。Malformed profile JSON は
event を捨てる理由にはしない。`profile` は `null` になり、event と settlement は残る。

### AddressableHandle

`AddressableHandle` は parameterized replaceable event を扱う。

```ts
interface AddressableHandle {
  readonly kind: number;
  readonly pubkey: string;
  readonly d: string;
  fetch(options?: EntityFetchOptions): Promise<EntityReadResult<StoredEvent>>;
}
```

`fetch()` は `{ kinds: [kind], authors: [pubkey], '#d': [d], limit: 1 }` を使う。ただし
consumer は raw filter construction を知らなくてよい。Replacement と deletion
visibility は store/materializer の現在有効な record として表現する。

### RelaySetHandle

`RelaySetHandle` は selected relay URLs と diagnostics を high-level snapshot として
返す。

```ts
interface RelaySetHandle {
  readonly subject: RelaySetSubject;
  snapshot(): Promise<RelaySetSnapshot>;
}
```

`RelaySetSubject` は event、user、addressable、publish audience などの routing
subject を表す。初期 implementation plan では event/user/addressable subject に絞っ
てよい。Snapshot は selected read/write/temporary relay URLs と clipped diagnostics
を返すが、raw session、active subscription object、mutable routing index は返さない。

### RelayHintsHandle

`RelayHintsHandle` は durable relay hints を read-only に露出する。

```ts
interface RelayHintsHandle {
  readonly eventId: string;
  fetch(): Promise<RelayHintsReadResult>;
}
```

`fetch()` は `event_relay_hints` 相当の durable hints を normalized result に変換す
る。`recordRelayHint()` や storage mutation helper は公開しない。

## Result Model

Handles は result shape を統一する。

```ts
type EntityHandleState =
  | 'missing'
  | 'local'
  | 'partial'
  | 'relay-confirmed'
  | 'deleted'
  | 'repaired';

interface EntityReadResult<TValue> {
  readonly value: TValue | null;
  readonly sourceEvent: StoredEvent | null;
  readonly settlement: ReadSettlement;
  readonly state: EntityHandleState;
}

interface UserProfileReadResult extends EntityReadResult<Record<string, unknown>> {
  readonly profile: Record<string, unknown> | null;
}
```

`value` は handle が扱う domain value である。For event/addressable handles, `value`
は visible `StoredEvent` である。For user profile, `profile` は best-effort parsed
profile object であり、`sourceEvent` は kind `0` event である。

State は settlement と reconcile/visibility result から導出する。

- `missing`: settled miss or null TTL hit.
- `local`: local cache/store hit with no relay confirmation required.
- `partial`: local hit or miss while relay settlement is still pending.
- `relay-confirmed`: relay/materialized hit after coordinator ingress.
- `deleted`: tombstone/deletion visibility suppresses the target.
- `repaired`: repair/reconcile path restored or confirmed the subject.

## Data Flow

1. App calls `coordinator.getUser({ pubkey })` or another handle factory.
2. Factory validates canonical input and returns an immutable handle object.
3. App calls `fetch()`, `fetchProfile()`, or `snapshot()`.
4. Handle delegates to coordinator-owned read, read model, relay selection, or
   normalized relay hint path.
5. Coordinator checks hot index and durable storage first.
6. Non-`cacheOnly` reads verify or repair through relay policy.
7. Relay candidates pass through validation, materialization, reconcile, and
   visibility filtering.
8. Handle maps coordinator result into settlement-first result state.
9. Consumer receives high-level data and state only.

Handles do not store long-lived mutable runtime state. A handle may cache its normalized input, but
it must not cache raw relay sessions, Dexie handles, subscription objects, or routing indexes.

## Error Handling

Invalid handle input fails at handle creation with a high-level `TypeError`.
Examples include invalid event id, invalid pubkey, invalid addressable kind, or empty `d` tag.

Relay failures do not surface as raw transport packets. The result is expressed through
`ReadSettlement` and `EntityHandleState` unless the caller opted into an existing reject-on-error
read path.

Malformed profile JSON does not make `UserHandle.fetchProfile()` fail. It returns the source event,
`profile: null`, and the settlement that describes how the event was obtained.

Deleted or shadowed events are not returned as visible values. Handles express them with
`state: 'deleted'` or a missing result with deletion-aware settlement when the coordinator/store can
prove deletion visibility.

Relay hints are normalized. Invalid relay URLs are omitted from the result and do not mutate durable
state.

## Testing

Implementation should add focused contracts for:

- `ResonoteCoordinator` exposes `getEvent`, `getUser`, `getAddressable`, `getRelaySet`, and
  `getRelayHints`.
- `@auftakt/resonote` package root exports only handle types and coordinator methods, not
  package-level factory functions or raw internals.
- `EventHandle.fetch()` returns missing, local, partial, relay-confirmed, deleted, and repaired
  states through high-level result shapes.
- `UserHandle.fetchProfile()` follows NDK-like ergonomics while preserving settlement result data.
- `AddressableHandle.fetch()` respects replacement and deletion visibility.
- `RelaySetHandle.snapshot()` uses coordinator-owned relay selection policy and does not expose raw
  sessions or mutable routing indexes.
- `RelayHintsHandle.fetch()` exposes normalized read-only hints and cannot record or mutate hints.
- Plugin API remains limited to `registerProjection`, `registerReadModel`, and `registerFlow`.
- Existing facade interop tests still pass.
- Strict closure guard rejects raw relay/storage/materializer leakage.

Verification gate:

```bash
pnpm exec vitest run packages/resonote/src/entity-handles.contract.test.ts packages/resonote/src/public-api.contract.test.ts packages/resonote/src/plugin-isolation.contract.test.ts
pnpm run test:auftakt:core
pnpm run test:auftakt:storage
pnpm run test:auftakt:resonote
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
```

## Acceptance Criteria

- Entity Handles are added as `ResonoteCoordinator` methods, not package-level factory exports.
- API naming follows NDK's `getUser(...).fetchProfile()` ergonomics where useful.
- Results are settlement-first and expose handle-level state.
- Existing facade function names remain source-interoperable.
- Handles use coordinator-owned relay selection and visibility filtering.
- Handles do not expose raw relay session, raw WebSocket packet, raw Dexie handle, raw Dexie row,
  materializer queue, plugin registry internals, mutable routing index, or transport subscription
  id.
- Plugin API remains isolated from handles and raw runtime internals.
- Mutation helpers such as react, zap, publish, and user profile publish are deferred to later
  focused designs.

## References

- NDK subscription ergonomics:
  <https://nostr-dev-kit.github.io/ndk/tutorial/subscription-management.html>
- NDK convenience methods:
  <https://www.npmjs.com/package/%40nostr-dev-kit/ndk/v/2.5.1>
- NDK repository overview:
  <https://github.com/nostr-dev-kit/ndk>
