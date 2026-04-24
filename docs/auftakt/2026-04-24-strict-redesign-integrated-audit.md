# Auftakt Strict Redesign Integrated Audit

Date: 2026-04-24

This audit checks Auftakt against the stricter redesign goal set, not only the
current scoped `docs/auftakt/spec.md` surface. The current scoped verification
can be true for the brownfield facade while this stricter audit still fails the
target architecture.

## Audit Scope

The target architecture requires:

- rx-nostr-like reconnect resilience and automatic REQ optimization with
  batching, sharding, relay capability awareness, and replay.
- NDK-like ergonomic API access.
- strfry-inspired local-first seamless event processing.
- NIPs complete compliance through an explicit, current, owned matrix.
- offline incremental processing and kind:5 handling.
- minimal, extensible core APIs for fetch, publish, signing, and verification.
- higher-level client features through plugins/read models.
- every core and extension API mediated by a coordinator connected to a
  strfry-like local database, where relays only verify, repair, fill, and enrich
  local truth.

Performance and security are the primary acceptance criteria.

## Overall Verdict

The stricter target is not implemented yet.

The five approved redesign specs define a coherent target direction, but the
codebase still has mixed ownership between facade, coordinator, relay session,
and storage adapter. Relay events can still reach API consumers without passing
through a single verification/materialization pipeline.

## Current-Code Findings

| Area                                        | Verdict | Evidence                                                                                                                                                                                          | Risk                                                                                                                            |
| ------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Single coordinator truth                    | Fail    | `src/shared/auftakt/resonote.ts` injects `$shared/nostr/client.ts`, `$shared/nostr/query.ts`, and direct `getEventsDB()` into the coordinator runtime.                                            | APIs are facade-mediated, but transport and storage truth are not coordinator-owned.                                            |
| Relay event materialization                 | Fail    | `src/shared/nostr/query.ts` pushes `packet.event` directly into result arrays. `packages/resonote/src/runtime.ts` has some `materializeIncomingEvent()` paths, but not all read helpers use them. | Raw relay events can bypass kind:5, replaceable, relay hint, and security gates.                                                |
| Signature verification gate                 | Fail    | `packages/core/src/crypto.ts` exposes `verifier()`, but `packages/core/src/relay-session.ts` dispatches EVENT packets without mandatory verification.                                             | Invalid or malformed relay events can affect consumers or cache paths.                                                          |
| Local-first + mandatory remote verification | Fail    | `packages/resonote/src/runtime.ts` returns memory/store hits from `cachedFetchById()` with `relayRequired: false`.                                                                                | Local cache can become authoritative when the target requires every non-`cacheOnly` read to verify remote deltas.               |
| kind:5 visibility                           | Partial | `packages/adapter-indexeddb/src/index.ts` stores deletion events and suppresses late targets by scanning `tag_values`.                                                                            | Semantics are close, but no first-class `deletion_index [target_id+pubkey]`, so hot-path delete checks and repair scale poorly. |
| REQ optimization                            | Partial | `packages/core/src/request-planning.ts` canonicalizes requests and shards filters; `relay-session.ts` replays forward streams.                                                                    | Missing rx-nostr-style NIP-11 queue/capability learning and negentropy-first ordinary-read verification.                        |
| Storage backend                             | Fail    | `packages/adapter-indexeddb` uses `idb` with one `events` store and a handful of indexes.                                                                                                         | No Dexie schema, HotEventIndex, relay hint index, replaceable heads table, pending publish unification, or compaction.          |
| Plugin boundary                             | Partial | `packages/resonote` has a plugin registry, but Resonote-specific `commentsFlow` and `contentResolutionFlow` remain built-ins in the package runtime.                                              | Generic client read models and Resonote-specific flows are not cleanly separated.                                               |
| NIP compliance                              | Partial | `docs/auftakt/status-verification.md` covers a scoped matrix; `docs/superpowers/specs/2026-04-24-4-of-5-*` defines a broader matrix.                                                              | No generated CI guard against today's official NIP list drifting.                                                               |
| Offline publish                             | Partial | `src/shared/nostr/pending-publishes.ts` has an idb-backed retry queue.                                                                                                                            | It is separate from the event store and not integrated with coordinator settlement/materialization priority.                    |

## Goal-by-Goal Audit

### 1. rx-nostr-like reconnect and REQ optimization

Current implementation has meaningful primitives:

- canonical `requestKey`
- request coalescing and sharding
- forward subscription replay after reconnect
- relay observation snapshots
- negentropy transport primitive

Missing for parity:

- NIP-11 metadata fetch and durable relay capability cache.
- `max_subscriptions` and `max_filters` aware request queue.
- command queue for EVENT/REQ/CLOSE while relay is connecting or reconnecting.
- adaptive reconnect based on relative time filters.
- idle relay disconnect and lazy connection policy.
- mandatory verify/repair pass for every non-cacheOnly read.

