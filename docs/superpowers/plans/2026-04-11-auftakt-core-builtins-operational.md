# Auftakt Core Built-ins Operationalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `packages/auftakt` の `handles` と core built-ins を、定義だけの foundation から実データを返す operational 実装へ引き上げる。

**Architecture:** `handles` を唯一の実行 facade として固定し、`registry` から built-in definition を引いて `store + sync` を通す。built-in は `resolve(pubkey)` のみではなく、query/decode/latest-selection/fallback を持つ operational definition に上げ、`User/Event/Timeline/Session` は共通 state contract で統一する。

**Tech Stack:** TypeScript, Vitest, Dexie, fake-indexeddb, pnpm

---

## File Structure

- Create: `packages/auftakt/src/builtins/types.ts`
  - built-in relation definition の共通型。query/decode/fallback の contract を置く。
- Create: `packages/auftakt/src/handles/relation-handle.ts`
  - `SingleHandleState` ベースの relation handle 実行器。`load()`, `refresh()`, `dispose()` を提供。
- Modify: `packages/auftakt/src/handles/user.ts`
  - `profile / relays / follows / muteList / bookmarks / customEmojis` を共通 relation handle へ移す。
- Modify: `packages/auftakt/src/handles/event.ts`
  - cache miss 時に `sync` を使う event handle へ引き上げる。
- Modify: `packages/auftakt/src/handles/session.ts`
  - publish result, optimistic, pending publish retry の最小 operational path を入れる。
- Modify: `packages/auftakt/src/builtins/profiles.ts`
- Modify: `packages/auftakt/src/builtins/relays.ts`
- Modify: `packages/auftakt/src/builtins/follows.ts`
- Modify: `packages/auftakt/src/builtins/mute.ts`
- Modify: `packages/auftakt/src/builtins/bookmarks.ts`
- Modify: `packages/auftakt/src/builtins/emoji-sets.ts`
  - 各 built-in を query/decode/latest-selection/fallback を持つ operational definition に変更。
- Modify: `packages/auftakt/src/builtins/register-builtins.ts`
  - 新 contract の登録へ合わせる。
- Modify: `packages/auftakt/src/store/dexie/persistent-store.ts`
  - built-in 実行に必要な query helper, pending publish helper を追加。
- Modify: `packages/auftakt/src/sync/sync-engine.ts`
  - `fetchOne`, `fetchLatest`, coverage-aware refresh を扱える最小 helper を追加。
- Modify: `packages/auftakt/src/index.ts`
  - 新しい root export を整える。

- Test: `packages/auftakt/src/handles/relation-handle.test.ts`
- Test: `packages/auftakt/src/handles/user.test.ts`
- Test: `packages/auftakt/src/handles/event.test.ts`
- Test: `packages/auftakt/src/handles/session.test.ts`
- Test: `packages/auftakt/src/builtins/register-builtins.test.ts`
- Test: `packages/auftakt/src/builtins/profiles.test.ts`
- Test: `packages/auftakt/src/builtins/relays.test.ts`
- Test: `packages/auftakt/src/builtins/follows.test.ts`
- Test: `packages/auftakt/src/builtins/mute.test.ts`
- Test: `packages/auftakt/src/builtins/bookmarks.test.ts`
- Test: `packages/auftakt/src/builtins/emoji-sets.test.ts`
- Test: `packages/auftakt/src/store/dexie/persistent-store.test.ts`
- Test: `packages/auftakt/src/sync/sync-engine.test.ts`
- Test: `packages/auftakt/src/index.test.ts`

### Task 1: Relation Handle Contract を作る

**Files:**

- Create: `packages/auftakt/src/builtins/types.ts`
- Create: `packages/auftakt/src/handles/relation-handle.ts`
- Test: `packages/auftakt/src/handles/relation-handle.test.ts`

- [ ] **Step 1: failing test を書く**

