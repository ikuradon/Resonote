# Auftakt Handles And Write Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `packages/auftakt` に、runtime を使う read facade と signer/write path の最小公開面を追加する。

**Architecture:** 既存の transport/store/sync foundation の上に、`User/Event/Timeline/NostrLink` を handle facade として少しずつ育てる。write path は `Session` と signer 契約に閉じ、publish の副作用は relay manager へ委譲する最小形にする。

**Tech Stack:** pnpm workspace, TypeScript, Vitest, Dexie, `packages/auftakt`, current `docs/auftakt/specs.md`

---

### Task 1: runtime を foundation modules に接続する

**Files:**

- Modify: `packages/auftakt/src/core/runtime.ts`
- Modify: `packages/auftakt/src/index.test.ts`
- Test: `packages/auftakt/src/index.test.ts`

- [ ] **Step 1: runtime 契約の failing test を先に書く**

```ts
it('creates a runtime with store and sync engine', () => {
  const runtime = createRuntime({ dbName: 'auftakt-runtime-test' });

  expect(runtime.kind).toBe('runtime');
  expect(runtime.store).toBeDefined();
  expect(runtime.sync).toBeDefined();
  expect(typeof runtime.dispose).toBe('function');
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/index.test.ts`
Expected: FAIL because `store`, `sync`, or `dispose` are missing

- [ ] **Step 3: runtime を最小 wiring する**

```ts
import {
  createDexiePersistentStore,
  type DexiePersistentStore
} from '../store/dexie/persistent-store.ts';
import { createSyncEngine, type SyncEngine, type SyncRelayManager } from '../sync/sync-engine.ts';

export interface Runtime {
  kind: 'runtime';
  createdAt: number;
  store: DexiePersistentStore;
  sync: SyncEngine;
  relayManager: SyncRelayManager;
  dispose(): Promise<void>;
}

export function createRuntime(
  input: {
    dbName?: string;
    relayManager?: SyncRelayManager;
  } = {}
): Runtime {
  const store = createDexiePersistentStore({
    dbName: input.dbName ?? `auftakt-${Date.now()}`
  });
  const relayManager = input.relayManager ?? {};
  const sync = createSyncEngine({ store, relayManager });

  return {
    kind: 'runtime',
    createdAt: Date.now(),
    store,
    sync,
    relayManager,
    async dispose() {
      await store.dispose();
    }
  };
}
```

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run packages/auftakt/src/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt/src/core/runtime.ts packages/auftakt/src/index.test.ts
git commit -m "feat: wire auftakt runtime foundation modules"
```

### Task 2: read facade に `load` と `dispose` を追加する

**Files:**

- Modify: `packages/auftakt/src/core/models/event.ts`
- Modify: `packages/auftakt/src/core/models/user.ts`
- Modify: `packages/auftakt/src/core/handles/timeline.ts`
- Modify: `packages/auftakt/src/core/models/nostr-link.ts`
- Create: `packages/auftakt/src/core/handles/read-facades.test.ts`

- [ ] **Step 1: facade 契約の failing test を書く**

```ts
import { describe, expect, it } from 'vitest';
import { createRuntime } from '../runtime.ts';
import { Event } from '../models/event.ts';
import { User } from '../models/user.ts';
import { Timeline } from './timeline.ts';
import { NostrLink } from '../models/nostr-link.ts';