rx-nostr explicitly advertises auto sign/verify, adaptive reconnection, NIP-11
REQ queueing, reactive relay pool reconstruction, monitoring, lazy connection,
and idling connection. Auftakt should not clone the API shape, but should adopt
the operational policies.

### 2. NDK-like API convenience

Current facade improves ergonomics, but it is still helper-oriented rather than
object/model-oriented.

Keep:

- facade import point
- `ReadSettlement`
- high-level profile/comment/relay APIs
- plugin registration concept

Add:

- entity-oriented handles for event, profile, relay set, relay hints, and
  addressable coordinates.
- `sync(filters)`, `syncAndSubscribe(filters)`, `read(filter, policy)`,
  `publish(event, policy)`, and `repair(filter, relays)` as coordinator APIs.
- pluggable cache adapters conceptually compatible with Dexie and future
  worker/SQLite/WASM stores.
- typed signing adapters for NIP-07, NIP-46, local private key, and pre-signed
  events.

NDK's key lesson is not just convenience; it is modularity. Cache, sync,
wallet, WoT, messages, and framework bindings are separate packages.

### 3. strfry-inspired local-first event processing

The target should be a browser/client translation of strfry's architecture:

- relay IO is not the source of truth.
- ingest validates and hashes before visibility.
- a single materializer/writer queue owns durable writes and conflict handling.
- read paths use indexed local storage first.
- live subscribers are matched from hot inverted indexes.
- kind:5 stores the deletion request and applies a target-id plus pubkey index.

Current adapter has good initial deletion and replaceable semantics, but it is
not a strfry-like local relay database. It lacks:

- dedicated `deletion_index`
- `event_relay_hints`
- `replaceable_heads`
- `sync_cursors`
- `pending_publishes` in the same durable schema
- memory `HotEventIndex`
- batched writer queue with priority classes
- quarantine for invalid events

### 4. NIPs complete compliance

The only sustainable definition is:

1. Fetch or vendor the official `nostr-protocol/nips` index.
2. Classify every listed NIP as public, internal, compatibility-only,
   unsupported-by-design, or out-of-scope.
3. Assign owner files and proof anchors.
4. Fail CI when the official list changes and the local matrix is not updated.

The existing `status-verification.md` is useful for the current scoped facade,
but it must not be used as proof of the stricter target.

### 5. Offline incremental and kind:5 processing

Current state:

- pending publishes survive in IndexedDB.
- kind:5 events are stored.
- known matching targets are deleted.
- late-arriving matching targets are suppressed.

Required changes:

- unify pending publishes into the Dexie event store.
- make deletion visibility independent from physical payload deletion.
- make `deletion_index [target_id+pubkey]` a high-priority durable write.
- record relay provenance for deletion events.
- include deletion index rows in repair/negentropy coverage.
- expose deleted/shadowed/rejected states only through materialized visibility,
  never through raw event delivery.

## External Implementation Lessons

### rx-nostr

Take:

- NIP-11 aware REQ queueing.
- automatic relay pool reconstruction on default relay updates.
- connection monitoring as first-class state.
- lazy connection and idle disconnect policy.
- event verification as an ingest option that should be default-on for Auftakt.

Do not take:

- direct raw relay observable as the main public API. Auftakt's stricter target
  requires coordinator-mediated local truth.

### NDK

Take:

- ergonomic object APIs.
- cache adapter interface, especially Dexie for browser persistence.
- NIP-77 sync package pattern.
- outbox model and relay list routing.
- modular package split for WoT, messaging, wallet, framework bindings.

Do not take:

- broad feature surface inside core. Auftakt core should stay primitive-only.

### strfry

Take:

- single writer/materializer queue.
- indexed query engine mentality.
- deletion event stored first, target deletion after write, no ID reuse.
- dedicated deletion index.
- negentropy index maintenance.
- IO thread separation from CPU/database work.
- retention/cron as explicit maintenance.

Translate for browser:

- `HotEventIndex` replaces relay-side active monitor sets.
- Dexie transactions replace LMDB transactions.
- a serialized materializer queue replaces strfry's writer thread.
- Web Worker is optional for crypto/filter CPU isolation.

### Major Clients

Take these as built-in plugin/read-model inputs:

- Damus/Notedeck: NostrDB-like embedded event database, per-note relay
  propagation, WoT spam ranking.
- Amethyst: full outbox relay routing, relay categories, Tor/untrusted relay
  privacy stance, broad NIP coverage.
- Snort: `NostrSystem`-style central system object with cache, query manager,
  relay metrics, relay list cache, and signature checking.
- noStrudel: power-user relay/search/discovery workflows and cache relay option.
- Iris: stale cache awareness, relay request behavior documentation, local
  storage transparency.
- lumilumi: low-data mode, mute words/threads/users/kinds, content warning
  progressive blur.

