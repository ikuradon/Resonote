# Auftakt Final Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/shared/nostr/auftakt-runtime.ts` に残る実処理を `packages/auftakt` / `packages/auftakt-resonote` 側へ戻し、`gateway.ts` を最小互換境界として整理したうえで、旧 `rx-nostr + event-db + cached-query` 由来の互換レイヤを段階的に撤去する。

**Architecture:** まず app bridge に残っている責務を `read/cache/query`, `subscription/comment`, `publish/write`, `relay/profile/emoji/follow` に分けて棚卸しし、それぞれ package 側の destination を決める。次に package へ実処理を戻し、app 側は preset/runtime bootstrap と thin adapter だけに縮める。最後に `gateway.ts` と旧 export を整理し、回帰テストで移行完了を確認する。

**Tech Stack:** pnpm workspace, TypeScript, Vitest, `packages/auftakt`, `packages/auftakt-resonote`, `src/shared/nostr/auftakt-runtime.ts`, `docs/auftakt/specs.md`

---

### Task 1: bridge 残責務の棚卸しと destination を固定する

**Files:**

- Modify: `docs/auftakt/specs.md`
- Create: `src/shared/nostr/auftakt-runtime-surface.test.ts`
- Test: `src/shared/nostr/auftakt-runtime-surface.test.ts`

- [ ] **Step 1: surface inventory の failing test を書く**

```ts
import { describe, expect, it } from 'vitest';

describe('auftakt runtime surface inventory', () => {
  it('exposes only the currently approved app bridge helpers', async () => {
    const runtime = await import('./auftakt-runtime.js');
    expect(Object.keys(runtime).sort()).toEqual([
      'castSignedEvent',
      'clearNostrEventsCache',
      'fetchAuthoredProfileComments',
      'fetchFollowEventsByAuthors',
      'fetchLatestAddressableEvent',
      'fetchLatestAuthorTaggedEvent',
      'fetchLatestEventByAuthorKind',
      'fetchLatestEventByAuthorKindViaRelay',
      'fetchLatestFollowEvent',
      'fetchLatestProfileEvents',
      'fetchNostrEventById',
      'fetchRelayListByPubkey',
      'getAuftaktRuntime',
      'getCachedLatestEventByAuthorKind',
      'getCachedNostrEventById',
      'getNostrEventsDb',
      'getRelayConnectionState',
      'loadCachedEmojiList',
      'loadCachedFollowGraph',
      'loadCommentSubscriptionBridge',
      'loadEmojiSetEvents',
      'loadLatestEmojiListEvent',
      'loadNostrDbStats',
      'observeRelayConnectionStates',
      'resetAuftaktRuntime',
      'setDefaultRelays',
      'subscribeFollowCommentEvents',
      'subscribeMentionNotificationEvents'
    ]);
  });
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run src/shared/nostr/auftakt-runtime-surface.test.ts`
Expected: FAIL because inventory test is new and surface is not yet documented

- [ ] **Step 3: 現行 surface と destination を spec に追記する**

```md
### Transitional Bridge Inventory

- `packages/auftakt`
  - latest event reads
  - cached event reads
  - relay-backed single event fetch
  - publish threshold / signer path
- `packages/auftakt-resonote`
  - comment subscription bridge
  - authored profile comments
  - content / resolver helpers
- `src/shared/nostr/auftakt-runtime.ts`
  - bootstrap and thin app adapters only
```

`docs/auftakt/specs.md` に、現在の helper 名と「最終的にどこへ戻すか」の対応表を追加する。

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run src/shared/nostr/auftakt-runtime-surface.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/auftakt/specs.md src/shared/nostr/auftakt-runtime-surface.test.ts
git commit -m "docs: inventory auftakt runtime bridge surface"
```

### Task 2: read/cache/query helper を `packages/auftakt` 側へ戻す

**Files:**

- Modify: `packages/auftakt/src/index.ts`
- Create: `packages/auftakt/src/app-bridge/read-helpers.ts`
- Create: `packages/auftakt/src/app-bridge/read-helpers.test.ts`
- Modify: `src/shared/nostr/auftakt-runtime.ts`
- Test: `packages/auftakt/src/app-bridge/read-helpers.test.ts`
- Test: `src/shared/nostr/auftakt-runtime.test.ts`
- Test: `src/shared/nostr/cached-query.test.ts`

- [ ] **Step 1: package 側 helper の failing test を書く**

```ts
import { describe, expect, it } from 'vitest';
import { createReadHelpers } from './read-helpers.ts';