describe('read facades', () => {
  it('load from runtime-backed store', async () => {
    const runtime = createRuntime({ dbName: 'auftakt-read-facades' });
    await runtime.store.putEvent({
      id: 'evt-1',
      pubkey: 'alice',
      created_at: 1,
      kind: 1,
      tags: [],
      content: 'hello',
      sig: 'sig'
    });

    const event = Event.fromId('evt-1', { runtime });
    await expect(event.load()).resolves.toMatchObject({ id: 'evt-1' });
    await runtime.dispose();
  });
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/core/handles/read-facades.test.ts`
Expected: FAIL because `load` is missing

- [ ] **Step 3: facade を最小実装する**

```ts
export interface EventState {
  kind: 'event';
  id: string;
  runtime?: Runtime;
  load(): Promise<unknown | null>;
  dispose(): void;
}

export const Event = {
  fromId(id: string, options: { runtime?: Runtime } = {}): EventState {
    return {
      kind: 'event',
      id,
      runtime: options.runtime,
      async load() {
        return options.runtime ? await options.runtime.store.getEvent(id) : null;
      },
      dispose() {}
    };
  }
};
```

`User`, `Timeline`, `NostrLink` も同じ考え方で、最小の `load()` / `dispose()` を持たせる。

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run packages/auftakt/src/core/handles/read-facades.test.ts packages/auftakt/src/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt/src/core/models/event.ts packages/auftakt/src/core/models/user.ts packages/auftakt/src/core/handles/timeline.ts packages/auftakt/src/core/models/nostr-link.ts packages/auftakt/src/core/handles/read-facades.test.ts
git commit -m "feat: add auftakt read facades"
```

### Task 3: signer 契約を公開 API として整える

**Files:**

- Modify: `packages/auftakt/src/core/signers/index.ts`
- Create: `packages/auftakt/src/core/signers/index.test.ts`
- Modify: `packages/auftakt/src/index.test.ts`

- [ ] **Step 1: signer 契約の failing test を書く**

```ts
import { describe, expect, it } from 'vitest';
import { nip07Signer, noopSigner, seckeySigner } from './index.ts';

describe('signers', () => {
  it('exposes getPublicKey and signEvent methods', async () => {
    const signer = noopSigner();
    await expect(signer.getPublicKey()).resolves.toBe('noop-pubkey');
    await expect(
      signer.signEvent({
        id: 'evt-1',
        pubkey: 'noop-pubkey',
        created_at: 1,
        kind: 1,
        tags: [],
        content: '',
        sig: ''
      })
    ).resolves.toMatchObject({ id: 'evt-1' });
    expect(nip07Signer().kind).toBe('signer');
    expect(seckeySigner().kind).toBe('signer');
  });
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/core/signers/index.test.ts`
Expected: FAIL because methods are missing

- [ ] **Step 3: signer を最小実装する**

```ts
export interface Signer {
  kind: 'signer';
  mode: 'nip07' | 'seckey' | 'noop';
  getPublicKey(): Promise<string>;
  signEvent<T extends Record<string, unknown>>(event: T): Promise<T>;
}
```

- `noopSigner()` は `noop-pubkey` を返す
- `nip07Signer()` は `nip07-pubkey` を返す stub にする
- `seckeySigner()` は `seckey-pubkey` を返す stub にする
- `signEvent()` は最小では event をそのまま返してよい

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run packages/auftakt/src/core/signers/index.test.ts packages/auftakt/src/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt/src/core/signers/index.ts packages/auftakt/src/core/signers/index.test.ts packages/auftakt/src/index.test.ts
git commit -m "feat: add auftakt signer contract"
```

### Task 4: Session に最小 publish path を追加する

**Files:**

- Modify: `packages/auftakt/src/core/models/session.ts`
- Create: `packages/auftakt/src/core/models/session.test.ts`
- Modify: `packages/auftakt/src/index.test.ts`

- [ ] **Step 1: publish path の failing test を書く**

```ts
import { describe, expect, it } from 'vitest';
import { createRuntime } from '../runtime.ts';
import { createFakeRelayManager } from '../../testing/fakes.ts';
import { noopSigner } from '../signers/index.ts';
import { Session } from './session.ts';

describe('session publish', () => {
  it('publishes a signed event through relay manager', async () => {
    const relayManager = createFakeRelayManager();
    const runtime = createRuntime({ dbName: 'auftakt-session-test', relayManager });
    const session = await Session.open({ runtime, signer: noopSigner() });

    await session.publish({
      id: 'evt-1',
      pubkey: 'noop-pubkey',
      created_at: 1,
      kind: 1,
      tags: [],
      content: 'hello',
      sig: 'sig'
    });

    expect(relayManager.publishes).toHaveLength(1);
    await runtime.dispose();
  });
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/core/models/session.test.ts`
Expected: FAIL because `Session.open({ runtime, signer })` or `publish` is missing

- [ ] **Step 3: Session を最小実装する**

```ts
export interface SessionState {
  kind: 'session';
  runtime: Runtime;
  signer: Signer;
  openedAt: number;
  publish(event: Record<string, unknown>): Promise<unknown>;
}

export const Session = {
  async open(input: { runtime?: Runtime; signer: Signer }): Promise<SessionState> {
    const runtime = input.runtime ?? createRuntime();
    return {
      kind: 'session',
      runtime,
      signer: input.signer,
      openedAt: Date.now(),
      async publish(event) {
        const signedEvent = await input.signer.signEvent(event);
        return await runtime.relayManager.publish?.(signedEvent, {
          read: [],
          write: []
        });
      }
    };
  }
};
```

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run packages/auftakt/src/core/models/session.test.ts packages/auftakt/src/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt/src/core/models/session.ts packages/auftakt/src/core/models/session.test.ts packages/auftakt/src/index.test.ts
git commit -m "feat: add auftakt session publish path"
```

## Self-Review

- runtime を foundation modules へ接続する task がある
- read facade が `load` / `dispose` を持つ
- signer 契約が `getPublicKey` / `signEvent` を持つ
- Session の最小 publish path がある
- transport/store/sync foundation を壊さずに上へ積む task 順になっている

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-09-auftakt-handles-and-write-path.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
