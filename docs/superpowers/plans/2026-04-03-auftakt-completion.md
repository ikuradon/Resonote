# Auftakt Completion Plan

> **For agentic workers:** task ごとにテストを先に追加し、RED → GREEN → verify → commit の順で進めること。foundation は完了済みなので、本 plan は「spec 本文の実用化」と「シンプルクライアントを作れる段階」までを対象にする。

**Goal:** `src/shared/nostr/auftakt/` を internal module のまま、シンプルな Nostr クライアントを構築できる実用可能領域まで引き上げる

**Architecture:** 既存 foundation を維持しつつ、`RelayManager / SyncEngine / Store / Registry / Handles` を本実装へ寄せる。仕様未解決の `Open Questions` は極力最後まで deferred のまま残し、formal spec 本文に書かれた契約と、最小クライアントに必要な E2E を優先する。

**Tech Stack:** TypeScript, SvelteKit, Dexie, Vitest, rxjs, nostr-tools

**Spec:** `docs/superpowers/specs/2026-04-02-nostr-runtime-formal-spec.md`

---

## Exit Criteria

以下を満たしたら本 plan は完了とする。

- `auftakt` 単体で
  - relay 接続
  - live subscription
  - local-first timeline load
  - publish
  - profile/follows/relays/custom emojis
    を扱える
- `simple client slice` として
  - home timeline
  - profile view
  - post publish
    の最小 E2E が通る
- `src/shared/nostr/auftakt/**/*.test.ts`
  と関連 integration test が green
- `pnpm check`
  と `pnpm lint`
  が green

---

## Scope

### In

- relay transport 本実装
- sync/backfill 本実装
- built-in relation の実用化
- local-first query/publish の運用実装 -最小クライアントで使う integration

### Out

- Resonote 全画面移行
- monorepo/package 外出し
- Open Questions の完全解消
- 高度な recommendation / ranking / moderation

---

## Phase 1: Transport / Relay Lifecycle

### Task 1.1: Real RelayManager

- `REQ / EVENT / EOSE / CLOSE / OK / CLOSED` を扱う transport 実装を追加
- relay 接続状態を保持し、複数 subscription を安全に管理する
- `publish()` と `subscribe()` を同じ manager 上に統合する

**Files**

- Create: `src/shared/nostr/auftakt/core/relay-manager.ts`
- Create: `src/shared/nostr/auftakt/core/relay-manager.test.ts`
- Modify: `src/shared/nostr/auftakt/core/runtime.ts`
- Modify: `src/shared/nostr/auftakt/core/store-types.ts`

**Verify**

- `pnpm exec vitest run src/shared/nostr/auftakt/core/relay-manager.test.ts`

### Task 1.2: Session/Connection Auth

- `NIP-42` relay auth hook を `Session` から `RelayManager` / connection レイヤへ寄せる
- protected event publish だけでなく inbox 系 read でも auth を扱える余地を作る

**Files**

- Modify: `src/shared/nostr/auftakt/core/models/session.ts`
- Modify: `src/shared/nostr/auftakt/core/relay-manager.ts`
- Modify: `src/shared/nostr/auftakt/core/models/session.test.ts`

**Verify**

- `pnpm exec vitest run src/shared/nostr/auftakt/core/models/session.test.ts src/shared/nostr/auftakt/core/relay-manager.test.ts`

---

## Phase 2: Sync / Backfill / Coverage

### Task 2.1: Coverage-Aware SyncEngine

- default stub ではなく、本物の `SyncEngine` を追加
- `queryIdentityKey / fetchWindowKey`
  を使って coverage-aware に再取得を避ける
- `resume: none / coverage-aware / force-rebuild`
  を実際の分岐に反映する

**Files**

- Create: `src/shared/nostr/auftakt/core/sync-engine.ts`
- Create: `src/shared/nostr/auftakt/core/sync-engine.test.ts`
- Modify: `src/shared/nostr/auftakt/core/runtime.ts`
- Modify: `src/shared/nostr/auftakt/core/handles/timeline-handle.ts`

**Verify**

- `pnpm exec vitest run src/shared/nostr/auftakt/core/sync-engine.test.ts src/shared/nostr/auftakt/core/handles/timeline-handle.test.ts`

### Task 2.2: Negentropy + Fallback

- capability cache を使って
  - supported relay: negentropy
  - unsupported / stale: fetch
    へ振り分ける
- relay capability probe と TTL 更新を追加

**Files**

- Modify: `src/shared/nostr/auftakt/core/sync-engine.ts`
- Modify: `src/shared/nostr/auftakt/core/relay-manager.ts`
- Modify: `src/shared/nostr/auftakt/backends/dexie/persistent-store.ts`
- Modify: `src/shared/nostr/auftakt/core/runtime.test.ts`

**Verify**

- `pnpm exec vitest run src/shared/nostr/auftakt/core/runtime.test.ts src/shared/nostr/auftakt/core/sync-engine.test.ts`

### Task 2.3: Query Refresh from PersistentStore

- `Timeline.load()` 後に sync で取り込まれた event を persistent store から再投影する
- `source = merged` と `stale = false` の更新を正しく行う

**Files**

