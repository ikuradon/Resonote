# Auftakt Registry And Builtins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `packages/auftakt` に registry container と builtins の最小標準登録を追加し、read facade が registry 経由で built-in relation / link を引ける土台を作る。

**Architecture:** `registry` は辞書であり、`handles` がその定義を引いて実行する。初手では runtime に registry namespace を生やし、`registerBuiltins()` で標準登録を流し込み、最小 built-in として `nostrLink` 解決と `user.profile` relation stub だけを追加する。

**Tech Stack:** pnpm workspace, TypeScript, Vitest, Dexie, `packages/auftakt`, current `docs/auftakt/specs.md`

---

### Task 1: runtime registry container を追加する

**Files:**

- Create: `packages/auftakt/src/registry/runtime-registry.ts`
- Modify: `packages/auftakt/src/core/runtime.ts`
- Modify: `packages/auftakt/src/index.ts`
- Modify: `packages/auftakt/src/index.test.ts`
- Test: `packages/auftakt/src/index.test.ts`

- [ ] **Step 1: failing test を先に書く**

```ts
it('creates a runtime with registry namespaces', () => {
  const runtime = createRuntime({ dbName: 'auftakt-runtime-registry-test' });

  expect(typeof runtime.relations.register).toBe('function');
  expect(typeof runtime.relations.get).toBe('function');
  expect(typeof runtime.links.register).toBe('function');
  expect(typeof runtime.links.get).toBe('function');
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/index.test.ts`
Expected: FAIL because `runtime.relations` and `runtime.links` do not exist

- [ ] **Step 3: registry container を最小実装する**

```ts
export interface RegistryNamespace<T> {
  register(key: string, value: T): void;
  get(key: string): T | undefined;
  entries(): [string, T][];
}

export interface RuntimeRegistry {
  relations: RegistryNamespace<unknown>;
  projections: RegistryNamespace<unknown>;
  links: RegistryNamespace<unknown>;
}
```

```ts
const registry = createRuntimeRegistry();

return {
  kind: 'runtime',
  createdAt: Date.now(),
  registry,
  relations: registry.relations,
  projections: registry.projections,
  links: registry.links,
  ...
};
```

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run packages/auftakt/src/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt/src/registry/runtime-registry.ts packages/auftakt/src/core/runtime.ts packages/auftakt/src/index.ts packages/auftakt/src/index.test.ts
git commit -m "feat: add auftakt runtime registry container"
```

### Task 2: builtins registration mechanism を追加する

**Files:**

- Create: `packages/auftakt/src/builtins/register-builtins.ts`
- Create: `packages/auftakt/src/builtins/register-builtins.test.ts`
- Modify: `packages/auftakt/src/core/runtime.ts`
- Modify: `packages/auftakt/src/index.ts`

- [ ] **Step 1: failing test を書く**

```ts
import { describe, expect, it } from 'vitest';
import { createRuntime } from '../core/runtime.ts';

describe('registerBuiltins', () => {
  it('registers built-in relation and link definitions into runtime registry', () => {
    const runtime = createRuntime({ dbName: 'auftakt-builtins-test' });

    expect(runtime.relations.get('user.profile')).toBeDefined();
    expect(runtime.links.get('nostr')).toBeDefined();
  });
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/builtins/register-builtins.test.ts`
Expected: FAIL because built-ins are not registered yet

- [ ] **Step 3: builtins 登録関数を実装する**

```ts
export function registerBuiltins(runtime: Runtime): void {
  runtime.relations.register('user.profile', {
    kind: 'relation-definition',
    key: 'user.profile'
  });

  runtime.links.register('nostr', {
    kind: 'link-definition',
    protocol: 'nostr'
  });
}
```

`createRuntime()` の末尾で `registerBuiltins(runtime)` を一度だけ呼ぶ。

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run packages/auftakt/src/builtins/register-builtins.test.ts packages/auftakt/src/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt/src/builtins/register-builtins.ts packages/auftakt/src/builtins/register-builtins.test.ts packages/auftakt/src/core/runtime.ts packages/auftakt/src/index.ts
git commit -m "feat: add auftakt builtin registration"
```

### Task 3: NIP-19 link builtin stub を追加する

**Files:**

- Modify: `packages/auftakt/src/builtins/register-builtins.ts`
- Create: `packages/auftakt/src/builtins/nip19-link.ts`
- Create: `packages/auftakt/src/builtins/nip19-link.test.ts`
- Modify: `packages/auftakt/src/core/models/nostr-link.ts`

- [ ] **Step 1: failing test を書く**

```ts
import { describe, expect, it } from 'vitest';
import { createRuntime } from '../core/runtime.ts';
import { NostrLink } from '../core/models/nostr-link.ts';

describe('NostrLink builtin', () => {
  it('loads nostr link through runtime registry', async () => {
    const runtime = createRuntime({ dbName: 'auftakt-nip19-link-test' });
    const link = NostrLink.from('nostr:npub1example', { runtime });

    await expect(link.load()).resolves.toMatchObject({
      protocol: 'nostr',
      value: 'nostr:npub1example'
    });
  });
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/builtins/nip19-link.test.ts`
Expected: FAIL because `NostrLink.load()` does not consult registry

- [ ] **Step 3: built-in link resolver を最小実装する**

```ts
export interface NostrProtocolLinkDefinition {
  kind: 'link-definition';
  protocol: 'nostr';
  resolve(value: string): { protocol: 'nostr'; value: string };
}
```

```ts
runtime.links.register('nostr', createNostrProtocolLinkDefinition());
```

`NostrLink.load()` は `value.startsWith('nostr:')` のときだけ `runtime.links.get('nostr')` を引き、`resolve()` の結果を返す。

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run packages/auftakt/src/builtins/nip19-link.test.ts packages/auftakt/src/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt/src/builtins/register-builtins.ts packages/auftakt/src/builtins/nip19-link.ts packages/auftakt/src/builtins/nip19-link.test.ts packages/auftakt/src/core/models/nostr-link.ts
git commit -m "feat: add auftakt nip19 link builtin stub"
```

### Task 4: User facade を registry 経由に接続する

**Files:**

- Modify: `packages/auftakt/src/core/models/user.ts`
- Modify: `packages/auftakt/src/core/handles/read-facades.test.ts`
- Modify: `packages/auftakt/src/index.test.ts`

- [ ] **Step 1: failing test を書く**

```ts
it('exposes a lazy profile relation backed by runtime registry', async () => {
  const runtime = createRuntime({ dbName: 'auftakt-user-profile-test' });
  const user = User.fromPubkey('alice', { runtime });

  await expect(user.profile.load()).resolves.toMatchObject({
    relation: 'user.profile',
    pubkey: 'alice'
  });
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/core/handles/read-facades.test.ts`
Expected: FAIL because `user.profile` does not exist

- [ ] **Step 3: lazy relation facade を最小実装する**

```ts
export interface UserRelationState {
  key: string;
  load(): Promise<unknown | null>;
}
```

`User.fromPubkey()` は軽量 facade のままにし、getter `profile` だけを追加する。getter は `runtime.relations.get('user.profile')` を引いて `load()` を返すだけの lazy object にする。

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run packages/auftakt/src/core/handles/read-facades.test.ts packages/auftakt/src/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt/src/core/models/user.ts packages/auftakt/src/core/handles/read-facades.test.ts packages/auftakt/src/index.test.ts
git commit -m "feat: add auftakt registry-backed user relation"
```
