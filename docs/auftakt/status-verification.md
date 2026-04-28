# Auftakt NIP Compliance Verification Artifact

> Note: This document verifies the current scoped facade/spec contract. It does
> not prove the stricter coordinator-owned local-first redesign target. For that
> audit, see `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`.

このドキュメントは、Auftakt 仕様書 §14 の **scoped/canonical matrix semantics**
に対する verification companion である。公開 claim は README / 仕様書 /
本ドキュメントで同一の matrix semantics を使う。

The strict redesign matrix is checked by `pnpm run check:auftakt:nips` using
`docs/auftakt/nips-inventory.json` and `docs/auftakt/nip-matrix.json`.

## Canonical NIP Compliance Matrix

| NIP    | Target Level  | Current Status                                   | Canonical Owner                                        | Proof / Test Anchor                                                                                                                                 | Scope Notes                                                                                                                                                                                                                 |
| ------ | ------------- | ------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NIP-01 | public        | implemented (runtime-owned REQ/replay + EOSE/OK) | `packages/core/src/relay-session.ts`                   | `packages/core/src/relay-session.contract.test.ts`                                                                                                  | Contract tests cover REQ routing/replay, backward EOSE completion, and publish OK acknowledgements. Runtime-governing internals as coordinator behavior only.                                                               |
| NIP-02 | public        | implemented                                      | `src/shared/browser/follows.svelte.ts`                 | `src/shared/browser/follows.test.ts`<br>`src/features/follows/application/follow-actions.test.ts`                                                   | public follow-list behavior。WoT filtering は kind:3 の上に載る Resonote behavior                                                                                                                                           |
| NIP-04 | public-compat | implemented (compat fallback only)               | `src/shared/browser/mute.svelte.ts`                    | `src/shared/browser/mute.test.ts`                                                                                                                   | private mute-tag 復号の compatibility fallback。DM 全面対応は主張しない                                                                                                                                                     |
| NIP-05 | public        | implemented                                      | `src/shared/nostr/nip05.ts`                            | `src/shared/nostr/nip05.test.ts`                                                                                                                    | profile verification only                                                                                                                                                                                                   |
| NIP-07 | public        | implemented                                      | `src/shared/nostr/client.ts`                           | `src/shared/nostr/client-integration.test.ts`                                                                                                       | browser signer integration via `window.nostr`                                                                                                                                                                               |
| NIP-09 | public        | implemented                                      | `packages/adapter-dexie/src/index.ts`                  | `packages/core/src/reconcile.contract.test.ts`<br>`packages/adapter-dexie/src/materialization.contract.test.ts`                                     | package-owned tombstone verification と late-event suppression                                                                                                                                                              |
| NIP-10 | public        | implemented                                      | `src/features/comments/application/comment-actions.ts` | `src/features/comments/application/comment-actions.test.ts`<br>`e2e/reply-thread.test.ts`                                                           | reply threading と parent linkage                                                                                                                                                                                           |
| NIP-11 | internal      | implemented (runtime-only bounded support)       | `packages/core/src/relay-session.ts`                   | `packages/core/src/relay-session.contract.test.ts`                                                                                                  | runtime-only relay request-limit policy shapes shard queueing and reconnect replay. No public relay metadata surface and no broader NIP-11 discovery claim.                                                                 |
| NIP-17 | public        | implemented                                      | `packages/core/src/nip17-direct-message.ts`            | `packages/core/src/nip17-direct-message.contract.test.ts`                                                                                           | Core private direct-message model builds kind:14 chat and kind:15 file rumors, wraps each participant through NIP-59 gift wrap, and builds/parses kind:10050 DM relay lists.                                                |
| NIP-19 | public        | implemented                                      | `packages/core/src/crypto.ts`                          | `src/shared/nostr/nip19-decode.test.ts`<br>`src/features/nip19-resolver/application/resolve-nip19-navigation.test.ts`<br>`e2e/nip19-routes.test.ts` | standard `npub` / `nsec` / `note` / `nprofile` / `nevent` / `naddr` / `nrelay` encode/decode を core で対応。app route は profile/event subset に限定し、`nsec` は link 化しない。`ncontent` は Resonote-specific extension |
| NIP-21 | public        | implemented                                      | `packages/core/src/nip21-uri.ts`                       | `packages/core/src/nip21-uri.contract.test.ts`<br>`src/features/nip19-resolver/application/resolve-nip19-navigation.test.ts`                        | Core `nostr:` URI parser accepts non-secret NIP-19 identifiers and rejects `nsec`; app resolver normalizes profile/event routes through existing NIP-19 navigation.                                                         |
| NIP-22 | public        | implemented                                      | `src/features/comments/application/comment-actions.ts` | `src/features/comments/application/comment-actions.test.ts`                                                                                         | comment kind:1111 publish flow (event construction + publish path)                                                                                                                                                          |
| NIP-25 | public        | implemented                                      | `src/features/comments/application/comment-actions.ts` | `src/features/comments/application/comment-actions.test.ts`                                                                                         | reaction kind:7 publish flow (event construction + publish path)                                                                                                                                                            |
| NIP-27 | public        | implemented                                      | `packages/core/src/nip27-references.ts`                | `packages/core/src/nip27-references.contract.test.ts`<br>`src/shared/nostr/content-parser.test.ts`                                                  | Core parser extracts NIP-21 profile/event/addressable references from text content, builds optional p-tag/q-tag/a-tag mention tags, and powers the app content parser.                                                      |
| NIP-31 | internal      | implemented                                      | `packages/core/src/nip31-alt.ts`                       | `packages/core/src/nip31-alt.contract.test.ts`<br>`src/shared/nostr/events.test.ts`                                                                 | Core alt-tag fallback helpers parse and build human-readable summaries for unknown/custom events; kind:17 content reaction events include an `alt` tag.                                                                     |
| NIP-36 | public        | implemented                                      | `packages/core/src/nip36-content-warning.ts`           | `packages/core/src/nip36-content-warning.contract.test.ts`<br>`src/shared/nostr/events.test.ts`                                                     | Core content-warning helpers parse optional reasons; comment event builder emits NIP-36 `content-warning` tags for sensitive comments.                                                                                      |
| NIP-40 | internal      | implemented                                      | `packages/adapter-dexie/src/index.ts`                  | `packages/core/src/nip40-expiration.contract.test.ts`<br>`packages/adapter-dexie/src/materialization.contract.test.ts`                              | Core expiration-tag helpers drive Dexie-local visibility filtering, rejected expired writes, replaceable-head cleanup, negentropy omission, and explicit expired-event compaction.                                          |
| NIP-44 | public        | implemented                                      | `src/shared/browser/mute.svelte.ts`                    | `src/shared/browser/mute.test.ts`                                                                                                                   | encrypted mute/private-tag path                                                                                                                                                                                             |
| NIP-51 | public        | implemented                                      | `packages/core/src/nip51-list.ts`                      | `packages/core/src/nip51-list.contract.test.ts`                                                                                                     | Core list model covers standard lists, parameterized sets, deprecated list forms, metadata tags, chronological public tags, and private NIP-44/NIP-04 tag payload parsing used by relay, emoji, bookmark, and mute flows.   |
| NIP-59 | internal      | implemented                                      | `packages/core/src/nip59-gift-wrap.ts`                 | `packages/core/src/nip59-gift-wrap.contract.test.ts`                                                                                                | Core gift-wrap protocol builds unsigned rumors, kind:13 seals with empty tags, kind:1059 gift wraps with recipient p-tags, randomized past timestamps, ephemeral wrapper keys, and injected NIP-44 encryption.              |
| NIP-65 | public        | implemented                                      | `src/shared/browser/relays.svelte.ts`                  | `src/shared/browser/relays-fetch.test.ts`<br>`src/features/relays/application/relay-actions.test.ts`                                                | Read path is proven for kind:10002 consumption (`created_at` latest wins) with intended fallback to kind:3 only when kind:10002 yields no relay entries. Write path is separately proven by kind:10002 publish tests.       |
| NIP-73 | public        | implemented                                      | `src/shared/content/*.ts`                              | `src/shared/content/providers.test.ts`                                                                                                              | canonical external content IDs via provider `toNostrTag()`                                                                                                                                                                  |
| NIP-77 | internal-only | implemented (internal-only)                      | `packages/resonote/src/runtime.ts`                     | `packages/resonote/src/relay-repair.contract.test.ts`<br>`packages/resonote/src/public-api.contract.test.ts`                                        | negentropy repair only。public/package root surfaces は leak-free を維持                                                                                                                                                    |
| NIP-B0 | public        | implemented                                      | `src/server/api/podcast.ts`                            | `src/server/api/podcast.test.ts`                                                                                                                    | Resonote bookmark mapping / podcast resolution flow                                                                                                                                                                         |