- Modify: `src/shared/nostr/auftakt/core/handles/timeline-handle.ts`
- Modify: `src/shared/nostr/auftakt/core/handles/timeline-handle.test.ts`

**Verify**

- `pnpm exec vitest run src/shared/nostr/auftakt/core/handles/timeline-handle.test.ts`

---

## Phase 3: Built-in Relations / Models

### Task 3.1: User built-ins を実用化

- `user.profile`
- `user.relays`
- `user.follows`
- `user.customEmojis`
  を live/local-first で更新可能にする

**Files**

- Modify: `src/shared/nostr/auftakt/builtin/users.ts`
- Modify: `src/shared/nostr/auftakt/builtin/relays.ts`
- Modify: `src/shared/nostr/auftakt/builtin/emojis.ts`
- Modify: `src/shared/nostr/auftakt/core/models/user.ts`
- Modify: `src/shared/nostr/auftakt/core/models/user.test.ts`

**Verify**

- `pnpm exec vitest run src/shared/nostr/auftakt/core/models/user.test.ts src/shared/nostr/auftakt/builtin/emojis.test.ts`

### Task 3.2: Event relations を補強

- `event.related.thread`
- `event.related.reactions`
- `event.related.contentRef`
  を live 更新と persistent store 再読込に追随させる

**Files**

- Modify: `src/shared/nostr/auftakt/builtin/comments.ts`
- Modify: `src/shared/nostr/auftakt/core/models/event.ts`
- Modify: `src/shared/nostr/auftakt/core/models/event.test.ts`

**Verify**

- `pnpm exec vitest run src/shared/nostr/auftakt/core/models/event.test.ts`

### Task 3.3: Replaceable / Addressable Consistency

- replaceable 最新 1 件の代表化
- addressable key ごとの代表化
- tombstone / expiration 適用
  を query/store レイヤで統合する

**Files**

- Modify: `src/shared/nostr/auftakt/backends/dexie/persistent-store.ts`
- Modify: `src/shared/nostr/auftakt/core/handles/timeline-handle.ts`
- Modify: `src/shared/nostr/auftakt/backends/dexie/persistent-store.test.ts`

**Verify**

- `pnpm exec vitest run src/shared/nostr/auftakt/backends/dexie/persistent-store.test.ts src/shared/nostr/auftakt/core/handles/timeline-handle.test.ts`

---

## Phase 4: Publish / Optimistic / Reconciliation

### Task 4.1: Optimistic lifecycle completion

- optimistic row
- confirmed row
- partial / failed retention
- retry/discard hook
  を一貫して扱えるようにする

**Files**

- Modify: `src/shared/nostr/auftakt/core/models/session.ts`
- Modify: `src/shared/nostr/auftakt/core/memory-store.ts`
- Modify: `src/shared/nostr/auftakt/backends/dexie/persistent-store.ts`
- Modify: `src/shared/nostr/auftakt/core/models/session.test.ts`

**Verify**

- `pnpm exec vitest run src/shared/nostr/auftakt/core/models/session.test.ts`

### Task 4.2: Audience relay policy completion

- tagged user read relays
- author write relays
- override append/replace
  を relay manager まで含めて統合する

**Files**

- Modify: `src/shared/nostr/auftakt/core/models/session.ts`
- Modify: `src/shared/nostr/auftakt/core/relay-manager.ts`
- Modify: `src/shared/nostr/auftakt/core/models/session.test.ts`

**Verify**

- `pnpm exec vitest run src/shared/nostr/auftakt/core/models/session.test.ts src/shared/nostr/auftakt/core/relay-manager.test.ts`

---

## Phase 5: Simple Client Integration

### Task 5.1: Simple Home Timeline integration

- `Timeline.fromFilter()` だけで home timeline を描画できる最小 integration test を作る
- local-first load -> live update の流れを確認する

**Files**

- Create: `src/shared/nostr/auftakt/integration/home-timeline.test.ts`
- Modify: `src/shared/nostr/auftakt/core/handles/timeline-handle.ts`

**Verify**

- `pnpm exec vitest run src/shared/nostr/auftakt/integration/home-timeline.test.ts`

### Task 5.2: Simple Profile integration

- `User.fromPubkey()` から profile / relays / follows を読む最小 integration test を作る

**Files**

- Create: `src/shared/nostr/auftakt/integration/profile-view.test.ts`

**Verify**

- `pnpm exec vitest run src/shared/nostr/auftakt/integration/profile-view.test.ts`

### Task 5.3: Simple Publish integration

- `Session.open()` -> `send()` / `cast()` -> timeline 反映までの最小 integration test を作る

**Files**

- Create: `src/shared/nostr/auftakt/integration/publish-flow.test.ts`

**Verify**

- `pnpm exec vitest run src/shared/nostr/auftakt/integration/publish-flow.test.ts`

---

## Final Verification

すべて完了後に以下を通す。

- `pnpm exec vitest run src/shared/nostr/auftakt/**/*.test.ts`
- `pnpm exec vitest run src/shared/nostr/auftakt/integration/*.test.ts`
- `pnpm check`
- `pnpm lint`

---

## Integration Notes

- task ごとに commit する
- 途中で spec 本文との差分が出たら、実装より先に spec を再確認する
- `Open Questions` は blocker にしない
- Resonote feature への置換は別 plan に分ける