```ts
import { describe, expect, it, vi } from 'vitest';

import { createRelationHandle } from './relation-handle.ts';

describe('createRelationHandle', () => {
  it('load() で cache-first, refresh() で relay-first を使い分ける', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ value: { name: 'cached' }, source: 'cache', updatedAt: 1 })
      .mockResolvedValueOnce({ value: { name: 'relay' }, source: 'relay', updatedAt: 2 });

    const handle = createRelationHandle({
      execute: query
    });

    await expect(handle.load()).resolves.toEqual({ name: 'cached' });
    expect(handle.state.current).toEqual({ name: 'cached' });
    expect(handle.state.source).toBe('cache');

    await expect(handle.refresh()).resolves.toEqual({ name: 'relay' });
    expect(handle.state.current).toEqual({ name: 'relay' });
    expect(handle.state.source).toBe('relay');
    expect(handle.state.updatedAt).toBe(2);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/handles/relation-handle.test.ts`
Expected: FAIL with `Cannot find module './relation-handle.ts'`

- [ ] **Step 3: 最小実装を書く**

```ts
export interface RelationExecutionResult<T> {
  value: T | null;
  source: 'none' | 'cache' | 'relay' | 'merged' | 'optimistic';
  stale?: boolean;
  updatedAt?: number;
}

export interface RelationHandleState<T> {
  current: T | null;
  loading: boolean;
  error: unknown | null;
  stale: boolean;
  source: 'none' | 'cache' | 'relay' | 'merged' | 'optimistic';
  updatedAt: number | null;
}

export function createRelationHandle<T>(input: {
  execute(mode: 'load' | 'refresh'): Promise<RelationExecutionResult<T>>;
}) {
  const state: RelationHandleState<T> = {
    current: null,
    loading: false,
    error: null,
    stale: false,
    source: 'none',
    updatedAt: null
  };

  const run = async (mode: 'load' | 'refresh') => {
    state.loading = true;
    state.error = null;
    try {
      const result = await input.execute(mode);
      state.current = result.value;
      state.source = result.source;
      state.stale = result.stale ?? false;
      state.updatedAt = result.updatedAt ?? null;
      return state.current;
    } catch (error) {
      state.error = error;
      throw error;
    } finally {
      state.loading = false;
    }
  };

  return {
    state,
    load: () => run('load'),
    refresh: () => run('refresh'),
    dispose() {}
  };
}
```

- [ ] **Step 4: テストを再実行して通ることを確認する**

Run: `pnpm exec vitest run packages/auftakt/src/handles/relation-handle.test.ts`
Expected: PASS

- [ ] **Step 5: コミットする**

```bash
git add packages/auftakt/src/builtins/types.ts packages/auftakt/src/handles/relation-handle.ts packages/auftakt/src/handles/relation-handle.test.ts
git commit -m "feat: add auftakt relation handle contract"
```

### Task 2: User Handle を共通 relation handle に載せる

**Files:**

- Modify: `packages/auftakt/src/handles/user.ts`
- Modify: `packages/auftakt/src/builtins/register-builtins.ts`
- Test: `packages/auftakt/src/handles/user.test.ts`
- Test: `packages/auftakt/src/builtins/register-builtins.test.ts`

- [ ] **Step 1: failing test を書く**

```ts
import { describe, expect, it, vi } from 'vitest';

import { User } from './user.ts';

describe('User relation handles', () => {
  it('profile/relays/follows を共通 handle contract で expose する', async () => {
    const runtime = {
      relations: {
        get: vi.fn((key: string) => ({
          execute: vi.fn(async () => ({
            value: { key, pubkey: 'alice' },
            source: 'relay',
            updatedAt: 10
          }))
        }))
      }
    };

    const user = User.fromPubkey('alice', { runtime });

    await expect(user.profile.load()).resolves.toEqual({ key: 'user.profile', pubkey: 'alice' });
    await expect(user.relays.load()).resolves.toEqual({ key: 'user.relays', pubkey: 'alice' });
    expect(user.profile.state.source).toBe('relay');
    expect(user.relays.state.updatedAt).toBe(10);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/handles/user.test.ts`
