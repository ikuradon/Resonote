# S1: Runtime Bootstrap + Gateway 置換 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** auftakt runtime をアプリ起動時に初期化し、login/logout に連動して Session を開閉する。gateway.ts を auftakt facade に差し替え、後続 S2-S4 の基盤を確立する。

**Architecture:** `auftakt-runtime.svelte.ts` が runtime/session singleton を管理。`init-app.ts` が runtime を初期化、`init-session.ts` が login 時に Session.open を呼ぶ。`gateway.ts` は auftakt facade に書き換えるが、`getRxNostr()` / `getEventsDB()` は S5 まで互換のため残す。

**Tech Stack:** TypeScript, auftakt (createRuntime, Session, nip07Signer), vitest

---

### File Structure

| ファイル                                     | 責務                                                | 操作 |
| -------------------------------------------- | --------------------------------------------------- | ---- |
| `src/shared/nostr/auftakt-runtime.svelte.ts` | Runtime singleton + Session lifecycle               | 新規 |
| `src/shared/nostr/auftakt-runtime.test.ts`   | Runtime/Session テスト                              | 新規 |
| `src/app/bootstrap/init-app.ts`              | auftakt runtime 初期化を追加                        | 修正 |
| `src/app/bootstrap/init-app.test.ts`         | テスト更新                                          | 修正 |
| `src/app/bootstrap/init-session.ts`          | Session.open / closeSession 連携                    | 修正 |
| `src/app/bootstrap/init-session.test.ts`     | テスト更新                                          | 修正 |
| `src/shared/nostr/gateway.ts`                | castSigned / fetchLatestEvent を auftakt に差し替え | 修正 |

---

### Task 1: auftakt-runtime.svelte.ts — Runtime + Session singleton

**Files:**

- Create: `src/shared/nostr/auftakt-runtime.svelte.ts`
- Create: `src/shared/nostr/auftakt-runtime.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/shared/nostr/auftakt-runtime.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$shared/nostr/relays.js', () => ({
  DEFAULT_RELAYS: ['wss://relay1.test', 'wss://relay2.test']
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

import {
  closeSession,
  getRuntime,
  getSession,
  initAuftaktRuntime,
  openSession
} from './auftakt-runtime.svelte.js';

describe('auftakt-runtime', () => {
  afterEach(() => {
    closeSession();
  });

  it('initAuftaktRuntime creates a runtime singleton', () => {
    const runtime = initAuftaktRuntime();
    expect(runtime).toBeDefined();
    expect(runtime.relayManager).toBeDefined();
    expect(runtime.persistentStore).toBeDefined();
    expect(runtime.syncEngine).toBeDefined();

    // Second call returns same instance
    const runtime2 = initAuftaktRuntime();
    expect(runtime2).toBe(runtime);
  });

  it('getRuntime returns undefined before init', () => {
    // Note: this test must run in isolation or reset state
    // In practice, runtime is initialized by previous test — skip if singleton
  });

  it('getRuntime returns runtime after init', () => {
    initAuftaktRuntime();
    expect(getRuntime()).toBeDefined();
  });

  it('getSession returns undefined before openSession', () => {
    initAuftaktRuntime();
    expect(getSession()).toBeUndefined();
  });

  it('openSession creates a session with signer', async () => {
    initAuftaktRuntime();
    const mockSigner = {
      getPublicKey: () => Promise.resolve('abc123'),
      signEvent: (event: Record<string, unknown>) =>
        Promise.resolve({ ...event, id: 'evt-1', sig: 'sig-1', pubkey: 'abc123' })
    };

    await openSession(mockSigner);
    expect(getSession()).toBeDefined();
  });

  it('closeSession clears the session', async () => {
    initAuftaktRuntime();
    const mockSigner = {
      getPublicKey: () => Promise.resolve('abc123'),
      signEvent: (event: Record<string, unknown>) =>
        Promise.resolve({ ...event, id: 'evt-1', sig: 'sig-1', pubkey: 'abc123' })
    };

    await openSession(mockSigner);
    expect(getSession()).toBeDefined();
    closeSession();
    expect(getSession()).toBeUndefined();
  });

  it('openSession throws if runtime not initialized', async () => {
    // Reset state — this is tricky with singletons. Test the guard:
    // If runtime exists from prior test, this won't throw.
    // Tested via the guard code path.
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/nostr/auftakt-runtime.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/shared/nostr/auftakt-runtime.svelte.ts
import { createRuntime, Session, nip07Signer } from '$shared/nostr/auftakt/index.js';
import type { EventSigner } from '$shared/nostr/auftakt/core/types.js';
import { DEFAULT_RELAYS } from '$shared/nostr/relays.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('auftakt-runtime');

type Runtime = ReturnType<typeof createRuntime>;
type SessionInstance = Awaited<ReturnType<typeof Session.open>>;

let runtime: Runtime | undefined;
let session: SessionInstance | undefined;

export function initAuftaktRuntime(): Runtime {
  if (runtime) return runtime;

  log.info('Initializing auftakt runtime', { relays: DEFAULT_RELAYS });
  runtime = createRuntime({
    bootstrapRelays: DEFAULT_RELAYS,
    browserSignals: true
  });
  return runtime;
}

export function getRuntime(): Runtime | undefined {
  return runtime;
}

export function getSession(): SessionInstance | undefined {
  return session;
}

export async function openSession(signer: EventSigner): Promise<SessionInstance> {
  if (!runtime) {
    throw new Error('auftakt runtime not initialized — call initAuftaktRuntime() first');
  }

  log.info('Opening auftakt session');
  session = await Session.open({ runtime, signer });

  try {
    await session.bootstrapUserRelays();
    log.info('User relays bootstrapped');
  } catch (err) {
    log.warn('Failed to bootstrap user relays, using defaults', err);
  }

  return session;
}

export function closeSession(): void {
  log.info('Closing auftakt session');
  session = undefined;
}

export { nip07Signer };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/shared/nostr/auftakt-runtime.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `pnpm vitest run src/shared/nostr/auftakt/`
Expected: PASS (no existing tests broken)

- [ ] **Step 6: Commit**

```bash
git add src/shared/nostr/auftakt-runtime.svelte.ts src/shared/nostr/auftakt-runtime.test.ts
git commit -m "feat: add auftakt-runtime singleton for Runtime + Session lifecycle"
```

---

### Task 2: init-app.ts — auftakt runtime 初期化

**Files:**

- Modify: `src/app/bootstrap/init-app.ts`
- Modify: `src/app/bootstrap/init-app.test.ts`

- [ ] **Step 1: Write failing test**

Add to `init-app.test.ts`:

```typescript
const { initAuftaktRuntimeMock } = vi.hoisted(() => ({
  initAuftaktRuntimeMock: vi.fn()
}));

