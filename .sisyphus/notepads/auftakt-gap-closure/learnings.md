## 2026-04-18T13:32:00Z Task: pre-implementation research

- `src/shared/nostr/gateway.ts` current importers discovered by explore: `src/shared/auftakt/resonote.ts`, `src/shared/nostr/relays-config.ts`, `src/shared/nostr/cached-query.svelte.ts`.
- Current structure guard uses prefix allowlist (`src/shared/nostr/`, `src/shared/auftakt/`); Task 1 should tighten this to file-level allowlist.
- `src/shared/nostr` rough ownership split from explore:
  - protocol/domain helper: `content-link.ts`, `content-parser.ts`, `events.ts`, `helpers.ts`, `nip19-decode.ts`, `relays.ts`, `test-relays.ts`
  - adapter-specific: `cached-query.svelte.ts`, `cached-query.ts`, `client.ts`, `event-db.ts`, `nip05.ts`, `pending-publishes.ts`, `publish-signed.ts`, `query.ts`, `relays-config.ts`, `user-relays.ts`
  - compatibility shim: `gateway.ts`
  - app-owned tests: `src/shared/nostr/*.test.ts`
- Vitest package test recommendation from librarian: extend `test.include` to cover `packages/**/*.test.ts` (or use `configDefaults.include` plus that glob). Also align `coverage.include` to include `packages/**/*.ts`.

## 2026-04-18T22:39:00Z Task 1 implementation

- Gateway direct import allowlist is now file-level and intentionally limited to `src/shared/auftakt/resonote.ts`, `src/shared/nostr/relays-config.ts`, and `src/shared/nostr/cached-query.svelte.ts`.
- `scripts/auftakt-migration-guard.mjs` is the shared source of truth for gateway importer allowlist and frozen export snapshot, and is reused by both `src/architecture/structure-guard.test.ts` and `pnpm run check:auftakt-migration`.
- Gateway export validation is subtract-only: the snapshot blocks newly added exports from `src/shared/nostr/gateway.ts`, while allowing future migration work to remove exports without changing the guard first.

## 2026-04-18T22:50:00Z Task 2 ownership matrix

- `scripts/auftakt-ownership-matrix.mjs` is now the source of truth for `src/shared/nostr/*` classification. Each file records `classification`, `owner`, and `disposition` with the exact four-bucket taxonomy (`protocol/domain helper`, `adapter-specific`, `compatibility shim`, `app-owned`).
- `scripts/check-auftakt-migration.mjs -- --report ownership` prints the full ownership inventory, and `--fail-on-unclassified` hard-fails when any current `src/shared/nostr/*` file is missing from the matrix. Stale matrix entries also fail the guard.
- `src/shared/nostr/cached-query.ts` does exist in the current repo and is classified separately from `cached-query.svelte.ts`.
- `src/shared/nostr/test-relays.ts` was classified as `app-owned` based on current usage (`e2e/*`, `playwright.config.ts`, integration tests), not as a protocol helper.

## 2026-04-18T23:05:00Z Task 7 package test harness baseline

- Vitest `test.include` now covers both `src/**/*.test.ts` and `packages/**/*.test.ts`, and coverage include now also covers `packages/**/*.ts` (with `packages/**/*.test.ts` excluded) so package contracts are first-class in the same harness.
- Added independent package contract lane via `pnpm run test:packages` (`vitest run packages/`) and CI `test` job step `Package contract tests` before coverage run.
- Baseline contract tests were added at `packages/core/src/public-api.contract.test.ts`, `packages/timeline/src/public-api.contract.test.ts`, and `packages/resonote/src/public-api.contract.test.ts` to lock down package export-map leakage and raw request-style runtime API name leakage.

## 2026-04-18T23:31:00Z Task 3 pre-implementation synthesis

- Oracle recommendation: ownership split should be `packages/core` = serializable contract types only, `packages/timeline` = descriptor canonicalization + opaque `requestKey` generation, `packages/adapter-relay` = replay registry and `subId -> requestKey` mapping, `src/shared/nostr` = compat wrapper only.
- Current replay semantics from explore: `packages/adapter-relay/src/index.ts` creates random `subId` per request and uses it only as transport identity; there is no replay registry or reconnect restoration by logical request key.
- Current ad-hoc read paths from explore: `src/shared/nostr/query.ts`, `src/shared/nostr/client.ts`, and `packages/timeline/src/index.ts` create fresh backward/forward requests each call and do not normalize descriptors or persist logical request identity.
- Local `requestKey` in `src/features/profiles/ui/profile-page-view-model.svelte.ts` is only a stale-response guard and must stay distinct from runtime replay identity.
- Replay-related state currently exists mostly as vocabulary (`packages/core/src/index.ts`, `src/shared/browser/relays.svelte.ts`) rather than implemented runtime truth.

