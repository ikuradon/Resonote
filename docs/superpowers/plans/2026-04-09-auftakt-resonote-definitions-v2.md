# Auftakt Resonote Definitions V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `packages/auftakt-resonote` の comments/content/projection 定義に最小の実行 contract を追加し、登録された定義を実際に呼べる状態にする。

**Architecture:** preset は引き続き root logic を持たず、registry へ定義を登録するだけに留める。ただし定義自体は plain object のまま、`comments.resolve()`・`content.resolve()`・`projection.project()` の最小関数を持たせる。

**Tech Stack:** pnpm workspace, TypeScript, Vitest, `@ikuradon/auftakt`, `packages/auftakt-resonote`

---

### Task 1: comments relation に resolve を追加する

**Files:**

- Modify: `packages/auftakt-resonote/src/comments/comment-relation.ts`
- Modify: `packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts`
- Modify: `packages/auftakt-resonote/src/index.test.ts`

- [ ] **Step 1: failing test を先に書く**

```ts
const relation = registry.relations.get('resonote.comments');
expect(relation).toEqual(
  expect.objectContaining({
    kind: 'relation-definition',
    key: 'resonote.comments',
    resolve: expect.any(Function)
  })
);
expect(relation?.resolve('note-1')).toEqual({
  relation: 'resonote.comments',
  target: 'note-1'
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts packages/auftakt-resonote/src/index.test.ts`
Expected: FAIL because `resolve` is missing

- [ ] **Step 3: 最小 relation 定義を実装する**

```ts
export const createCommentRelation = () => ({
  kind: 'relation-definition',
  key: 'resonote.comments',
  resolve(target: string) {
    return {
      relation: 'resonote.comments',
      target
    };
  }
});
```

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts packages/auftakt-resonote/src/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt-resonote/src/comments/comment-relation.ts packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts packages/auftakt-resonote/src/index.test.ts
git commit -m "feat: add resonote comment relation resolver"
```

### Task 2: projection に project を追加する

**Files:**

- Modify: `packages/auftakt-resonote/src/projection/resonote-projection.ts`
- Modify: `packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts`

- [ ] **Step 1: failing test を書く**

```ts
const projection = registry.projections.get('resonote.feed');
expect(projection).toEqual(
  expect.objectContaining({
    kind: 'projection-definition',
    key: 'resonote.feed',
    project: expect.any(Function)
  })
);
expect(projection?.project([{ id: 'evt-1' }, { id: 'evt-2' }])).toEqual([
  { id: 'evt-1' },
  { id: 'evt-2' }
]);
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts`
Expected: FAIL because `project` is missing

- [ ] **Step 3: 最小 projection 定義を実装する**

```ts
export const createResonoteProjection = () => ({
  kind: 'projection-definition',
  key: 'resonote.feed',
  project<T>(items: T[]): T[] {
    return [...items];
  }
});
```

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts packages/auftakt-resonote/src/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt-resonote/src/projection/resonote-projection.ts packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts
git commit -m "feat: add resonote projection contract"
```

### Task 3: root/preset tests を更新して通し確認する

**Files:**

- Modify: `packages/auftakt-resonote/src/index.test.ts`
- Modify: `packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts`

- [ ] **Step 1: root 経由の利用確認を追加する**

```ts
const relation = registry.relations.get('resonote.comments');
const projection = registry.projections.get('resonote.feed');

expect(relation?.resolve('note-1')).toEqual({
  relation: 'resonote.comments',
  target: 'note-1'
});
expect(projection?.project([{ id: 'evt-1' }])).toEqual([{ id: 'evt-1' }]);
```

- [ ] **Step 2: テストをまとめて実行する**

Run: `pnpm exec vitest run packages/auftakt-resonote/src/index.test.ts packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/auftakt-resonote/src/index.test.ts packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts
git commit -m "test: verify resonote preset contracts"
```
