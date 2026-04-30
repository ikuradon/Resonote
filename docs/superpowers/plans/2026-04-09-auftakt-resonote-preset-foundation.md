# Auftakt Resonote Preset Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `packages/auftakt-resonote` に Resonote 固有 preset の最小登録面を追加し、comments / content / projection を `auftakt` の registry に流し込める土台を作る。

**Architecture:** `auftakt-resonote` は app 固有意味論の preset package としてふるまい、core root logic は持たない。初手では `registerResonotePreset(runtime)` を追加し、comments relation・content resolver・Resonote projection の最小定義だけを runtime registry に登録する。

**Tech Stack:** pnpm workspace, TypeScript, Vitest, `@ikuradon/auftakt`, `packages/auftakt-resonote`, current `docs/auftakt/specs.md`

---

### Task 1: preset registration container を追加する

**Files:**

- Create: `packages/auftakt-resonote/src/preset/register-resonote-preset.ts`
- Modify: `packages/auftakt-resonote/src/index.ts`
- Modify: `packages/auftakt-resonote/src/index.test.ts`
- Test: `packages/auftakt-resonote/src/index.test.ts`

- [ ] **Step 1: failing test を先に書く**

```ts
it('creates a preset with a register function', () => {
  const preset = createResonotePreset();

  expect(preset.kind).toBe('preset');
  expect(preset.name).toBe('@ikuradon/auftakt-resonote');
  expect(typeof preset.register).toBe('function');
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt-resonote/src/index.test.ts`
Expected: FAIL because `register` is missing

- [ ] **Step 3: preset registration container を最小実装する**

```ts
export interface ResonotePresetRegistrationTarget {
  relations: { register(key: string, value: unknown): void };
  links: { register(key: string, value: unknown): void };
  projections: { register(key: string, value: unknown): void };
}

export function registerResonotePreset(target: ResonotePresetRegistrationTarget): void {
  // Task 1 では空実装でよい
}
```

`createResonotePreset()` は runtime を抱え込まず、`register(target)` を持つ薄い preset object にする。

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run packages/auftakt-resonote/src/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt-resonote/src/preset/register-resonote-preset.ts packages/auftakt-resonote/src/index.ts packages/auftakt-resonote/src/index.test.ts
git commit -m "feat: add resonote preset registration container"
```

### Task 2: comments/content/projection の最小定義を追加する

**Files:**

- Create: `packages/auftakt-resonote/src/comments/comment-relation.ts`
- Create: `packages/auftakt-resonote/src/content/content-resolver.ts`
- Create: `packages/auftakt-resonote/src/projection/resonote-projection.ts`
- Modify: `packages/auftakt-resonote/src/preset/register-resonote-preset.ts`
- Create: `packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts`

- [ ] **Step 1: failing test を書く**

```ts
import { describe, expect, it } from 'vitest';
import { createRuntimeRegistry } from '@ikuradon/auftakt';
import { registerResonotePreset } from './register-resonote-preset.ts';

describe('registerResonotePreset', () => {
  it('registers comments, content, and projection definitions', () => {
    const registry = createRuntimeRegistry();

    registerResonotePreset(registry);

    expect(registry.relations.get('resonote.comments')).toBeDefined();
    expect(registry.links.get('resonote.content')).toBeDefined();
    expect(registry.projections.get('resonote.feed')).toBeDefined();
  });
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts`
Expected: FAIL because definitions are not registered yet

- [ ] **Step 3: 最小定義を実装する**

```ts
export const createCommentRelation = () => ({
  kind: 'relation-definition',
  key: 'resonote.comments'
});

export const createContentResolver = () => ({
  kind: 'link-definition',
  key: 'resonote.content'
});

export const createResonoteProjection = () => ({
  kind: 'projection-definition',
  key: 'resonote.feed'
});
```

`registerResonotePreset(target)` は上の 3 定義をそれぞれ `relations / links / projections` に登録する。

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts packages/auftakt-resonote/src/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt-resonote/src/comments/comment-relation.ts packages/auftakt-resonote/src/content/content-resolver.ts packages/auftakt-resonote/src/projection/resonote-projection.ts packages/auftakt-resonote/src/preset/register-resonote-preset.ts packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts
git commit -m "feat: add resonote preset definitions"
```

### Task 3: root preset surface を整える

**Files:**

- Modify: `packages/auftakt-resonote/src/index.ts`
- Modify: `packages/auftakt-resonote/src/index.test.ts`

- [ ] **Step 1: failing test を追加する**

```ts
it('registers resonote definitions into an auftakt runtime registry', () => {
  const runtime = createRuntime({ dbName: 'auftakt-resonote-preset-test' });
  const preset = createResonotePreset();

  preset.register(runtime);

  expect(runtime.relations.get('resonote.comments')).toBeDefined();
  expect(runtime.links.get('resonote.content')).toBeDefined();
  expect(runtime.projections.get('resonote.feed')).toBeDefined();
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt-resonote/src/index.test.ts`
Expected: FAIL because preset surface is incomplete

- [ ] **Step 3: root export を整える**

```ts
export interface ResonotePreset {
  kind: 'preset';
  name: '@ikuradon/auftakt-resonote';
  register(target: ResonotePresetRegistrationTarget): void;
}

export const createResonotePreset = (): ResonotePreset => ({
  kind: 'preset',
  name: '@ikuradon/auftakt-resonote',
  register(target) {
    registerResonotePreset(target);
  }
});
```

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run packages/auftakt-resonote/src/index.test.ts packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt-resonote/src/index.ts packages/auftakt-resonote/src/index.test.ts
git commit -m "feat: add resonote preset root surface"
```