describe('read helpers', () => {
  it('fetches latest event and single event through injected runtime dependencies', async () => {
    const helpers = createReadHelpers({
      fetchLatestByAuthorKind: async () => ({
        kind: 0,
        tags: [],
        content: 'cached',
        created_at: 1
      }),
      fetchEventById: async () => ({ kind: 1111, tags: [], content: 'evt' })
    });

    await expect(helpers.fetchLatestEventByAuthorKind('alice', 0)).resolves.toMatchObject({
      content: 'cached'
    });
    await expect(helpers.fetchNostrEventById('evt-1', [])).resolves.toMatchObject({
      content: 'evt'
    });
  });
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/app-bridge/read-helpers.test.ts`
Expected: FAIL because helper module does not exist

- [ ] **Step 3: package 側 helper を最小実装する**

```ts
export function createReadHelpers(input: {
  fetchLatestByAuthorKind: (pubkey: string, kind: number) => Promise<FetchedNostrEvent | null>;
  fetchEventById: (eventId: string, relayHints: string[]) => Promise<FetchedNostrEvent | null>;
}) {
  return {
    fetchLatestEventByAuthorKind(pubkey: string, kind: number) {
      return input.fetchLatestByAuthorKind(pubkey, kind);
    },
    fetchNostrEventById(eventId: string, relayHints: string[]) {
      return input.fetchEventById(eventId, relayHints);
    }
  };
}
```

`src/shared/nostr/auftakt-runtime.ts` の既存 helper は package helper を使う thin wrapper に置き換える。

- [ ] **Step 4: 回帰テストを実行する**

Run: `pnpm exec vitest run packages/auftakt/src/app-bridge/read-helpers.test.ts src/shared/nostr/auftakt-runtime.test.ts src/shared/nostr/cached-query.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt/src/index.ts packages/auftakt/src/app-bridge/read-helpers.ts packages/auftakt/src/app-bridge/read-helpers.test.ts src/shared/nostr/auftakt-runtime.ts
git commit -m "feat: move auftakt read helpers into package"
```

### Task 3: publish/write helper を `packages/auftakt` 側へ戻す

**Files:**

- Create: `packages/auftakt/src/app-bridge/write-helpers.ts`
- Create: `packages/auftakt/src/app-bridge/write-helpers.test.ts`
- Modify: `packages/auftakt/src/index.ts`
- Modify: `src/shared/nostr/auftakt-runtime.ts`
- Test: `packages/auftakt/src/app-bridge/write-helpers.test.ts`
- Test: `src/shared/nostr/auftakt-runtime.test.ts`
- Test: `src/shared/nostr/client.test.ts`

- [ ] **Step 1: package write helper の failing test を書く**

```ts
import { describe, expect, it } from 'vitest';
import { createWriteHelpers } from './write-helpers.ts';

describe('write helpers', () => {
  it('publishes with a relay success threshold', async () => {
    const helpers = createWriteHelpers({
      getRelayCount: () => 4,
      sendSigned: async () => [true, true, false, false]
    });

    await expect(
      helpers.castSignedEvent({ kind: 1, content: 'test', tags: [] }, { successThreshold: 0.5 })
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/app-bridge/write-helpers.test.ts`
Expected: FAIL because helper module does not exist

- [ ] **Step 3: package write helper を最小実装する**

```ts
export function createWriteHelpers(input: {
  getRelayCount: () => number;
  sendSigned: (params: EventParameters) => Promise<boolean[]>;
}) {
  return {
    async castSignedEvent(params: EventParameters, options: { successThreshold?: number } = {}) {
      const threshold = options.successThreshold ?? 0.5;
      const needed = Math.max(1, Math.ceil(input.getRelayCount() * threshold));
      const oks = await input.sendSigned(params);
      if (oks.filter(Boolean).length >= needed) return;
      throw new Error('All relays rejected the event');
    }
  };
}
```

`src/shared/nostr/auftakt-runtime.ts` の `castSignedEvent()` は package helper 呼び出しだけにする。

- [ ] **Step 4: 回帰テストを実行する**

Run: `pnpm exec vitest run packages/auftakt/src/app-bridge/write-helpers.test.ts src/shared/nostr/auftakt-runtime.test.ts src/shared/nostr/client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt/src/index.ts packages/auftakt/src/app-bridge/write-helpers.ts packages/auftakt/src/app-bridge/write-helpers.test.ts src/shared/nostr/auftakt-runtime.ts
git commit -m "feat: move auftakt write helpers into package"
```

### Task 4: comment / notification subscription bridge を `packages/auftakt-resonote` 側へ戻す

**Files:**

- Create: `packages/auftakt-resonote/src/bridge/comment-subscription-bridge.ts`
- Create: `packages/auftakt-resonote/src/bridge/comment-subscription-bridge.test.ts`
- Modify: `packages/auftakt-resonote/src/index.ts`
- Modify: `src/shared/nostr/auftakt-runtime.ts`
- Test: `packages/auftakt-resonote/src/bridge/comment-subscription-bridge.test.ts`
- Test: `src/shared/nostr/auftakt-comment-bridge.test.ts`
- Test: `src/features/comments/application/comment-subscription.test.ts`
- Test: `src/features/notifications/ui/notifications-view-model.test.ts`

- [ ] **Step 1: preset-side bridge の failing test を書く**

```ts
import { describe, expect, it } from 'vitest';
import { createCommentSubscriptionBridge } from './comment-subscription-bridge.ts';

describe('comment subscription bridge', () => {
  it('builds backward/forward handlers from injected stream factory', () => {
    const bridge = createCommentSubscriptionBridge({
      createDuplex: () => ({
        backward: { emit: () => {}, over: () => {} },
        forward: { emit: () => {} },
        backwardStream: { subscribe: () => ({ unsubscribe() {} }) },
        forwardStream: { subscribe: () => ({ unsubscribe() {} }) }
      })
    });

    expect(bridge.startSubscription).toBeTypeOf('function');
  });
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt-resonote/src/bridge/comment-subscription-bridge.test.ts`
Expected: FAIL because bridge module does not exist

- [ ] **Step 3: preset 側へ bridge を移す**

```ts
export function createCommentSubscriptionBridge(input: {
  createDuplex(): {
    backward: { emit(filter: SyncFilter | SyncFilter[]): void; over(): void };
    forward: { emit(filter: SyncFilter | SyncFilter[]): void };
    backwardStream: { subscribe(callbacks: object): { unsubscribe(): void } };
    forwardStream: { subscribe(callbacks: object): { unsubscribe(): void } };
  };
  createBackward(): {
    req: { emit(filter: SyncFilter | SyncFilter[]): void; over(): void };
    stream: { subscribe(callbacks: object): { unsubscribe(): void } };
  };
}) { ... }
```

`src/shared/nostr/auftakt-runtime.ts` の `loadCommentSubscriptionBridge()` は package helper の組み立てだけにする。

- [ ] **Step 4: 回帰テストを実行する**

Run: `pnpm exec vitest run packages/auftakt-resonote/src/bridge/comment-subscription-bridge.test.ts src/shared/nostr/auftakt-comment-bridge.test.ts src/features/comments/application/comment-subscription.test.ts src/features/notifications/ui/notifications-view-model.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt-resonote/src/index.ts packages/auftakt-resonote/src/bridge/comment-subscription-bridge.ts packages/auftakt-resonote/src/bridge/comment-subscription-bridge.test.ts src/shared/nostr/auftakt-runtime.ts
git commit -m "feat: move resonote subscription bridge into preset package"
```

### Task 5: relay/profile/emoji/follow helper を package destination ごとに戻す

**Files:**

- Create: `packages/auftakt/src/app-bridge/profile-relay-helpers.ts`
- Create: `packages/auftakt/src/app-bridge/profile-relay-helpers.test.ts`
- Create: `packages/auftakt-resonote/src/bridge/emoji-helpers.ts`
- Create: `packages/auftakt-resonote/src/bridge/emoji-helpers.test.ts`
- Modify: `packages/auftakt/src/index.ts`
- Modify: `packages/auftakt-resonote/src/index.ts`
- Modify: `src/shared/nostr/auftakt-runtime.ts`
- Test: `src/shared/browser/profile.svelte.test.ts`
- Test: `src/shared/browser/relays-fetch.test.ts`
- Test: `src/shared/browser/emoji-sets.test.ts`
- Test: `src/features/follows/infra/wot-fetcher.test.ts`

- [ ] **Step 1: helper destination の failing test を先に書く**

```ts
it('exposes profile and relay helpers from @ikuradon/auftakt', async () => {
  const pkg = await import('@ikuradon/auftakt');
  expect(typeof pkg.createProfileRelayHelpers).toBe('function');
});

it('exposes emoji helpers from @ikuradon/auftakt-resonote', async () => {
  const pkg = await import('@ikuradon/auftakt-resonote');
  expect(typeof pkg.createEmojiHelpers).toBe('function');
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run packages/auftakt/src/app-bridge/profile-relay-helpers.test.ts packages/auftakt-resonote/src/bridge/emoji-helpers.test.ts`
Expected: FAIL because helpers do not exist

- [ ] **Step 3: helper を destination ごとに実装する**

```ts
// packages/auftakt/src/app-bridge/profile-relay-helpers.ts
export function createProfileRelayHelpers(input: { ... }) {
  return {
    fetchLatestProfileEvents: input.fetchLatestProfileEvents,
    fetchRelayListByPubkey: input.fetchRelayListByPubkey,
    fetchFollowEventsByAuthors: input.fetchFollowEventsByAuthors
  };
}

// packages/auftakt-resonote/src/bridge/emoji-helpers.ts
export function createEmojiHelpers(input: { ... }) {
  return {
    loadLatestEmojiListEvent: input.loadLatestEmojiListEvent,
    loadEmojiSetEvents: input.loadEmojiSetEvents
  };
}
```

`src/shared/nostr/auftakt-runtime.ts` は package helper を束ねる adapter に置き換える。

- [ ] **Step 4: app 回帰テストを実行する**

Run: `pnpm exec vitest run src/shared/browser/profile.svelte.test.ts src/shared/browser/relays-fetch.test.ts src/shared/browser/emoji-sets.test.ts src/features/follows/infra/wot-fetcher.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/auftakt/src/index.ts packages/auftakt/src/app-bridge/profile-relay-helpers.ts packages/auftakt/src/app-bridge/profile-relay-helpers.test.ts packages/auftakt-resonote/src/index.ts packages/auftakt-resonote/src/bridge/emoji-helpers.ts packages/auftakt-resonote/src/bridge/emoji-helpers.test.ts src/shared/nostr/auftakt-runtime.ts
git commit -m "feat: move profile relay and emoji helpers into packages"
```

### Task 6: `gateway` 利用と旧 export を最小化する

**Files:**

- Modify: `src/shared/nostr/gateway.ts`
- Modify: `src/shared/nostr/gateway.test.ts`
- Modify: `docs/auftakt/specs.md`
- Test: `src/shared/nostr/gateway.test.ts`

- [ ] **Step 1: gateway minimal surface の failing test を書く**

```ts
it('keeps only the explicitly approved transitional exports', async () => {
  const gateway = await import('./gateway.js');
  expect(Object.keys(gateway).sort()).toEqual([
    'castSigned',
    'fetchLatestEvent',
    'getEventsDB',
    'getRxNostr',
    'publishSignedEvent',
    'publishSignedEvents',
    'retryPendingPublishes'
  ]);
});
```

- [ ] **Step 2: テスト失敗を確認する**

Run: `pnpm exec vitest run src/shared/nostr/gateway.test.ts`
Expected: FAIL if surface is broader than expected

- [ ] **Step 3: gateway/spec を最小 surface に揃える**

```md
- `gateway.ts` remains only while feature imports are being retired.
- New code must prefer package APIs or `auftakt-runtime.ts`.
- `getEventsDB` remains transitional only for legacy compatibility.
```

不要 export や曖昧な comment があれば削り、`docs/auftakt/specs.md` の transitional section を更新する。

- [ ] **Step 4: テストを再実行する**

Run: `pnpm exec vitest run src/shared/nostr/gateway.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/gateway.ts src/shared/nostr/gateway.test.ts docs/auftakt/specs.md
git commit -m "refactor: minimize gateway transitional surface"
```

### Task 7: 旧互換レイヤ撤去前の全体回帰とブロッカー整理

**Files:**

- Modify: `docs/auftakt/specs.md`
- Modify: `docs/superpowers/plans/2026-04-09-auftakt-final-migration.md`

- [ ] **Step 1: full regression の failing expectation を先に置く**

```md
### Verification Target

- runtime bridge focused tests: all pass
- migrated app feature tests: all pass
- known unrelated failures: listed explicitly
```

`docs/auftakt/specs.md` に「回帰で通す対象」と「既知の別件失敗」を追記する下書きを置く。

- [ ] **Step 2: 回帰テストを実行して結果を記録する**

Run:

```bash
pnpm exec vitest run \
  src/shared/nostr/gateway.test.ts \
  src/shared/nostr/auftakt-runtime.test.ts \
  src/shared/nostr/client.test.ts \
  src/shared/nostr/cached-query.test.ts \
  src/shared/nostr/auftakt-comment-bridge.test.ts \
  src/features/comments/application/comment-subscription.test.ts \
  src/features/notifications/ui/notifications-view-model.test.ts \
  src/shared/browser/relays-fetch.test.ts \
  src/shared/browser/emoji-sets.test.ts \
  src/shared/browser/profile.svelte.test.ts \
  src/features/follows/infra/wot-fetcher.test.ts \
  src/features/nip19-resolver/application/fetch-event.test.ts
```

Expected: PASS, もし失敗があれば failure を「差分起因 / 既知の別件」に分類して記録する

- [ ] **Step 3: 残ブロッカーを docs に反映する**

```md
### Remaining blockers

- remove `gateway.ts` entirely
- remove legacy `event-db.ts` facade
- remove deprecated wrappers from `client.ts`
- fix unrelated failing test: `src/shared/nostr/user-relays.test.ts` (if still failing)
```

- [ ] **Step 4: 仕上げ commit を作る**

```bash
git add docs/auftakt/specs.md docs/superpowers/plans/2026-04-09-auftakt-final-migration.md
git commit -m "docs: record auftakt final migration verification state"
```