## Canonical JSON Matrix Coverage

This companion section mirrors the NIP identifiers present in
`docs/auftakt/nip-matrix.json`. The JSON matrix remains canonical for level,
status, owner, proof, priority, and scope notes; this list exists so
`pnpm run check:auftakt:nips` can detect documentation drift without rewriting
Markdown.

NIP-01, NIP-02, NIP-03, NIP-04, NIP-05, NIP-06, NIP-07, NIP-08, NIP-09, NIP-10,
NIP-11, NIP-13, NIP-14, NIP-15, NIP-17, NIP-18, NIP-19, NIP-21, NIP-22, NIP-23,
NIP-24, NIP-25, NIP-26, NIP-27, NIP-28, NIP-29, NIP-30, NIP-31, NIP-32, NIP-34,
NIP-35, NIP-36, NIP-37, NIP-38, NIP-39, NIP-40, NIP-42, NIP-43, NIP-44, NIP-45,
NIP-46, NIP-47, NIP-48, NIP-49, NIP-50, NIP-51, NIP-52, NIP-53, NIP-54, NIP-55,
NIP-56, NIP-57, NIP-58, NIP-59, NIP-5A, NIP-60, NIP-61, NIP-62, NIP-64, NIP-65,
NIP-66, NIP-68, NIP-69, NIP-70, NIP-71, NIP-72, NIP-73, NIP-75, NIP-77, NIP-78,
NIP-7D, NIP-84, NIP-85, NIP-86, NIP-87, NIP-88, NIP-89, NIP-90, NIP-92, NIP-94,
NIP-96, NIP-98, NIP-99, NIP-A0, NIP-A4, NIP-B0, NIP-B7, NIP-BE, NIP-C0, NIP-C7,
NIP-EE