Expected: FAIL because `user.relays` などが未実装

- [ ] **Step 3: 最小実装を書く**

```ts
const createUserRelation = (runtime: UserRuntime | undefined, key: string, pubkey: string) =>
  createRelationHandle({
    async execute(mode) {
      const definition = runtime?.relations.get(key);
      if (
        !definition ||
        typeof definition !== 'object' ||
        typeof definition.execute !== 'function'
      ) {
        return { value: null, source: 'none' as const };
      }

      return await definition.execute({
        pubkey,
        mode
      });
    }
  });

export const User = {
  fromPubkey(pubkey: string, options: { runtime?: UserRuntime } = {}) {
    const runtime = options.runtime;

    return {
      kind: 'user' as const,
      pubkey,
      runtime,
      profile: createUserRelation(runtime, 'user.profile', pubkey),
      relays: createUserRelation(runtime, 'user.relays', pubkey),
      follows: createUserRelation(runtime, 'user.follows', pubkey),
      muteList: createUserRelation(runtime, 'user.muteList', pubkey),
      bookmarks: createUserRelation(runtime, 'user.bookmarks', pubkey),
      customEmojis: createUserRelation(runtime, 'user.customEmojis', pubkey),
      async load() {
        return null;
      },
      dispose() {}
    };
  }
};
```

- [ ] **Step 4: テストを再実行して通ることを確認する**

Run: `pnpm exec vitest run packages/auftakt/src/handles/user.test.ts packages/auftakt/src/builtins/register-builtins.test.ts`
Expected: PASS

- [ ] **Step 5: コミットする**

```bash
git add packages/auftakt/src/handles/user.ts packages/auftakt/src/handles/user.test.ts packages/auftakt/src/builtins/register-builtins.test.ts
git commit -m "feat: move auftakt user relations onto operational handles"
```

### Task 3: Profile / Relay / Follow / Mute / Bookmark / Emoji built-ins を Operational 化する

**Files:**

- Modify: `packages/auftakt/src/builtins/profiles.ts`
- Modify: `packages/auftakt/src/builtins/relays.ts`
- Modify: `packages/auftakt/src/builtins/follows.ts`
- Modify: `packages/auftakt/src/builtins/mute.ts`
- Modify: `packages/auftakt/src/builtins/bookmarks.ts`
- Modify: `packages/auftakt/src/builtins/emoji-sets.ts`
- Test: `packages/auftakt/src/builtins/profiles.test.ts`
- Test: `packages/auftakt/src/builtins/relays.test.ts`
- Test: `packages/auftakt/src/builtins/follows.test.ts`
- Test: `packages/auftakt/src/builtins/mute.test.ts`
- Test: `packages/auftakt/src/builtins/bookmarks.test.ts`
- Test: `packages/auftakt/src/builtins/emoji-sets.test.ts`

- [ ] **Step 1: failing test を書く**

```ts
import { describe, expect, it } from 'vitest';

import { createProfileRelationDefinition } from './profiles.ts';

describe('createProfileRelationDefinition', () => {
  it('latest kind:0 を decode して profile shape を返す', async () => {
    const definition = createProfileRelationDefinition();
    const result = await definition.execute({
      pubkey: 'alice',
      mode: 'load',
      store: {
        getLatestUserEvent: async () => ({
          id: 'evt-profile',
          pubkey: 'alice',
          created_at: 10,
          kind: 0,
          tags: [],
          content: JSON.stringify({ name: 'Alice', picture: 'https://img.test/a.png' }),
          sig: 'sig'
        })
      },
      sync: {}
    });

    expect(result.value).toMatchObject({
      pubkey: 'alice',
      name: 'Alice',
      picture: 'https://img.test/a.png',
      eventId: 'evt-profile',
      createdAt: 10
    });
    expect(result.source).toBe('cache');
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/builtins/profiles.test.ts`
Expected: FAIL because `execute()` が未実装

- [ ] **Step 3: 最小実装を書く**