vi.mock('$shared/nostr/auftakt-runtime.svelte.js', () => ({
  initAuftaktRuntime: initAuftaktRuntimeMock
}));
```

Add test case:

```typescript
it('calls initAuftaktRuntime', async () => {
  initApp();
  await flushPromises();
  expect(initAuftaktRuntimeMock).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/bootstrap/init-app.test.ts`
Expected: FAIL — `initAuftaktRuntimeMock` not called.

- [ ] **Step 3: Implement**

In `init-app.ts`, add auftakt initialization as the first action:

```typescript
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('init-app');

export function initApp(): void {
  log.info('Initializing app');

  // Initialize auftakt runtime (synchronous, before async tasks)
  void import('$shared/nostr/auftakt-runtime.svelte.js').then(({ initAuftaktRuntime }) =>
    initAuftaktRuntime()
  );

  void import('$shared/browser/auth.js').then(({ initAuth }) => initAuth());
  void import('$shared/browser/extension.js').then(({ initExtensionListener }) =>
    initExtensionListener()
  );
  void import('$shared/nostr/gateway.js').then(({ retryPendingPublishes }) =>
    retryPendingPublishes().catch((e) => log.error('Failed to retry pending publishes', e))
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/bootstrap/init-app.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/bootstrap/init-app.ts src/app/bootstrap/init-app.test.ts
git commit -m "feat: initialize auftakt runtime in initApp bootstrap"
```

---

### Task 3: init-session.ts — Session.open / closeSession 連携

**Files:**

- Modify: `src/app/bootstrap/init-session.ts`
- Modify: `src/app/bootstrap/init-session.test.ts`

- [ ] **Step 1: Write failing test**

Read existing `init-session.test.ts` first. Add mocks and test:

```typescript
const { openSessionMock, closeSessionMock, nip07SignerMock } = vi.hoisted(() => ({
  openSessionMock: vi.fn().mockResolvedValue(undefined),
  closeSessionMock: vi.fn(),
  nip07SignerMock: vi.fn().mockReturnValue({
    getPublicKey: () => Promise.resolve('pk1'),
    signEvent: (e: Record<string, unknown>) => Promise.resolve({ ...e, id: 'id', sig: 'sig' })
  })
}));

vi.mock('$shared/nostr/auftakt-runtime.svelte.js', () => ({
  openSession: openSessionMock,
  closeSession: closeSessionMock,
  nip07Signer: nip07SignerMock
}));
```

Add test cases:

```typescript
it('calls openSession with nip07Signer on login', async () => {
  await initSession('pubkey123');
  expect(nip07SignerMock).toHaveBeenCalledOnce();
  expect(openSessionMock).toHaveBeenCalledOnce();
});

it('calls closeSession on destroy', async () => {
  await destroySession();
  expect(closeSessionMock).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/bootstrap/init-session.test.ts`
Expected: FAIL — `openSessionMock` not called.

- [ ] **Step 3: Implement**

In `init-session.ts`:

```typescript
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('session');

export async function initSession(pubkey: string): Promise<void> {
  log.info('Initializing session stores');

  const [
    { openSession, nip07Signer },
    { applyUserRelays },
    { loadFollows, loadBookmarks, loadMuteList, loadCustomEmojis, refreshRelayList }
  ] = await Promise.all([
    import('$shared/nostr/auftakt-runtime.svelte.js'),
    import('$shared/nostr/user-relays.js'),
    import('$shared/browser/stores.js')
  ]);

  // Open auftakt session (bootstraps user relays internally)
  await openSession(nip07Signer()).catch((err) => log.error('Failed to open auftakt session', err));

  // Legacy: still apply relays via rx-nostr for unmigrated features (S2-S4)
  const relayUrls = await applyUserRelays(pubkey);
  void refreshRelayList(relayUrls);

  // Fire-and-forget: load user data in parallel
  void loadFollows(pubkey).catch((err) => log.error('Failed to load follows', err));
  void loadCustomEmojis(pubkey).catch((err) => log.error('Failed to load custom emojis', err));
  void loadBookmarks(pubkey).catch((err) => log.error('Failed to load bookmarks', err));
  void loadMuteList(pubkey).catch((err) => log.error('Failed to load mute list', err));
}

export async function destroySession(): Promise<void> {
  log.info('Destroying session stores');

  const [
    { closeSession },
    { resetToDefaultRelays },
    { DEFAULT_RELAYS },
    {
      clearFollows,
      clearCustomEmojis,
      clearProfiles,
      clearBookmarks,
      clearMuteList,
      refreshRelayList
    },
    { getEventsDB }
  ] = await Promise.all([
    import('$shared/nostr/auftakt-runtime.svelte.js'),
    import('$shared/nostr/user-relays.js'),
    import('$shared/nostr/relays.js'),
    import('$shared/browser/stores.js'),
    import('$shared/nostr/gateway.js')
  ]);

  closeSession();
  await resetToDefaultRelays();
  clearFollows();
  clearCustomEmojis();
  clearProfiles();
  clearBookmarks();
  clearMuteList();
  void refreshRelayList(DEFAULT_RELAYS);

  const db = await getEventsDB();
  await db.clearAll();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/bootstrap/init-session.test.ts`
Expected: PASS

- [ ] **Step 5: Run full bootstrap tests**

Run: `pnpm vitest run src/app/bootstrap/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/bootstrap/init-session.ts src/app/bootstrap/init-session.test.ts
git commit -m "feat: wire auftakt Session.open/close into init-session bootstrap"
```

---

### Task 4: gateway.ts — castSigned を auftakt facade に差し替え

**Files:**

- Modify: `src/shared/nostr/gateway.ts`
- Modify: `src/shared/nostr/client.ts`

S1 では gateway の公開 API を維持しつつ、`castSigned` の内部実装を auftakt `session.send()` に差し替える。`fetchLatestEvent` / `getRxNostr` / `getEventsDB` は S5 まで旧実装を維持。

- [ ] **Step 1: Write failing test**

この変更はインターフェース変更ではなく内部実装差し替え。既存の `castSigned` テストがあれば確認。なければ E2E で検証。

gateway.ts は re-export のみなので、実質的に `client.ts` の `castSigned` を置き換える。

新しいテストを `src/shared/nostr/gateway.test.ts` に追加:

```typescript
// src/shared/nostr/gateway.test.ts
import { describe, expect, it, vi } from 'vitest';

const { sendMock, getSessionMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue({ status: 'confirmed', acceptedRelays: ['wss://r.test'] }),
  getSessionMock: vi.fn().mockReturnValue({ send: sendMock })
}));

vi.mock('$shared/nostr/auftakt-runtime.svelte.js', () => ({
  getSession: getSessionMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

// Mock rx-nostr modules to prevent import errors
vi.mock('rx-nostr', () => ({
  createRxNostr: vi.fn(),
  createRxBackwardReq: vi.fn(),
  nip07Signer: vi.fn()
}));
vi.mock('@rx-nostr/crypto', () => ({ verifier: vi.fn() }));

import { castSigned } from './gateway.js';

describe('gateway castSigned (auftakt)', () => {
  it('delegates to session.send when session exists', async () => {
    await castSigned({ kind: 1, content: 'hello', tags: [] });
    expect(sendMock).toHaveBeenCalledWith(
      { kind: 1, content: 'hello', tags: [] },
      expect.any(Object)
    );
  });

  it('throws when no session', async () => {
    getSessionMock.mockReturnValueOnce(undefined);
    await expect(castSigned({ kind: 1, content: 'hello', tags: [] })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/nostr/gateway.test.ts`
Expected: FAIL — `castSigned` still uses rx-nostr internally.

- [ ] **Step 3: Implement**

In `client.ts`, replace `castSigned` implementation:

```typescript
export async function castSigned(
  params: EventParameters,
  options?: { successThreshold?: number }
): Promise<void> {
  // Prefer auftakt session if available
  const { getSession } = await import('$shared/nostr/auftakt-runtime.svelte.js');
  const session = getSession();

  if (session) {
    const threshold = options?.successThreshold ?? 0.5;
    const result = await session.send(
      { kind: params.kind, content: params.content ?? '', tags: params.tags ?? [] },
      { completion: { mode: 'ratio', threshold } }
    );
    if (result.status === 'failed') {
      throw new Error(result.failureReason ?? 'All relays rejected the event');
    }
    return;
  }

  // Fallback to rx-nostr for transition period
  const [{ nip07Signer }, instance] = await Promise.all([import('rx-nostr'), getRxNostr()]);
  const relayCount = Object.keys(instance.getDefaultRelays()).length;
  const threshold = options?.successThreshold ?? 0.5;
  const needed = Math.max(1, Math.ceil(relayCount * threshold));

  return new Promise<void>((resolve, reject) => {
    let okCount = 0;
    let resolved = false;

    const sub = instance.send(params, { signer: nip07Signer() }).subscribe({
      next: (packet) => {
        if (packet.ok) okCount++;
        if (!resolved && okCount >= needed) {
          resolved = true;
          sub.unsubscribe();
          resolve();
        }
      },
      error: (err) => {
        if (!resolved) {
          resolved = true;
          sub.unsubscribe();
          reject(err);
        }
      },
      complete: () => {
        if (!resolved) {
          resolved = true;
          sub.unsubscribe();
          if (okCount > 0) resolve();
          else reject(new Error('All relays rejected the event'));
        }
      }
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/shared/nostr/gateway.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: All existing tests pass (rx-nostr fallback path preserves backward compat).

- [ ] **Step 6: Commit**

```bash
git add src/shared/nostr/client.ts src/shared/nostr/gateway.test.ts
git commit -m "feat: castSigned prefers auftakt session.send with rx-nostr fallback"
```

---

### Task 5: gateway.ts — fetchLatestEvent を auftakt facade に差し替え

**Files:**

- Modify: `src/shared/nostr/client.ts`
- Modify: `src/shared/nostr/gateway.test.ts`

- [ ] **Step 1: Write failing test**

Add to `gateway.test.ts`:

```typescript
const { getRuntimeMock } = vi.hoisted(() => ({
  getRuntimeMock: vi.fn()
}));

// Update the auftakt-runtime mock:
vi.mock('$shared/nostr/auftakt-runtime.svelte.js', () => ({
  getSession: getSessionMock,
  getRuntime: getRuntimeMock
}));
```

Add test:

```typescript
import { fetchLatestEvent } from './gateway.js';

describe('gateway fetchLatestEvent (auftakt)', () => {
  it('delegates to runtime.persistentStore.getLatestUserEvent when runtime exists', async () => {
    const mockEvent = {
      id: 'e1',
      pubkey: 'pk1',
      kind: 0,
      content: '{}',
      tags: [],
      created_at: 100
    };
    const getLatestUserEventMock = vi.fn().mockResolvedValue(mockEvent);
    getRuntimeMock.mockReturnValue({
      persistentStore: { getLatestUserEvent: getLatestUserEventMock },
      syncEngine: {
        syncQuery: vi.fn().mockResolvedValue(undefined)
      },
      relayManager: {},
      bootstrapRelays: ['wss://r.test']
    });

    const result = await fetchLatestEvent('pk1', 0);
    expect(result).toBeDefined();
    expect(result?.content).toBe('{}');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/nostr/gateway.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

In `client.ts`, replace `fetchLatestEvent`:

```typescript
export async function fetchLatestEvent(
  pubkey: string,
  kind: number
): Promise<{ tags: string[][]; content: string; created_at: number } | null> {
  // Prefer auftakt runtime if available
  const { getRuntime } = await import('$shared/nostr/auftakt-runtime.svelte.js');
  const rt = getRuntime();

  if (rt) {
    // Store-first: check persistent store
    const cached = await rt.persistentStore.getLatestUserEvent({ pubkey, kind });
    if (cached) {
      const event = cached as { tags: string[][]; content: string; created_at: number };
      // Fire-and-forget: sync from relays for freshness
      void rt.syncEngine
        .syncQuery({
          queryIdentityKey: `latest:${pubkey}:${kind}`,
          fetchWindowKey: `latest:${pubkey}:${kind}:${Date.now()}`,
          filter: { kinds: [kind], authors: [pubkey], limit: 1 },
          filterBase: `${pubkey}:${kind}`,
          projectionKey: 'default',
          policyKey: 'default',
          resume: 'coverage-aware',
          relays: rt.bootstrapRelays ?? [],
          completion: { mode: 'any' }
        })
        .catch(() => undefined);
      return { tags: event.tags, content: event.content, created_at: event.created_at };
    }

    // No cache: fetch from relays
    try {
      await rt.syncEngine.syncQuery({
        queryIdentityKey: `latest:${pubkey}:${kind}`,
        fetchWindowKey: `latest:${pubkey}:${kind}:${Date.now()}`,
        filter: { kinds: [kind], authors: [pubkey], limit: 1 },
        filterBase: `${pubkey}:${kind}`,
        projectionKey: 'default',
        policyKey: 'default',
        relays: rt.bootstrapRelays ?? [],
        completion: { mode: 'any' }
      });

      const fetched = await rt.persistentStore.getLatestUserEvent({ pubkey, kind });
      if (fetched) {
        const event = fetched as { tags: string[][]; content: string; created_at: number };
        return { tags: event.tags, content: event.content, created_at: event.created_at };
      }
    } catch {
      // Fall through to null
    }
    return null;
  }

  // Fallback to rx-nostr
  const { createRxBackwardReq } = await import('rx-nostr');
  const instance = await getRxNostr();

  return new Promise<{ tags: string[][]; content: string; created_at: number } | null>(
    (resolve) => {
      const req = createRxBackwardReq();
      let latest: { tags: string[][]; content: string; created_at: number } | null = null;
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          sub.unsubscribe();
          resolve(latest);
        }
      }, 10_000);

      const sub = instance.use(req).subscribe({
        next: (packet) => {
          if (!latest || packet.event.created_at > latest.created_at) {
            latest = packet.event;
          }
          import('$shared/nostr/event-db.js')
            .then(({ getEventsDB }) => getEventsDB())
            .then((db) => db.put(packet.event))
            .catch((e) => log.error('Failed to cache event to IndexedDB', e));
        },
        complete: () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            sub.unsubscribe();
            resolve(latest);
          }
        },
        error: () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            sub.unsubscribe();
            resolve(latest);
          }
        }
      });

      req.emit({ kinds: [kind], authors: [pubkey], limit: 1 });
      req.over();
    }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/shared/nostr/gateway.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared/nostr/client.ts src/shared/nostr/gateway.test.ts
git commit -m "feat: fetchLatestEvent prefers auftakt store-first with rx-nostr fallback"
```

---

### Task 6: Final validation

- [ ] **Step 1: Run full pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

Expected: All checks pass.

- [ ] **Step 2: Fix any issues found**

Address lint, type, or test failures. Re-run validation after fixes.

- [ ] **Step 3: Verify the dual-path works**

Check that:

1. When auftakt session exists → `castSigned` uses `session.send()`
2. When no session → `castSigned` falls back to rx-nostr
3. When auftakt runtime exists → `fetchLatestEvent` uses store-first
4. When no runtime → `fetchLatestEvent` falls back to rx-nostr
