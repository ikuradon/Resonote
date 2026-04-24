# Auftakt NIP Compliance Verification Artifact

> Note: This document verifies the current scoped facade/spec contract. It does
> not prove the stricter coordinator-owned local-first redesign target. For that
> audit, see
> `docs/auftakt/2026-04-24-strict-redesign-integrated-audit.md`.

このドキュメントは、Auftakt 仕様書 §14 の **scoped/canonical matrix semantics**
に対する verification companion である。公開 claim は README / 仕様書 /
本ドキュメントで同一の matrix semantics を使う。

The strict redesign matrix is checked by `pnpm run check:auftakt:nips` using
`docs/auftakt/nips-inventory.json` and `docs/auftakt/nip-matrix.json`.

## Canonical NIP Compliance Matrix

| NIP    | Target Level  | Current Status                                   | Canonical Owner                                                       | Proof / Test Anchor                                                                                                                                 | Scope Notes                                                                                                                                                                                                           |
| ------ | ------------- | ------------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NIP-01 | public        | implemented (runtime-owned REQ/replay + EOSE/OK) | `packages/core/src/relay-session.ts`                                  | `packages/core/src/relay-session.contract.test.ts`                                                                                                  | Contract tests cover REQ routing/replay, backward EOSE completion, and publish OK acknowledgements. Runtime-governing internals as coordinator behavior only.                                                         |
| NIP-02 | public        | implemented                                      | `src/shared/browser/follows.svelte.ts`                                | `src/shared/browser/follows.test.ts`<br>`src/features/follows/application/follow-actions.test.ts`                                                   | public follow-list behavior。WoT filtering は kind:3 の上に載る Resonote behavior                                                                                                                                     |
| NIP-04 | public-compat | implemented (compat fallback only)               | `src/shared/browser/mute.svelte.ts`                                   | `src/shared/browser/mute.test.ts`                                                                                                                   | private mute-tag 復号の compatibility fallback。DM 全面対応は主張しない                                                                                                                                               |
| NIP-05 | public        | implemented                                      | `src/shared/nostr/nip05.ts`                                           | `src/shared/nostr/nip05.test.ts`                                                                                                                    | profile verification only                                                                                                                                                                                             |
| NIP-07 | public        | implemented                                      | `src/shared/nostr/client.ts`                                          | `src/shared/nostr/client-integration.test.ts`                                                                                                       | browser signer integration via `window.nostr`                                                                                                                                                                         |
| NIP-09 | public        | implemented                                      | `packages/adapter-indexeddb/src/index.ts`                             | `packages/core/src/reconcile.contract.test.ts`<br>`packages/adapter-indexeddb/src/reconcile.contract.test.ts`                                       | package-owned tombstone verification と late-event suppression                                                                                                                                                        |
| NIP-10 | public        | implemented                                      | `src/features/comments/application/comment-actions.ts`                | `src/features/comments/application/comment-actions.test.ts`<br>`e2e/reply-thread.test.ts`                                                           | reply threading と parent linkage                                                                                                                                                                                     |
| NIP-11 | internal      | implemented (runtime-only bounded support)       | `packages/core/src/relay-session.ts`                                  | `packages/core/src/relay-session.contract.test.ts`                                                                                                  | runtime-only relay request-limit policy shapes shard queueing and reconnect replay. No public relay metadata surface and no broader NIP-11 discovery claim.                                                           |
| NIP-19 | public        | implemented                                      | `src/features/nip19-resolver/application/resolve-nip19-navigation.ts` | `src/shared/nostr/nip19-decode.test.ts`<br>`src/features/nip19-resolver/application/resolve-nip19-navigation.test.ts`<br>`e2e/nip19-routes.test.ts` | standard `npub` / `nprofile` / `note` / `nevent` を公開対応。`ncontent` は Resonote-specific extension であり標準 NIP-19 claim には含めない                                                                           |
| NIP-22 | public        | implemented                                      | `src/features/comments/application/comment-actions.ts`                | `src/features/comments/application/comment-actions.test.ts`                                                                                         | comment kind:1111 publish flow (event construction + publish path)                                                                                                                                                    |
| NIP-25 | public        | implemented                                      | `src/features/comments/application/comment-actions.ts`                | `src/features/comments/application/comment-actions.test.ts`                                                                                         | reaction kind:7 publish flow (event construction + publish path)                                                                                                                                                      |
| NIP-44 | public        | implemented                                      | `src/shared/browser/mute.svelte.ts`                                   | `src/shared/browser/mute.test.ts`                                                                                                                   | encrypted mute/private-tag path                                                                                                                                                                                       |
| NIP-65 | public        | implemented                                      | `src/shared/browser/relays.svelte.ts`                                 | `src/shared/browser/relays-fetch.test.ts`<br>`src/features/relays/application/relay-actions.test.ts`                                                | Read path is proven for kind:10002 consumption (`created_at` latest wins) with intended fallback to kind:3 only when kind:10002 yields no relay entries. Write path is separately proven by kind:10002 publish tests. |
| NIP-73 | public        | implemented                                      | `src/shared/content/*.ts`                                             | `src/shared/content/providers.test.ts`                                                                                                              | canonical external content IDs via provider `toNostrTag()`                                                                                                                                                            |
| NIP-77 | internal-only | implemented (internal-only)                      | `packages/resonote/src/runtime.ts`                                    | `packages/resonote/src/relay-repair.contract.test.ts`<br>`packages/resonote/src/public-api.contract.test.ts`                                        | negentropy repair only。public/package root surfaces は leak-free を維持                                                                                                                                              |
| NIP-B0 | public        | implemented                                      | `src/server/api/podcast.ts`                                           | `src/server/api/podcast.test.ts`                                                                                                                    | Resonote bookmark mapping / podcast resolution flow                                                                                                                                                                   |

## Audit Verdict Matrix

| 目標 (Goal)                                 | 判定 (Verdict) | 理由・理由                                                                                                                                                                 |
| ------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| rx-nostr級 reconnect + REQ optimization     | Satisfied      | contract tests および E2E proof によって再接続性と REQ 最適化が証明済み。                                                                                                  |
| NDK級 API convenience                       | Satisfied      | façade と高レベル API の整備、および leak guard による ergonomics 保護が証明済み。                                                                                         |
| strfry的 local-first seamless processing    | Satisfied      | `ReadSettlement` / reconcile / tombstone の一貫した動作が UI/Restart を含めて証明済み。                                                                                    |
| scoped NIP compliance                       | Partial        | matrix + owner は定義済み。NIP-01, 65 の proof gap は解消済み。NIP-11 は runtime-only の限定的サポート（意図的スコープ）のため Partial 判定を維持。                        |
| offline incremental + kind:5                | Satisfied      | kind:5/tombstone および restart/incremental proof が完了。                                                                                                                 |
| minimal core + plugin-based higher features | Satisfied      | public API 基盤の上で、高次機能の plugin 移行と隔離が証明済み。                                                                                                            |
| strict single coordinator model             | Satisfied      | packages/resonote への集約と全 API の inventory 監査が完了し、registry 非経由の convenience surface も coordinator/package-owned non-violation として明示 allowlist 済み。 |

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
- **NIP-19** は標準 prefix の decode / route / E2E を proof に使い、`ncontent`
  は app-specific extension として別扱いにする。
- **NIP-77** は `packages/resonote/src/public-api.contract.test.ts` を leak
  guard として併記し、internal-only claim を proof-backed に保つ。
- **NIP-65** は `src/features/relays/application/relay-actions.test.ts` を write
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