## Audit Verdict Matrix

| 目標 (Goal)                                 | 判定 (Verdict)   | 理由・理由                                                                                                                                                    |
| ------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| rx-nostr級 reconnect + REQ optimization     | Satisfied        | contract tests および E2E proof によって再接続性、capability-aware shard queueing、learned-limit adaptive REQ requeue が証明済み。                            |
| NDK級 API convenience                       | Satisfied        | façade と高レベル API の整備、および leak guard による ergonomics 保護が証明済み。                                                                            |
| strfry的 local-first seamless processing    | Satisfied        | `ReadSettlement` / reconcile / tombstone の一貫した動作が UI/Restart を含めて証明済み。                                                                       |
| scoped NIP compliance                       | Scoped-Satisfied | matrix + owner は定義済み。NIP-01, 65 の proof gap は解消済み。NIP-11 は runtime-only の限定的サポートとして matrix-managed compliance に含める。             |
| offline incremental + kind:5                | Satisfied        | kind:5/tombstone および restart/incremental proof が完了。                                                                                                    |
| minimal core + plugin-based higher features | Satisfied        | core primitive と production app/plugin API の層分離、および高次機能の plugin 移行と隔離が証明済み。                                                          |
| strict single coordinator model             | Satisfied        | packages/resonote への集約と全 API の inventory 監査が完了し、local storage helper も coordinator-owned high-level method 経由で raw DB handle を公開しない。 |

## Definitions of Compliance & Completeness

- **NIPs 完全準拠 (Scoped Complete Compliance)**: `docs/auftakt/spec.md` §14.1.3
  に列挙された **scoped compliance matrix** の全項目を満たすことを指す。
- **実装の完了 (Implementation Completeness)**:
  機能がコードとして存在し、基本的な動作が確認されている状態。
- **証明の完了 (Proof Completeness)**:
  `pnpm run check:auftakt-migration -- --proof` および関連する contract/E2E
  テストによって、機能の正当性と境界の堅牢性が機械的に検証されている状態。

## Verification notes

- **NIP-01 / NIP-11 / NIP-77** は runtime-governing internals として owner を
  package 側に固定し、README では public feature と internal runtime concern
  を混同しない。
- **NIP-04** は mute/private-tag path の fallback のみを claim し、broad public
  full-support wording を避ける。
- **NIP-19** は core の標準 prefix encode/decode と app route / E2E を proof
  に使う。route は profile/event subset に限定し、`nsec` は link 化しない。
  `ncontent` は app-specific extension として別扱いにする。
- **NIP-77** は `packages/resonote/src/public-api.contract.test.ts` を leak
  guard として併記し、internal-only claim を proof-backed に保つ。
- **NIP-65** は `packages/core/src/relay-selection.contract.test.ts` を parser /
  strategy
  proof、`packages/resonote/src/relay-selection-runtime.contract.test.ts` を
  coordinator input
  proof、`src/features/relays/application/relay-actions.test.ts` を write
  proof、`src/shared/browser/relays-fetch.test.ts` を read proof
  として分離し、kind:3 fallback は `kind:10002` に relay entry がない場合に限る
  bounded behavior として扱う。
- Task 8 監査では `buildCommentContentFilters()`, `startCommentSubscription()`,
  `startMergedCommentSubscription()`, `startCommentDeletionReconcile()`,
  `fetchProfileMetadataSources()`, `fetchNotificationTargetPreview()`,
  `fetchRelayListSources()` を registry 非経由の convenience surface
  として確認したが、いずれも coordinator/package-owned helper に閉じており raw
  transport / storage / plugin handle を公開しないため bounded mediation 上の
  non-violation とした。

## Task 7 verification commands

- `pnpm exec vitest run src/shared/browser/relays-fetch.test.ts src/features/relays/application/relay-actions.test.ts`
- `pnpm run check:auftakt-migration -- --proof`

## Task 14 verification commands

- `pnpm exec vitest run src/shared/nostr/nip19-decode.test.ts src/shared/browser/mute.test.ts packages/core/src/relay-session.contract.test.ts packages/resonote/src/relay-repair.contract.test.ts`
- `pnpm exec playwright test e2e/nip19-routes.test.ts`
- `grep -R -n 'NIP-' README.md docs/auftakt/spec.md docs/auftakt/status-verification.md`