## 2026-04-18T23:32:00Z Task 3 implementation

- `packages/core` には replay registry 実装を入れず、`RequestKey`（opaque brand）と `LogicalRequestDescriptor`（serializable contract）のみ追加した。
- canonicalization + requestKey generation は `packages/timeline/src/index.ts` の `createRuntimeRequestKey()` / `buildLogicalRequestDescriptor()` に集約し、公開面では canonical serializer 文字列を露出しない `rq:v1:<digest>` 形式に固定した。
- descriptor equality は selector/window 分離で実装し、filter key order・配列 order（string/number）は正規化、window (`limit/since/until`)・scope・overlay は差分を requestKey に反映する。
- `packages/adapter-relay` に replay record registry と `subId -> requestKey` 追跡を導入し、forward stream は reconnect 時に logical `requestKey` 単位で REQ を再送して復元する実装に変更した。
- `src/shared/nostr/query.ts` と `src/shared/nostr/client.ts` は compat wrapper のまま、planner (`@auftakt/timeline`) 生成の requestKey を request factory に渡す形へ更新した。

## 2026-04-18T23:48:00Z Task 4 typed observation

- runtime-owned observation 契約を `@auftakt/core` に追加（`RelayObservation`, `SessionObservation`, `RelayObservationPacket`, reason union）。UI 側は推測ではなく表示変換だけを行う方針に寄せた。
- `packages/adapter-relay` は relay 状態遷移時に per-relay 観測を更新し、同時に aggregate session（`booting/connecting/live/replaying/degraded/disposed`）を都度再計算して observable へ配信する実装に変更した。
- reconnect replay では `open -> replaying -> open`（失敗時 `degraded`）を runtime で明示し、UI は `packet.relay.connection` と `packet.aggregate.state` を読むだけにした。
- `packages/timeline` / `packages/resonote` / `src/shared/nostr/client.ts` / `src/shared/auftakt/resonote.ts` を typed observation 形状へ追従させ、`{ state: string }` 契約を runtime 境界で廃止した。
- 契約テストは「最終状態固定」ではなく「遷移イベント検証」を重視（自動 reconnect が速く最終値が揺れるため）。`request-replay.contract.test.ts` で degraded/replaying/disposed を machine-verifiable に固定した。

## 2026-04-19T00:00:00Z Task 5 ReadSettlement cutover

- `packages/timeline/src/index.ts` に `reduceReadSettlement()` を追加し、`ReadSettlement` の canonical 生成を runtime/planner 側へ寄せた。`packages/core` には vocabulary（type/union）のみ残す方針を維持。
- `src/shared/nostr/cached-query.svelte.ts` の public read 契約は `cachedFetchById()` / `useCachedLatest()` とも `{ event, settlement }` に統一し、`source/settled/networkSettled` を公開面から除去。
- `cachedFetchById` は `null-ttl-hit` を `settled-miss` と区別して返し、`invalidated-during-fetch` は hit/miss より優先する terminal reason として保持。
- `useCachedLatest` は local-first 既存挙動を保つため settlement 算出時の `relayRequired` を false にし、UI 互換性を維持したまま canonical settlement を返す形にした。
- 契約テスト `packages/core/src/read-settlement.contract.test.ts` を新設し、`null-ttl-hit` distinct、`invalidated-during-fetch` terminal、relay lifecycle (`partial -> settled`) と `settled-miss` を固定化。

## 2026-04-19T00:08:00Z Task 6 pre-implementation synthesis

- Oracle guidance: `packages/core` は語彙のみ、`packages/timeline` が reconcile reducer/decision owner、`adapter-indexeddb` は raw storage、`src/shared/nostr/publish-signed.ts` は compat facade に寄せるのが最小で安全。
- Oracle guidance: `ReconcileReasonCode -> ConsumerVisibleState` は operation 単位の1件ではなく subject 単位 emission (`ReconcileDecision -> ReconcileEmission[]`) で扱うと `replaced-winner` / `tombstoned` / `shadowed` を表現しやすい。
- Current hotspots from exploration: replaceable handling is embedded in `packages/adapter-indexeddb/src/index.ts`; deletion visibility is inferred in `src/features/comments/ui/comment-view-model.svelte.ts`; offline retry queue is split across `src/shared/nostr/publish-signed.ts` and `src/shared/nostr/pending-publishes.ts`.

## 2026-04-19T00:24:00Z Task 6 implementation

