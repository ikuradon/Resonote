# Auftakt Legacy Runtime Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/shared/nostr/auftakt-runtime.ts` に残っている旧 `rx-nostr` / `client.ts` / `event-db.ts` 依存を整理し、bridge を暫定 adapter として薄く保ったまま最終移行へ進める。

**Architecture:** 先に `auftakt-runtime.ts` 内の request/publish helper を局所化し、その後 `client.ts` と `event-db.ts` の役割を「最小基盤」に固定する。最後に `gateway` と旧 export の削減対象を明文化し、全体回帰テストで移行可能状態を確認する。

**Tech Stack:** pnpm workspace, TypeScript, Vitest, rx-nostr, existing `src/shared/nostr/auftakt-runtime.ts`, current migration bridge tests

---

### Task 1: runtime bridge の request factory を最終整理する

**Files:**

- Modify: `src/shared/nostr/auftakt-runtime.ts`
- Test: `src/shared/nostr/auftakt-runtime.test.ts`
- Test: `src/shared/nostr/auftakt-comment-bridge.test.ts`

- [ ] **Step 1: request factory の failing test を追加する**

```ts
it('reuses runtime-local request helpers for backward and duplex streams', async () => {
  const bridge = await loadCommentSubscriptionBridge();
  expect(bridge).toBeDefined();
  expect(createRxBackwardReqMock).toHaveBeenCalledTimes(0);
});
```

`loadCommentSubscriptionBridge()` 呼び出し時点では request を作らず、`startSubscription()` / `startMergedSubscription()` / `startDeletionReconcile()` 開始時にだけ request を作ることを確認する assertion を追加する。

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run src/shared/nostr/auftakt-comment-bridge.test.ts src/shared/nostr/auftakt-runtime.test.ts`
Expected: FAIL because helper boundary isまだ明示されていない

- [ ] **Step 3: request helper を最終整理する**

```ts
function createCommentStreamFactory(
  rxNostr: Awaited<ReturnType<typeof getRxNostrInstance>>,
  rxNostrMod: RxNostrModuleLike
) {
  return {
    createDuplex() {
      const backward = rxNostrMod.createRxBackwardReq();
      const forward = rxNostrMod.createRxForwardReq();
      return {
        backward,
        forward,
        backwardStream: rxNostr.use(backward).pipe(rxNostrMod.uniq()),
        forwardStream: rxNostr.use(forward).pipe(rxNostrMod.uniq())
      };
    },
    createBackward() {
      const req = rxNostrMod.createRxBackwardReq();
      return { req, stream: rxNostr.use(req).pipe(rxNostrMod.uniq()) };
    }
  };
}
```

`loadCommentSubscriptionBridge()` 内の inline helper をこの factory に寄せ、comment bridge の責務を「factory を使うだけ」にする。

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run src/shared/nostr/auftakt-comment-bridge.test.ts src/shared/nostr/auftakt-runtime.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt-runtime.ts src/shared/nostr/auftakt-comment-bridge.test.ts src/shared/nostr/auftakt-runtime.test.ts
git commit -m "refactor: finalize runtime request factory boundaries"
```

### Task 2: publish / single-fetch helper を独立セクションへ寄せる

**Files:**

- Modify: `src/shared/nostr/auftakt-runtime.ts`
- Test: `src/shared/nostr/auftakt-runtime.test.ts`
- Test: `src/shared/nostr/client.test.ts`
- Test: `src/features/nip19-resolver/application/fetch-event.test.ts`

- [ ] **Step 1: helper 独立の failing test を追加する**

```ts
it('keeps publish and single-event fetch behavior unchanged after helper extraction', async () => {
  await expect(castSignedEvent({ kind: 1, content: 'test', tags: [] })).resolves.toBeUndefined();
  await expect(fetchNostrEventById('event-id-1', [])).resolves.toEqual(
    expect.objectContaining({ kind: 1111 })
  );
});
```

helper 抽出後も `All relays rejected`、relay hint、timeout、partial success の既存期待値が変わらないことを 1 つの describe にまとめる。

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run src/shared/nostr/auftakt-runtime.test.ts src/shared/nostr/client.test.ts src/features/nip19-resolver/application/fetch-event.test.ts`
Expected: FAIL because helper section is未分離

- [ ] **Step 3: helper を write/read utility セクションへ寄せる**

```ts
async function createPublishContext() {
  const [{ nip07Signer }, instance] = await Promise.all([getRxNostrModule(), getRxNostrInstance()]);
  return { signer: nip07Signer(), instance };
}

async function createSingleEventFetchContext(useOptions?: unknown) {
  const { req, rxNostr } = await createBackwardRequest();
  return { req, observable: rxNostr.use(req, useOptions) };
}
```

`publishWithThreshold()` と `collectSingleBackwardEvent()` が上記 context helper を使うようにし、`castSignedEvent()` と `fetchNostrEventById()` は wrapper のみに保つ。

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run src/shared/nostr/auftakt-runtime.test.ts src/shared/nostr/client.test.ts src/features/nip19-resolver/application/fetch-event.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt-runtime.ts src/shared/nostr/auftakt-runtime.test.ts src/shared/nostr/client.test.ts src/features/nip19-resolver/application/fetch-event.test.ts
git commit -m "refactor: isolate runtime read and write utility helpers"
```

### Task 3: `client.ts` の役割を `rx-nostr` 生成だけに固定する

**Files:**

- Modify: `src/shared/nostr/client.ts`
- Modify: `src/shared/nostr/client.test.ts`
- Test: `src/shared/nostr/auftakt-runtime.test.ts`

