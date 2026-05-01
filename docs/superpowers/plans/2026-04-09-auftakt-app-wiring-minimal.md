# Auftakt App Wiring Minimal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** app bootstrap に `@ikuradon/auftakt` と `@ikuradon/auftakt-resonote` の最小 wiring を追加し、session 初期化時に runtime と preset が 1 回だけ用意される状態を作る。

**Architecture:** 既存 `init-session` はオーケストレータとして保ち、`src/shared/nostr/auftakt-runtime.ts` に bridge を切る。app は bridge 経由で `createRuntime()` と `createResonotePreset().register(runtime)` を呼び、destroy 時に bridge を破棄する。

**Tech Stack:** pnpm workspace, TypeScript, Vitest, `@ikuradon/auftakt`, `@ikuradon/auftakt-resonote`, existing app bootstrap tests

---

### Task 1: auftakt runtime bridge を追加する

**Files:**

- Create: `src/shared/nostr/auftakt-runtime.ts`
- Create: `src/shared/nostr/auftakt-runtime.test.ts`

- [ ] **Step 1: failing test を先に書く**

```ts
import { describe, expect, it } from 'vitest';
import { getAuftaktRuntime, resetAuftaktRuntime } from './auftakt-runtime.js';

describe('auftakt runtime bridge', () => {
  it('creates one shared runtime instance with resonote preset registered', async () => {
    const first = await getAuftaktRuntime();
    const second = await getAuftaktRuntime();

    expect(first).toBe(second);
    expect(first.relations.get('resonote.comments')).toBeDefined();
    expect(first.links.get('resonote.content')).toBeDefined();
    expect(first.projections.get('resonote.feed')).toBeDefined();

    await resetAuftaktRuntime();
  });
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run src/shared/nostr/auftakt-runtime.test.ts`
Expected: FAIL because module does not exist

- [ ] **Step 3: bridge を最小実装する**

```ts
import { createRuntime, type Runtime } from '@ikuradon/auftakt';
import { createResonotePreset } from '@ikuradon/auftakt-resonote';

let runtimePromise: Promise<Runtime> | null = null;

export async function getAuftaktRuntime(): Promise<Runtime> {
  runtimePromise ??= Promise.resolve().then(() => {
    const runtime = createRuntime();
    createResonotePreset().register(runtime);
    return runtime;
  });
  return runtimePromise;
}

export async function resetAuftaktRuntime(): Promise<void> {
  const runtime = await runtimePromise;
  runtimePromise = null;
  await runtime?.dispose();
}
```

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run src/shared/nostr/auftakt-runtime.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt-runtime.ts src/shared/nostr/auftakt-runtime.test.ts
git commit -m "feat: add auftakt runtime bridge"
```

### Task 2: init-session で runtime/preset を初期化する

**Files:**

- Modify: `src/app/bootstrap/init-session.ts`
- Modify: `src/app/bootstrap/init-session.test.ts`

- [ ] **Step 1: failing test を追加する**

```ts
it('auftakt runtime bridge を初期化する', async () => {
  await initSession(PUBKEY);
  expect(getAuftaktRuntimeMock).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run src/app/bootstrap/init-session.test.ts`
Expected: FAIL because bridge is not used

- [ ] **Step 3: init-session に最小 wiring を入れる**

```ts
const [{ getAuftaktRuntime }, ...existing] = await Promise.all([
  import('$shared/nostr/auftakt-runtime.js'),
  ...
]);

await getAuftaktRuntime();
```

位置は `log.info('Initializing session stores')` の直後でよい。初期化失敗は `initSession()` 全体を reject してよい。

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run src/app/bootstrap/init-session.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/bootstrap/init-session.ts src/app/bootstrap/init-session.test.ts
git commit -m "feat: initialize auftakt runtime on session start"
```

### Task 3: destroySession で bridge を破棄する

**Files:**

- Modify: `src/app/bootstrap/init-session.ts`
- Modify: `src/app/bootstrap/init-session.test.ts`

- [ ] **Step 1: failing test を追加する**

```ts
it('destroySession で auftakt runtime bridge を破棄する', async () => {
  await destroySession();
  expect(resetAuftaktRuntimeMock).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run src/app/bootstrap/init-session.test.ts`
Expected: FAIL because bridge reset is not used

- [ ] **Step 3: destroySession に reset を追加する**

```ts
const [{ resetAuftaktRuntime }, ...existing] = await Promise.all([
  import('$shared/nostr/auftakt-runtime.js'),
  ...
]);

await resetAuftaktRuntime();
```

`getEventsDB().clearAll()` の前に呼ぶ。

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run src/app/bootstrap/init-session.test.ts src/shared/nostr/auftakt-runtime.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/bootstrap/init-session.ts src/app/bootstrap/init-session.test.ts
git commit -m "feat: dispose auftakt runtime on session destroy"
```
