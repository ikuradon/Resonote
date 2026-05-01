# Auftakt Resonote Operational Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `packages/auftakt-resonote` の `comments / content resolver / projection` を foundation から実働部品に引き上げ、`src/shared/nostr/auftakt-runtime.ts` に残る comment/content 系実処理を薄い bridge に縮退する。

**Architecture:** `resonote.comments` は `sync.fetchMany -> store.putEvent -> projection` の read path に乗せる。`resonote.content` は tag 抽出だけでなく preset の content resolution 入口にし、`resonote.feed` は `deleted / optimistic` を含む feed state 正規化を担う。app 側は package API を使うだけに寄せる。

**Tech Stack:** TypeScript, Vitest, pnpm, existing `packages/auftakt` runtime/registry/sync/store, Svelte app bridge

---

### Task 1: 現行 preset の no-op / thin path を固定する failing test を追加

**Files:**

- Modify: `packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts`
- Modify: `packages/auftakt-resonote/src/index.test.ts`
- Test: `packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts`

- [ ] `comments` が `runtime.store.queryEvents()` 直呼びではなく `runtime.sync.fetchMany()` 契約を期待する failing test を追加する
- [ ] `content resolver` が raw tag 抽出に加えて `contentKind / hint / value` を安定返却する failing test を追加する
- [ ] `projection` が `deleted / optimistic` だけでなく feed item state を正規化する failing test を追加する
- [ ] Run: `pnpm exec vitest run packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts packages/auftakt-resonote/src/index.test.ts`
- [ ] Expected: FAIL
- [ ] Commit: `test: add failing resonote preset operational coverage`

### Task 2: `resonote.comments` を operational relation にする

**Files:**

- Modify: `packages/auftakt-resonote/src/comments/comment-relation.ts`
- Modify: `packages/auftakt-resonote/src/index.ts`
- Test: `packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts`

- [ ] `comment-relation.ts` に `runtime.sync.fetchMany()` を使う relation 実装を入れる
- [ ] comment filter 組み立てを `eventId -> kinds[#e]` に固定し、返却値を event 配列ではなく正規化済み list にする
- [ ] `sync.fetchMany()` が返す `items/source/stale/coverage` を relation state へ反映する
- [ ] Run: `pnpm exec vitest run packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts`
- [ ] Expected: PASS
- [ ] Commit: `feat: operationalize resonote comment relation`

### Task 3: `resonote.feed` projection を operational にする

**Files:**

- Modify: `packages/auftakt-resonote/src/projection/resonote-projection.ts`
- Test: `packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts`

- [ ] feed projection に `deleted / optimistic / source / stale` を正規化する state builder を入れる
- [ ] raw event 側の `kind:5`, `clientMutationId`, `deleted`, `optimistic`, `state` を優先順位付きで reconcile する
- [ ] projection の返り値 shape を test に合わせて固定する
- [ ] Run: `pnpm exec vitest run packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts`
- [ ] Expected: PASS
- [ ] Commit: `feat: operationalize resonote feed projection`

### Task 4: `resonote.content` resolver を operational にする

**Files:**

- Modify: `packages/auftakt-resonote/src/content/content-resolver.ts`
- Test: `packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts`

- [ ] `I/i` と `K/k` tag から `value / hint / contentKind` を抽出するだけでなく、object/string の両入力で同じ resolution shape を返すようにする
- [ ] `NIP-73` の ID 構文を壊さず、preset 側では app-specific resolver 入口だけを担うように contract を固定する
- [ ] Run: `pnpm exec vitest run packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts`
- [ ] Expected: PASS
- [ ] Commit: `feat: operationalize resonote content resolver`

### Task 5: comment subscription bridge を package 主体に戻す

**Files:**

- Modify: `packages/auftakt-resonote/src/bridge/comment-subscription-bridge.ts`
- Modify: `packages/auftakt-resonote/src/bridge/comment-subscription-bridge.test.ts`
- Modify: `src/shared/nostr/auftakt-runtime.ts`
- Test: `packages/auftakt-resonote/src/bridge/comment-subscription-bridge.test.ts`
- Test: `src/shared/nostr/auftakt-comment-bridge.test.ts`

- [ ] bridge 実装を package 側の logical subscription と dual request orchestration に寄せる
- [ ] `src/shared/nostr/auftakt-runtime.ts` は factory 呼び出しだけの thin wrapper にする
- [ ] app 側 test を package bridge 契約に合わせて更新する
- [ ] Run: `pnpm exec vitest run packages/auftakt-resonote/src/bridge/comment-subscription-bridge.test.ts src/shared/nostr/auftakt-comment-bridge.test.ts`
- [ ] Expected: PASS
- [ ] Commit: `refactor: shrink comment bridge behind resonote package`

### Task 6: app acceptance と export surface を固める

**Files:**

- Modify: `packages/auftakt-resonote/src/index.ts`
- Modify: `packages/auftakt-resonote/src/index.test.ts`
- Modify: `src/features/comments/application/comment-subscription.test.ts`
- Modify: `src/features/notifications/ui/notifications-view-model.test.ts`
- Test: `packages/auftakt-resonote/src/index.test.ts`
- Test: `src/features/comments/application/comment-subscription.test.ts`
- Test: `src/features/notifications/ui/notifications-view-model.test.ts`

- [ ] `packages/auftakt-resonote` の root export を現行 app 利用面に合わせて最小限に整理する
- [ ] comments / projection / content resolver が package 経由で動く acceptance を追加する
- [ ] Run: `pnpm exec vitest run packages/auftakt-resonote/src/index.test.ts src/features/comments/application/comment-subscription.test.ts src/features/notifications/ui/notifications-view-model.test.ts`
- [ ] Run: `pnpm exec tsc -p packages/auftakt-resonote/tsconfig.json --noEmit`
- [ ] Expected: PASS
- [ ] Commit: `feat: expose operational resonote preset surface`

### Task 7: 最終回帰

**Files:**

- Verify only

- [ ] Run: `pnpm exec vitest run packages/auftakt-resonote/src/index.test.ts packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts packages/auftakt-resonote/src/bridge/comment-subscription-bridge.test.ts src/shared/nostr/auftakt-comment-bridge.test.ts src/features/comments/application/comment-subscription.test.ts src/features/notifications/ui/notifications-view-model.test.ts`
- [ ] Run: `pnpm exec tsc -p packages/auftakt/tsconfig.json --noEmit`
- [ ] Run: `pnpm exec tsc -p packages/auftakt-resonote/tsconfig.json --noEmit`
- [ ] Expected: PASS
- [ ] Commit: `test: verify resonote preset operational rollout`