```ts
export interface OperationalRelationDefinition<TInput, TValue> {
  kind: 'relation-definition';
  key: string;
  execute(input: TInput): Promise<{
    value: TValue | null;
    source: 'none' | 'cache' | 'relay' | 'merged' | 'optimistic';
    updatedAt?: number;
    stale?: boolean;
  }>;
}

const decodeProfile = (event: {
  id: string;
  pubkey: string;
  created_at: number;
  content: string;
}) => {
  const content = JSON.parse(event.content) as Record<string, unknown>;

  return {
    pubkey: event.pubkey,
    name: typeof content.name === 'string' ? content.name : null,
    displayName: typeof content.display_name === 'string' ? content.display_name : null,
    picture: typeof content.picture === 'string' ? content.picture : null,
    about: typeof content.about === 'string' ? content.about : null,
    eventId: event.id,
    createdAt: event.created_at,
    raw: content
  };
};

export function createProfileRelationDefinition(): OperationalRelationDefinition<any, any> {
  return {
    kind: 'relation-definition',
    key: 'user.profile',
    async execute(input) {
      const cached = await input.store?.getLatestUserEvent?.({ pubkey: input.pubkey, kind: 0 });
      if (cached) {
        return {
          value: decodeProfile(cached),
          source: 'cache',
          updatedAt: cached.created_at
        };
      }

      const fetched = await input.sync?.fetchLatest?.({
        authors: [input.pubkey],
        kinds: [0]
      });

      return fetched
        ? { value: decodeProfile(fetched), source: 'relay', updatedAt: fetched.created_at }
        : { value: null, source: 'none' };
    }
  };
}
```

- [ ] **Step 4: built-ins 一式に同じ方針を適用する**

各 built-in で最低限これを実装する。

- `relays`
  - `kind:10002` を優先し、なければ `kind:3` fallback
- `follows`
  - latest `kind:3` の `p` tag を decode
- `mute`
  - latest mute event の `p` tag を decode
- `bookmarks`
  - `e`, `a`, `r` tag を正規化
- `emoji-sets`
  - inline emoji と set 参照の最小 merge

- [ ] **Step 5: テストを再実行して通ることを確認する**

Run: `pnpm exec vitest run packages/auftakt/src/builtins/profiles.test.ts packages/auftakt/src/builtins/relays.test.ts packages/auftakt/src/builtins/follows.test.ts packages/auftakt/src/builtins/mute.test.ts packages/auftakt/src/builtins/bookmarks.test.ts packages/auftakt/src/builtins/emoji-sets.test.ts packages/auftakt/src/builtins/register-builtins.test.ts`
Expected: PASS

- [ ] **Step 6: コミットする**

```bash
git add packages/auftakt/src/builtins/*.ts packages/auftakt/src/builtins/*.test.ts
git commit -m "feat: operationalize auftakt core builtins"
```

### Task 4: Event Handle を store + sync 実行に上げる

**Files:**

- Modify: `packages/auftakt/src/handles/event.ts`
- Modify: `packages/auftakt/src/sync/sync-engine.ts`
- Test: `packages/auftakt/src/handles/event.test.ts`
- Test: `packages/auftakt/src/sync/sync-engine.test.ts`

- [ ] **Step 1: failing test を書く**

```ts
import { describe, expect, it, vi } from 'vitest';

import { Event } from './event.ts';

describe('Event handle', () => {
  it('cache miss 時に sync fetch を使って event を取得する', async () => {
    const runtime = {
      store: {
        getEvent: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
          id: 'evt-1',
          content: 'hello'
        })
      },
      sync: {
        fetchOne: vi.fn().mockResolvedValue({
          id: 'evt-1',
          pubkey: 'alice',
          created_at: 1,
          kind: 1,
          tags: [],
          content: 'hello',
          sig: 'sig'
        })
      }
    };

    const event = Event.fromId('evt-1', { runtime });

    await expect(event.load()).resolves.toMatchObject({ id: 'evt-1', content: 'hello' });
    expect(runtime.sync.fetchOne).toHaveBeenCalledWith({ ids: ['evt-1'] });
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/handles/event.test.ts`
Expected: FAIL because `sync.fetchOne` path is missing