- Reconcile decision owner を `packages/timeline/src/index.ts` に集約し、`mapReasonToConsumerState`・`emitReconcile`・`reconcileReplaceableCandidates`・`reconcileDeletionSubjects`・`reconcileReplayRepairSubjects`・`reconcileOfflineDelivery` を追加した。`packages/core` は vocabulary-only を維持。
- `packages/adapter-indexeddb/src/index.ts` は `putWithReconcile` / `putManyWithReconcile` を追加し、replaceable/parameterized-replaceable の winner/loser 判定を timeline emission で返すようにした（従来 `put` は bool 互換を維持）。
- offline queue owner split を明示するため、`src/shared/nostr/pending-publishes.ts` に `drainPendingPublishes(deliver)` を追加して queue remove/retry/expire を集約し、`src/shared/nostr/publish-signed.ts` は session delivery adapter（cast success=confirmed / failure=retrying）に限定した。
- comments deletion は `src/features/comments/domain/deletion-rules.ts` の `reconcileDeletionTargets` と `src/features/comments/infra/comment-repository.ts` の `materializeDeletedIds` を使って、UI 側の ad-hoc delete 判定を減らし canonical emission materialize を導入した。
- Task 6 向け contract tests を追加: `packages/core/src/reconcile.contract.test.ts`、`packages/adapter-indexeddb/src/reconcile.contract.test.ts`。既存 `publish-signed` / `pending-publishes` / comments deletion tests は新 owner split と retry semantics に追従。

## 2026-04-19T00:31:00Z Task 8 pre-implementation synthesis

- Remaining Task 8 leaks are narrow: `src/features/comments/ui/comment-view-model.svelte.ts`, `src/features/comments/ui/quote-view-model.svelte.ts`, `src/features/notifications/ui/notification-feed-view-model.svelte.ts`, and `src/features/relays/ui/relay-settings-view-model.svelte.ts` still depend on `$shared/nostr/cached-query.js` directly.
- `src/features/profiles/application/profile-queries.ts` still imports `@auftakt/timeline`, but exploration classified it as an approved high-level contract rather than a compatibility leak.
- Existing façade coverage is already good for `comment-subscription`, notifications VM, nip19 resolver, and content resolution, so Task 8 should stay narrow and avoid broad churn.

## 2026-04-19T01:30:00Z Task 8 verification result

- `src/shared/auftakt/resonote.ts` now re-exports the cached-read helpers that remaining consumers need, allowing feature/browser code to stop importing `$shared/nostr/cached-query.js` directly.
- Verified no remaining direct `$shared/nostr/cached-query.js` imports in the four targeted consumer files.
- Task 8 verification passed for targeted vitest set, `check:auftakt-migration -- --report consumers`, full `pnpm run test:e2e` (502 passed, 3 skipped), `pnpm run check`, and `pnpm run build`.
- Manual browser QA also succeeded on `/`, `/settings`, and `/notifications` via Playwright against preview output; only pre-existing meta-tag deprecation warnings appeared in console.

## 2026-04-19T01:57:00Z Task 9 migration completion proof

- Enhanced `scripts/check-auftakt-migration.mjs` with a `--proof` flag that outputs a structured summary of the migration state, including gateway importer counts, export stability, and ownership distribution.
- Added the migration proof check to CI (`.github/workflows/ci.yml`) as a first-class gate in the `lint-and-check` job.
- `src/shared/nostr/gateway.ts` is now explicitly marked as `@deprecated` with a clear retirement policy: it will be removed once the remaining 3 importers (resonote.ts, cached-query.svelte.ts, relays-config.ts) are migrated.
- Documentation (`README.md`, `CLAUDE.md`) now reflects the final state of the migration, providing a clear path for future maintenance and eventual retirement of compatibility shims.
- Verified that all package contract tests (`pnpm run test:packages`) and the migration proof gate pass alongside standard CI checks.

- 2026-04-19 Task 9: `check-auftakt-migration` proof should treat allowlisted internal gateway importers as compatible end-state, not automatic IN_PROGRESS. Added a dedicated `--report consumers` audit for Task 8 target scopes (comments / notifications / profiles / relays / nip19 / content-resolution) so consumer cutover status is explicit and machine-checkable.

## 2026-04-19T03:00:00Z Task 9 final-wave docs/proof gap fix

- `README.md` was corrected to match the current Cloudflare adapter/build output and now documents `pnpm run test:packages` plus `pnpm run check:auftakt-migration` in the verification section.
- `.github/workflows/ci.yml` now persists the `--proof` output as `auftakt-migration-proof` artifact via `tee`, making the migration proof machine-checkable after CI completes.