- [ ] **Step 1: 役割固定の failing test を追加する**

```ts
it('client module only exposes shared rx-nostr instance lifecycle', async () => {
  const client = await import('./client.js');
  expect(typeof client.getRxNostr).toBe('function');
  expect(typeof client.disposeRxNostr).toBe('function');
});
```

`castSigned()` や latest fetch の責務が runtime bridge 側へ寄っていることを test title / assertions で明文化する。

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run src/shared/nostr/client.test.ts`
Expected: FAIL because module responsibilities are still混在している

- [ ] **Step 3: client module の export を最小化する**

```ts
export async function getRxNostr(): Promise<RxNostr> { ... }
export async function disposeRxNostr(): Promise<void> { ... }
```

`castSigned()` / `fetchLatestEvent()` が残っている場合は deprecate comment を付けた thin wrapper にし、runtime bridge helper へ完全委譲していることをファイル先頭 comment で明記する。

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run src/shared/nostr/client.test.ts src/shared/nostr/auftakt-runtime.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/client.ts src/shared/nostr/client.test.ts src/shared/nostr/auftakt-runtime.test.ts
git commit -m "refactor: lock client module to rx-nostr lifecycle"
```

### Task 4: `event-db.ts` の役割を既存互換 facade に固定する

**Files:**

- Modify: `src/shared/nostr/event-db.ts`
- Modify: `src/shared/nostr/auftakt-runtime.ts`
- Test: `src/shared/nostr/auftakt-runtime.test.ts`
- Test: `src/shared/browser/dev-tools.svelte.test.ts`
- Test: `src/features/comments/infra/comment-repository.test.ts`

- [ ] **Step 1: DB facade の failing test を追加する**

```ts
it('routes all app-facing DB access through getNostrEventsDb helper', async () => {
  const db = await getNostrEventsDb();
  expect(db).toBeDefined();
});
```

`loadNostrDbStats()`, `clearNostrEventsCache()`, `getNostrEventsDb()` が app 側の唯一の DB 接点であることを test 名で固定する。

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run src/shared/nostr/auftakt-runtime.test.ts src/shared/browser/dev-tools.svelte.test.ts src/features/comments/infra/comment-repository.test.ts`
Expected: FAIL because DB boundary is未固定

- [ ] **Step 3: event-db facade の責務をコメントと export で固定する**

```ts
/**
 * Legacy IndexedDB compatibility layer.
 * App code must not import this file directly; use `getNostrEventsDb()` from `auftakt-runtime.ts`.
 */
export async function getEventsDB(): Promise<EventsDB> { ... }
```

`auftakt-runtime.ts` 以外に direct import が残っていないことを確認し、必要なら runtime helper へ寄せる。

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run src/shared/nostr/auftakt-runtime.test.ts src/shared/browser/dev-tools.svelte.test.ts src/features/comments/infra/comment-repository.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/event-db.ts src/shared/nostr/auftakt-runtime.ts src/shared/nostr/auftakt-runtime.test.ts src/shared/browser/dev-tools.svelte.test.ts src/features/comments/infra/comment-repository.test.ts
git commit -m "refactor: lock event db behind runtime bridge"
```

### Task 5: cleanup 対象を洗い出して全体回帰を通す

**Files:**

- Modify: `src/shared/nostr/gateway.ts`
- Modify: `docs/auftakt/specs.md`
- Test: `src/shared/nostr/auftakt-runtime.test.ts`
- Test: `src/shared/nostr/client.test.ts`
- Test: `src/shared/nostr/cached-query.test.ts`
- Test: `src/features/comments/application/comment-subscription.test.ts`
- Test: `src/features/notifications/ui/notifications-view-model.test.ts`

- [ ] **Step 1: cleanup 対象の failing assertion を追加する**

```ts
it('gateway exports only transitional wrappers that point at auftakt runtime', async () => {
  const gateway = await import('./gateway.js');
  expect(typeof gateway.castSigned).toBe('function');
  expect(typeof gateway.fetchLatestEvent).toBe('function');
});
```

`gateway` は transitional layer であり、新規ロジックを増やさないことを test / spec 両方で固定する。

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run src/shared/nostr/client.test.ts src/shared/nostr/auftakt-runtime.test.ts`
Expected: FAIL if gateway still has undocumented responsibilities

- [ ] **Step 3: gateway / spec を整理する**

```md
- `gateway.ts` is transitional only.
- New bridge logic must live in `auftakt-runtime.ts` or `packages/auftakt`.
- Direct app imports of `event-db.ts` and `rx-nostr` are forbidden.
```

不要 export や曖昧な comment を削り、`docs/auftakt/specs.md` に現状の transitional boundary を追記する。

- [ ] **Step 4: 回帰テストをまとめて実行する**

Run:

```bash
pnpm exec vitest run \
  src/shared/nostr/auftakt-runtime.test.ts \
  src/shared/nostr/client.test.ts \
  src/shared/nostr/cached-query.test.ts \
  src/shared/nostr/auftakt-comment-bridge.test.ts \
  src/features/comments/application/comment-subscription.test.ts \
  src/features/notifications/ui/notifications-view-model.test.ts \
  src/shared/browser/relays-fetch.test.ts \
  src/shared/browser/emoji-sets.test.ts \
  src/features/nip19-resolver/application/fetch-event.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/gateway.ts docs/auftakt/specs.md
git commit -m "docs: finalize auftakt legacy runtime cleanup boundary"
```