- [ ] **Step 3: 最小実装を書く**

```ts
export const Event = {
  fromId(id: string, options: { runtime?: EventRuntime } = {}) {
    const state = {
      current: null,
      loading: false,
      error: null,
      stale: false,
      source: 'none' as const
    };

    return {
      kind: 'event' as const,
      id,
      state,
      async load() {
        state.loading = true;
        try {
          const cached = await options.runtime?.store.getEvent(id);
          if (cached) {
            state.current = cached;
            state.source = 'cache';
            return cached;
          }

          const fetched = await options.runtime?.sync?.fetchOne?.({ ids: [id] });
          state.current = fetched ?? null;
          state.source = fetched ? 'relay' : 'none';
          return state.current;
        } finally {
          state.loading = false;
        }
      },
      async refresh() {
        const fetched = await options.runtime?.sync?.fetchOne?.({ ids: [id] });
        state.current = fetched ?? null;
        state.source = fetched ? 'relay' : 'none';
        return state.current;
      },
      dispose() {}
    };
  }
};
```

- [ ] **Step 4: テストを再実行して通ることを確認する**

Run: `pnpm exec vitest run packages/auftakt/src/handles/event.test.ts packages/auftakt/src/sync/sync-engine.test.ts`
Expected: PASS

- [ ] **Step 5: コミットする**

```bash
git add packages/auftakt/src/handles/event.ts packages/auftakt/src/handles/event.test.ts packages/auftakt/src/sync/sync-engine.ts packages/auftakt/src/sync/sync-engine.test.ts
git commit -m "feat: make auftakt event handle operational"
```

### Task 5: Session Publish を Operational 化する

**Files:**

- Modify: `packages/auftakt/src/handles/session.ts`
- Modify: `packages/auftakt/src/store/dexie/persistent-store.ts`
- Test: `packages/auftakt/src/handles/session.test.ts`
- Test: `packages/auftakt/src/store/dexie/persistent-store.test.ts`

- [ ] **Step 1: failing test を書く**

```ts
import { describe, expect, it, vi } from 'vitest';

import { Session } from './session.ts';

describe('Session.publish', () => {
  it('optimistic 保存後に publish result を返す', async () => {
    const runtime = {
      relayManager: {
        publish: vi.fn().mockResolvedValue([true, false])
      },
      store: {
        putOptimisticEvent: vi.fn().mockResolvedValue(undefined),
        putPendingPublish: vi.fn().mockResolvedValue(undefined)
      }
    };
    const signer = {
      signEvent: vi.fn().mockResolvedValue({
        id: 'evt-1',
        pubkey: 'alice',
        created_at: 1,
        kind: 1,
        tags: [],
        content: 'hello',
        sig: 'sig',
        clientMutationId: 'cmid-1'
      })
    };

    const session = await Session.open({ runtime: runtime as never, signer: signer as never });
    const result = await session.publish({ kind: 1, content: 'hello' });

    expect(runtime.store.putOptimisticEvent).toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      acceptedRelays: 1,
      rejectedRelays: 1
    });
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/handles/session.test.ts`
Expected: FAIL because publish result / optimistic path is missing

- [ ] **Step 3: 最小実装を書く**

```ts
async publish(event: Record<string, unknown>) {
  const signedEvent = await signer.signEvent(event);
  ensureEventFields(signedEvent);

  await runtime.store.putOptimisticEvent?.(signedEvent);
  await runtime.store.putPendingPublish?.({
    eventId: signedEvent.id,
    signedEvent,
    createdAt: Date.now(),
    attempts: 0
  });

  const result = (await runtime.relayManager.publish?.(signedEvent, {
    read: [],
    write: []
  })) ?? [];

  const acceptedRelays = result.filter(Boolean).length;
  const rejectedRelays = result.length - acceptedRelays;

  return {
    event: signedEvent,
    acceptedRelays,
    rejectedRelays,
    ok: acceptedRelays > 0
  };
}
```