## Performance Requirements

P0 performance fixes:

1. Dexie schema with dedicated tables instead of one `events` store:
   `events`, `event_tags`, `deletion_index`, `replaceable_heads`,
   `event_relay_hints`, `sync_cursors`, `pending_publishes`, `projections`,
   `quarantine`.
2. `HotEventIndex` for hot reads:
   `byId`, `replaceableHead`, `latestByPubkeyKind`, `tagIndex`,
   `deletionIndex`, `relayHintsByEventId`, `authorRelayAffinity`,
   `timelineWindows`.
3. Serialized materializer queue:
   signature verified events enter; writes are batched; kind:5, pending publish,
   and deletion index rows bypass normal batching.
4. Backpressure:
   cap inflight REQs, cap materializer queue, drop or defer non-critical
   projections before dropping deletion/security writes.
5. Negentropy-first verification:
   for filters with local coverage, reconcile IDs first, then fetch only remote
   missing IDs. Fall back to ordinary REQ if unsupported or failed.
6. No broad scans in hot paths:
   especially deletion checks, tag lookups, relay hint routing, and profile
   latest queries.

Avoid:

- treating Dexie as the hot read path.
- re-querying all local events to build negentropy refs per request.
- making every plugin maintain its own cache of the same event truth.
- storing all derived projections eagerly when they can be rebuilt.

## Security Requirements

P0 security fixes:

1. Mandatory signature verification before materialization or consumer emission.
2. Event ID recomputation and shape validation before any storage write.
3. Quarantine invalid events with relay URL, reason, and timestamp.
4. No raw relay event escapes from transport to app/plugin code.
5. Relay URL normalization and allow/deny policy before connection.
6. NIP-42 AUTH handling in the relay gateway.
7. NIP-70 protected event policy classification.
8. NIP-44/NIP-17/NIP-59 encrypted content retention policy.
9. NIP-49 support only through signer/session modules, not core event storage.
10. Pending publish durability before reporting accepted local settlement.

Security-sensitive non-goals:

- plugins must not receive raw Dexie handles.
- plugins must not receive raw relay sessions.
- plugins must not bypass materialized visibility.
- private/encrypted payload compaction must not leak decrypted content into
  projections.

## Required Spec Corrections

These corrections are reflected in the 1-of-5 through 5-of-5 redesign specs and
must stay in place before implementation:

1. Spec 1 explicitly states that signature verification is a hard gate before
   `Materializer.apply()` and before any consumer-visible emission.
2. Spec 1 adds a `quarantine` table and invalid event policy.
3. Spec 2 imports rx-nostr-style NIP-11 command/REQ queue behavior.
4. Spec 2 defines `cacheOnly` as the only normal policy that suppresses
   remote verification.
5. Spec 3 moves Resonote-only comments/content flows out of generic built-ins
   and keeps relay intelligence as coordinator/storage infrastructure.
6. Spec 4 requires a generated official-NIP inventory check in CI.
7. Spec 5 includes quota tests, migration rollback, and encrypted/private
   retention cases.

## Implementation Order

1. Add tests for strict coordinator mediation:
   raw relay EVENT must not reach any public read/subscription API unless
   verified and materialized.
2. Add mandatory verifier gate in relay/coordinator ingress.
3. Introduce Dexie event store alongside the current idb adapter.
4. Add migration from current idb events and pending publish DB.
5. Add `deletion_index`, `replaceable_heads`, `event_relay_hints`, and
   `pending_publishes`.
6. Add `HotEventIndex` and materializer queue.
7. Cut `cachedFetchById`, `useCachedLatest`, `fetchBackwardEvents`, and
   subscription flows over to `EventCoordinator`.
8. Add negentropy-first verification with ordinary REQ fallback.
9. Move Resonote-only flows to packages/resonote-specific plugins.
10. Add official NIPs matrix generator and CI guard.
11. Add compaction/retention policies and quota degradation tests.

## Primary Sources Consulted

- rx-nostr: https://github.com/penpenpng/rx-nostr
- NDK: https://github.com/nostr-dev-kit/ndk
- NDK Sync & Negentropy: https://nostr-dev-kit.github.io/ndk/sync/index.html
- strfry architecture: https://github.com/hoytech/strfry/blob/master/docs/architecture.md
- strfry event write/delete handling: https://github.com/hoytech/strfry/blob/master/src/events.cpp
- Official NIPs: https://github.com/nostr-protocol/nips
- Snort NostrSystem: https://docs.snort.social/classes/_snort_system.NostrSystem
- Damus: https://github.com/damus-io/damus
- Amethyst: https://github.com/vitorpamplona/amethyst
- noStrudel: https://github.com/hzrd149/nostrudel
- Iris FAQ: https://github.com/irislib/faq
- lumilumi: https://nostrapps.com/lumilumi
- Nostr client feature matrix: https://nostorg.github.io/clients/