- [ ] **Step 4: テストを再実行して通ることを確認する**

Run: `pnpm exec vitest run packages/auftakt/src/handles/session.test.ts packages/auftakt/src/store/dexie/persistent-store.test.ts`
Expected: PASS

- [ ] **Step 5: コミットする**

```bash
git add packages/auftakt/src/handles/session.ts packages/auftakt/src/handles/session.test.ts packages/auftakt/src/store/dexie/persistent-store.ts packages/auftakt/src/store/dexie/persistent-store.test.ts
git commit -m "feat: operationalize auftakt session publish"
```

### Task 6: Root Export と受け入れ確認を揃える

**Files:**

- Modify: `packages/auftakt/src/index.ts`
- Modify: `packages/auftakt/src/index.test.ts`

- [ ] **Step 1: failing acceptance test を書く**

```ts
import { describe, expect, it, vi } from 'vitest';

import { Event, Session, User } from './index.ts';

describe('@ikuradon/auftakt operational handles', () => {
  it('root export だけで user/event/session の operational path を使える', async () => {
    const runtime = {
      relations: {
        get: vi.fn(() => ({
          execute: vi.fn(async () => ({
            value: { pubkey: 'alice', name: 'Alice' },
            source: 'relay',
            updatedAt: 10
          }))
        }))
      },
      store: {
        getEvent: vi.fn().mockResolvedValue({
          id: 'evt-1',
          content: 'hello'
        }),
        putOptimisticEvent: vi.fn().mockResolvedValue(undefined),
        putPendingPublish: vi.fn().mockResolvedValue(undefined)
      },
      sync: {
        fetchOne: vi.fn()
      },
      relayManager: {
        publish: vi.fn().mockResolvedValue([true])
      }
    };
    const signer = {
      signEvent: vi.fn().mockResolvedValue({
        id: 'evt-2',
        pubkey: 'alice',
        created_at: 1,
        kind: 1,
        tags: [],
        content: 'hi',
        sig: 'sig'
      })
    };

    const user = User.fromPubkey('alice', { runtime: runtime as never });
    const event = Event.fromId('evt-1', { runtime: runtime as never });
    const session = await Session.open({ runtime: runtime as never, signer: signer as never });

    await expect(user.profile.load()).resolves.toMatchObject({ name: 'Alice' });
    await expect(event.load()).resolves.toMatchObject({ id: 'evt-1' });
    await expect(session.publish({ kind: 1, content: 'hi' })).resolves.toMatchObject({ ok: true });
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/index.test.ts`
Expected: FAIL until all operational exports are aligned

- [ ] **Step 3: export と型を揃える**

```ts
export { Event } from './handles/event.ts';
export { Session } from './handles/session.ts';
export { User } from './handles/user.ts';
export { createRelationHandle } from './handles/relation-handle.ts';
export type { RelationHandleState } from './handles/relation-handle.ts';
```

- [ ] **Step 4: 受け入れテストと型チェックを実行する**

Run: `pnpm exec vitest run packages/auftakt/src/index.test.ts packages/auftakt/src/handles/*.test.ts packages/auftakt/src/builtins/*.test.ts`
Expected: PASS

Run: `pnpm exec tsc -p packages/auftakt/tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 5: コミットする**

```bash
git add packages/auftakt/src/index.ts packages/auftakt/src/index.test.ts
git commit -m "feat: expose operational auftakt core handles"
```

## Self-Review

- Spec coverage:
  - handle 共通 API / state: Task 1, 2, 4
  - built-ins operationalization: Task 3
  - publish / optimistic / pending publish: Task 5
  - root export / acceptance: Task 6
- Placeholder scan:
  - `TODO`, `TBD`, 「後で実装」表現は含めていない
- Type consistency:
  - `createRelationHandle`, `execute(mode)`, `fetchOne`, `putPendingPublish` の名前を plan 全体で統一した
