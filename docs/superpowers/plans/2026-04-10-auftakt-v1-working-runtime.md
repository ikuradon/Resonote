# Auftakt v1 Working Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/auftakt/specs.md` の v1 範囲に合わせて、`packages/auftakt` と `packages/auftakt-resonote` を foundation から実働部品へ引き上げ、`profiles / relays / follows / mute / bookmarks / emoji sets / nip19 / comments / publish` を `auftakt` 主体で安定動作させる。

**Architecture:** 既存 app bridge を延命せず、`builtins -> registry -> handles -> sync/store/transport` の経路を実動化する。実装順は `builtins` と `handle state` を先に固め、次に `publish/signer`、最後に `transport v1` と `resonote preset` を仕上げる。各 Task は TDD で進め、bridge 側の旧 helper は package 側で同等機能が成立した時点で thin wrapper に縮退する。

**Tech Stack:** TypeScript, Vitest, Dexie, nostr-tools 置換済みの `packages/auftakt` client/crypto/nip19, Svelte app bridge

---

## File Structure

- Modify: `docs/auftakt/specs.md`
  - v1 source of truth。必要に応じて完了条件の文言だけ更新する。
- Modify: `packages/auftakt/src/index.ts`
  - builtins / handles / registry surface の公開面を揃える。
- Modify: `packages/auftakt/src/core/runtime.ts`
  - runtime wiring。本 plan の中心。
- Modify: `packages/auftakt/src/registry/runtime-registry.ts`
  - `relations / projections / links / visibilityRules / backfillPolicies / codecs` を持つ registry へ拡張。
- Create/Modify: `packages/auftakt/src/handles/*`
  - `User / Event / Timeline / Session / NostrLink` facade を `handles` 配下へ寄せる。
- Modify: `packages/auftakt/src/core/models/*`
  - 既存 facade を thin shim にするか削除する。
- Modify: `packages/auftakt/src/builtins/*`
  - profiles / relays / follows / mute / bookmarks / emoji / nip19 の built-in 実装。
- Modify: `packages/auftakt/src/store/dexie/*`
  - coverage / tombstone / optimistic reconciliation / query identity を実装。
- Modify: `packages/auftakt/src/sync/sync-engine.ts`
  - coverage-aware load/live、`queryIdentityKey / fetchWindowKey`、v1 recovery を実装。
- Modify: `packages/auftakt/src/transport/client/*`
  - v1 transport state と backward/forward/publish/NIP-11/slot/shard を実動化。
- Modify: `packages/auftakt/src/core/signers/*`
  - `ensureEventFields` 相当の補完パススルーと validation。
- Modify: `packages/auftakt-resonote/src/preset/*`
  - comments/content/projection の preset 実装。
- Modify: `packages/auftakt-resonote/src/bridge/*`
  - bridge を package 内の実働定義へ寄せる。
- Modify: `src/shared/nostr/auftakt-runtime.ts`
  - app bridge を thin wrapper へ縮退。
- Modify: `src/shared/nostr/gateway.ts`
  - 最後に transitional surface をさらに縮める。
- Test:
  - `packages/auftakt/src/**/*.test.ts`
  - `packages/auftakt-resonote/src/**/*.test.ts`
  - `src/shared/nostr/**/*.test.ts`
  - `src/shared/browser/**/*.test.ts`
  - `src/features/**/**/*.test.ts`

### Task 1: Registry Surface を spec 整合へ拡張

**Files:**

- Modify: `packages/auftakt/src/registry/runtime-registry.ts`
- Modify: `packages/auftakt/src/core/runtime.ts`
- Modify: `packages/auftakt/src/index.ts`
- Test: `packages/auftakt/src/registry/runtime-registry.test.ts`
- Test: `packages/auftakt/src/index.test.ts`

- [ ] **Step 1: 失敗する registry 契約テストを書く**

```ts
import { createRuntime } from '../index';

it('runtime registry exposes all spec namespaces', () => {
  const runtime = createRuntime();

  expect(runtime.registry.relations).toBeDefined();
  expect(runtime.registry.projections).toBeDefined();
  expect(runtime.registry.links).toBeDefined();
  expect(runtime.registry.visibilityRules).toBeDefined();
  expect(runtime.registry.backfillPolicies).toBeDefined();
  expect(runtime.registry.codecs).toBeDefined();
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pnpm exec vitest run packages/auftakt/src/registry/runtime-registry.test.ts packages/auftakt/src/index.test.ts`  
Expected: `visibilityRules`, `backfillPolicies`, `codecs` が未定義で FAIL

- [ ] **Step 3: registry 実装を最小追加**

```ts
type RegistryBucket<T> = {
  register(key: string, value: T, options?: { override?: boolean }): void;
  get(key: string): T | undefined;
};

export interface RuntimeRegistry {
  relations: RegistryBucket<RelationDefinition>;
  projections: RegistryBucket<ProjectionDefinition>;
  links: RegistryBucket<LinkDefinition>;
  visibilityRules: RegistryBucket<VisibilityRule>;
  backfillPolicies: RegistryBucket<BackfillPolicyDefinition>;
  codecs: RegistryBucket<EventCodecDefinition>;
}
```

- [ ] **Step 4: runtime と root export を接続**

```ts
export function createRuntime() {
  const registry = createRuntimeRegistry();
  return { registry /* existing store/sync/transport */ };
}
```

- [ ] **Step 5: テストを再実行して通す**

Run: `pnpm exec vitest run packages/auftakt/src/registry/runtime-registry.test.ts packages/auftakt/src/index.test.ts`  
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add packages/auftakt/src/registry/runtime-registry.ts packages/auftakt/src/core/runtime.ts packages/auftakt/src/index.ts packages/auftakt/src/registry/runtime-registry.test.ts packages/auftakt/src/index.test.ts
git commit -m "feat: expand auftakt runtime registry namespaces"
```

### Task 2: `models` を handles facade へ寄せる

**Files:**

- Create: `packages/auftakt/src/handles/user.ts`
- Create: `packages/auftakt/src/handles/event.ts`
- Create: `packages/auftakt/src/handles/nostr-link.ts`
- Create: `packages/auftakt/src/handles/session.ts`
- Modify: `packages/auftakt/src/handles/timeline.ts`
- Modify: `packages/auftakt/src/core/models/user.ts`
- Modify: `packages/auftakt/src/core/models/event.ts`
- Modify: `packages/auftakt/src/core/models/nostr-link.ts`
- Modify: `packages/auftakt/src/core/models/session.ts`
- Modify: `packages/auftakt/src/index.ts`
- Test: `packages/auftakt/src/core/handles/read-facades.test.ts`
- Test: `packages/auftakt/src/core/models/session.test.ts`

- [ ] **Step 1: facade 位置を固定する失敗テストを書く**

```ts
import { User, Event, Timeline, Session, NostrLink } from '../index';

it('exports handle facades from handles layer', () => {
  expect(User.fromPubkey).toBeTypeOf('function');
  expect(Event.fromId).toBeTypeOf('function');
  expect(Timeline.fromFilter).toBeTypeOf('function');
  expect(Session.open).toBeTypeOf('function');
  expect(NostrLink.from).toBeTypeOf('function');
});
```

- [ ] **Step 2: テストを実行して現状を確認**

Run: `pnpm exec vitest run packages/auftakt/src/core/handles/read-facades.test.ts packages/auftakt/src/core/models/session.test.ts packages/auftakt/src/index.test.ts`  
Expected: facade export と実体の置き場が食い違う箇所が FAIL

- [ ] **Step 3: handles 配下へ実装を移す**

```ts
export class UserHandle {
  static fromPubkey(pubkey: string, options: { runtime: Runtime }) {
    return new UserHandle(pubkey, options.runtime);
  }
}

export const User = UserHandle;
```

- [ ] **Step 4: 旧 `core/models/*` を shim にする**

```ts
export { User as default, User } from '../../handles/user';
```

- [ ] **Step 5: root export を handles 側に統一**

```ts
export { User } from './handles/user';
export { Event } from './handles/event';
export { Timeline } from './handles/timeline';
export { Session } from './handles/session';
export { NostrLink } from './handles/nostr-link';
```

- [ ] **Step 6: テストを再実行して通す**

Run: `pnpm exec vitest run packages/auftakt/src/core/handles/read-facades.test.ts packages/auftakt/src/core/models/session.test.ts packages/auftakt/src/index.test.ts`  
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add packages/auftakt/src/handles packages/auftakt/src/core/models packages/auftakt/src/index.ts packages/auftakt/src/core/handles/read-facades.test.ts packages/auftakt/src/core/models/session.test.ts packages/auftakt/src/index.test.ts
git commit -m "refactor: move auftakt facades into handles layer"
```

### Task 3: Core built-ins を v1 必須機能まで実働化

**Files:**

- Modify: `packages/auftakt/src/builtins/register-builtins.ts`
- Create: `packages/auftakt/src/builtins/profiles.ts`
- Create: `packages/auftakt/src/builtins/relays.ts`
- Create: `packages/auftakt/src/builtins/follows.ts`
- Create: `packages/auftakt/src/builtins/mute.ts`
- Create: `packages/auftakt/src/builtins/bookmarks.ts`
- Create: `packages/auftakt/src/builtins/emoji-sets.ts`
- Modify: `packages/auftakt/src/builtins/nip19-link.ts`
- Test: `packages/auftakt/src/builtins/register-builtins.test.ts`

- [ ] **Step 1: built-in 登録不足を表す失敗テストを書く**

```ts
it('registers v1 built-ins into runtime registry', () => {
  const runtime = createRuntime();
  registerBuiltins(runtime);

  expect(runtime.registry.relations.get('user.profile')).toBeDefined();
  expect(runtime.registry.relations.get('user.relays')).toBeDefined();
  expect(runtime.registry.relations.get('user.follows')).toBeDefined();
  expect(runtime.registry.relations.get('user.muteList')).toBeDefined();
  expect(runtime.registry.relations.get('user.bookmarks')).toBeDefined();
  expect(runtime.registry.relations.get('user.customEmojis')).toBeDefined();
  expect(runtime.registry.links.get('nostr')).toBeDefined();
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `pnpm exec vitest run packages/auftakt/src/builtins/register-builtins.test.ts`  
Expected: `user.profile` 以外が未登録で FAIL

- [ ] **Step 3: relation 定義を最小実装**

```ts
export const userRelaysRelation = {
  key: 'user.relays',
  resolve: async ({ pubkey, runtime }) => runtime.store.getLatestUserEvent({ pubkey, kind: 10002 })
};
```

- [ ] **Step 4: `registerBuiltins()` に v1 セットを組み込む**

```ts
export function registerBuiltins(runtime: Runtime) {
  runtime.registry.relations.register('user.profile', profileRelation);
  runtime.registry.relations.register('user.relays', userRelaysRelation);
  runtime.registry.relations.register('user.follows', userFollowsRelation);
  runtime.registry.relations.register('user.muteList', userMuteRelation);
  runtime.registry.relations.register('user.bookmarks', userBookmarksRelation);
  runtime.registry.relations.register('user.customEmojis', userEmojiRelation);
  runtime.registry.links.register('nostr', nostrLinkResolver);
}
```

- [ ] **Step 5: built-in から root logic へ直接触れていないことを確認する追加テストを書く**

```ts
it('built-ins register definitions only', () => {
  const runtime = createRuntime();
  registerBuiltins(runtime);

  expect((runtime as any).transport.userRelaysRelation).toBeUndefined();
});
```

- [ ] **Step 6: テストを再実行して通す**

Run: `pnpm exec vitest run packages/auftakt/src/builtins/register-builtins.test.ts packages/auftakt/src/builtins/nip19-link.test.ts`  
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add packages/auftakt/src/builtins packages/auftakt/src/builtins/register-builtins.test.ts
git commit -m "feat: implement auftakt v1 builtins"
```

### Task 4: Handle state / store / sync を spec どおりに揃える

**Files:**

- Modify: `packages/auftakt/src/store/dexie/persistent-store.ts`
- Modify: `packages/auftakt/src/store/dexie/schema.ts`
- Modify: `packages/auftakt/src/sync/sync-engine.ts`
- Modify: `packages/auftakt/src/handles/timeline.ts`
- Modify: `packages/auftakt/src/handles/user.ts`
- Test: `packages/auftakt/src/store/dexie/persistent-store.test.ts`
- Test: `packages/auftakt/src/sync/sync-engine.test.ts`
- Test: `packages/auftakt/src/core/handles/read-facades.test.ts`

- [ ] **Step 1: `queryIdentityKey / fetchWindowKey / coverage` の失敗テストを書く**

```ts
it('distinguishes query identity from fetch window', async () => {
  const sync = createSyncEngine(/* fakes */);

  const a = sync.getQueryIdentityKey({ authors: ['a'], kinds: [0], limit: 20 });
  const b = sync.getQueryIdentityKey({ authors: ['a'], kinds: [0], limit: 50 });
  const c = sync.getFetchWindowKey({ authors: ['a'], kinds: [0], limit: 20, until: 10 });

  expect(a).toBe(b);
  expect(c).not.toBe(a);
});
```

- [ ] **Step 2: `hasMore / source / stale` の失敗テストを書く**

```ts
it('updates list handle state from fetch result', async () => {
  const timeline = Timeline.fromFilter({ kinds: [1] }, { runtime });
  await timeline.load();

  expect(timeline.state.source).toBe('relay');
  expect(typeof timeline.state.hasMore).toBe('boolean');
  expect(typeof timeline.state.stale).toBe('boolean');
});
```

- [ ] **Step 3: store と sync に identity/window/coverage を追加**

```ts
type CoverageState = 'none' | 'partial' | 'complete';

interface QueryCoverageRecord {
  queryIdentityKey: string;
  state: CoverageState;
}
```

- [ ] **Step 4: optimistic reconciliation を実装**

```ts
putEvent(event) {
  this.deleteOptimisticByMutationId(event.clientMutationId);
  return this.events.put(event);
}
```

- [ ] **Step 5: handle state 更新を実装**

```ts
this.state = {
  items,
  loading: false,
  error: null,
  stale: source === 'cache',
  source,
  hasMore
};
```

- [ ] **Step 6: テストを再実行して通す**

Run: `pnpm exec vitest run packages/auftakt/src/store/dexie/persistent-store.test.ts packages/auftakt/src/sync/sync-engine.test.ts packages/auftakt/src/core/handles/read-facades.test.ts`  
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add packages/auftakt/src/store/dexie packages/auftakt/src/sync/sync-engine.ts packages/auftakt/src/handles packages/auftakt/src/store/dexie/persistent-store.test.ts packages/auftakt/src/sync/sync-engine.test.ts packages/auftakt/src/core/handles/read-facades.test.ts
git commit -m "feat: align auftakt handle state and sync coverage"
```

### Task 5: Publish / signer を補完パススルー実装に揃える

**Files:**

- Modify: `packages/auftakt/src/core/signers/index.ts`
- Modify: `packages/auftakt/src/crypto/index.ts`
- Modify: `packages/auftakt/src/handles/session.ts`
- Modify: `packages/auftakt/src/app-bridge/write-helpers.ts`
- Test: `packages/auftakt/src/core/signers/index.test.ts`
- Test: `packages/auftakt/src/core/models/session.test.ts`
- Test: `packages/auftakt/src/crypto/index.test.ts`

- [ ] **Step 1: 補完パススルーの失敗テストを書く**

```ts
it('passes through fully signed events without re-signing', async () => {
  const signer = nip07Signer(/* mocked nostr */);
  const event = makeSignedEvent();

  const result = await signer.signEvent(event);

  expect(result).toEqual(event);
});
```

- [ ] **Step 2: field validation の失敗テストを書く**

```ts
it('rejects invalid tag shape before publish', async () => {
  await expect(session.send({ ...draft, tags: ['bad'] as any })).rejects.toThrow(/tags/i);
});
```

- [ ] **Step 3: `ensureEventFields` 相当の validator を追加**

```ts
export function ensureEventFields(event: unknown): asserts event is NostrEvent {
  // id, sig, kind, pubkey, content, created_at, tags を検証
}
```

- [ ] **Step 4: signer に補完パススルーを実装**

```ts
if (hasAllFields(candidate)) {
  ensureEventFields(candidate);
  return candidate;
}

return signDraft(candidate);
```

- [ ] **Step 5: `Session.send/cast` を validator 経由に揃える**

```ts
const signed = await signer.signEvent(input);
ensureEventFields(signed);
return publishSigned(signed);
```

- [ ] **Step 6: テストを再実行して通す**

Run: `pnpm exec vitest run packages/auftakt/src/core/signers/index.test.ts packages/auftakt/src/core/models/session.test.ts packages/auftakt/src/crypto/index.test.ts`  
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add packages/auftakt/src/core/signers/index.ts packages/auftakt/src/crypto/index.ts packages/auftakt/src/handles/session.ts packages/auftakt/src/app-bridge/write-helpers.ts packages/auftakt/src/core/signers/index.test.ts packages/auftakt/src/core/models/session.test.ts packages/auftakt/src/crypto/index.test.ts
git commit -m "feat: implement auftakt publish pass-through signing"
```

### Task 6: transport を v1 relay manager まで完成させる

**Files:**

- Modify: `packages/auftakt/src/transport/client/index.ts`
- Modify: `packages/auftakt/src/transport/filter-shard.ts`
- Modify: `packages/auftakt/src/transport/slot-counter.ts`
- Modify: `packages/auftakt/src/sync/sync-engine.ts`
- Test: `packages/auftakt/src/transport/client/index.test.ts`
- Test: `packages/auftakt/src/transport/transport-helpers.test.ts`
- Test: `packages/auftakt/src/sync/sync-engine.test.ts`

- [ ] **Step 1: connection state 完全化の失敗テストを書く**

```ts
it('exposes full v1 transport connection states', () => {
  const state = createConnectionStateMachine();
  expect(state.value).toBe('initialized');
  expect(state.allowed).toContain('waiting-for-retrying');
  expect(state.allowed).toContain('retrying');
  expect(state.allowed).toContain('dormant');
  expect(state.allowed).toContain('rejected');
  expect(state.allowed).toContain('terminated');
});
```

- [ ] **Step 2: NIP-11 / slot / shard の失敗テストを書く**

```ts
it('applies max_filters and max_subscriptions from relay capability', async () => {
  const client = createClient({ relayInfo: { max_filters: 2, max_subscriptions: 4 } });
  const shards = shardFilters(makeFilters(5), 2);

  expect(shards).toHaveLength(3);
  expect(client.slotCounter.max).toBe(4);
});
```

- [ ] **Step 3: transport state machine と queueing を実装**

```ts
export type ConnectionState =
  | 'initialized'
  | 'connecting'
  | 'connected'
  | 'waiting-for-retrying'
  | 'retrying'
  | 'dormant'
  | 'error'
  | 'rejected'
  | 'terminated';
```

- [ ] **Step 4: backward/forward/publish の共有 slot 制御を実装**

```ts
if (!slotCounter.tryAcquire(kind5Reserved ? 1 : requiredSlots)) {
  queue.push(request);
  return;
}
```

- [ ] **Step 5: `negentropy` を入れずに v1 完了条件だけ通す**

```ts
// no negentropy path in v1
export const supportsNegentropy = false;
```

- [ ] **Step 6: テストを再実行して通す**

Run: `pnpm exec vitest run packages/auftakt/src/transport/client/index.test.ts packages/auftakt/src/transport/transport-helpers.test.ts packages/auftakt/src/sync/sync-engine.test.ts`  
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add packages/auftakt/src/transport packages/auftakt/src/sync/sync-engine.ts packages/auftakt/src/transport/client/index.test.ts packages/auftakt/src/transport/transport-helpers.test.ts packages/auftakt/src/sync/sync-engine.test.ts
git commit -m "feat: complete auftakt v1 transport manager"
```

### Task 7: `auftakt-resonote` を comments/content/projection の実働 preset にする

**Files:**

- Modify: `packages/auftakt-resonote/src/preset/register-resonote-preset.ts`
- Modify: `packages/auftakt-resonote/src/comments/comment-relation.ts`
- Modify: `packages/auftakt-resonote/src/content/content-resolver.ts`
- Modify: `packages/auftakt-resonote/src/projection/resonote-projection.ts`
- Modify: `packages/auftakt-resonote/src/bridge/comment-subscription-bridge.ts`
- Test: `packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts`
- Test: `packages/auftakt-resonote/src/bridge/comment-subscription-bridge.test.ts`
- Test: `packages/auftakt-resonote/src/index.test.ts`

- [ ] **Step 1: comments relation が runtime 定義だけでなく解決まで行う失敗テストを書く**

```ts
it('resolves resonote comments through preset relation', async () => {
  const runtime = createRuntime();
  createResonotePreset().register(runtime);

  const relation = runtime.registry.relations.get('resonote.comments');
  const result = await relation?.resolve({ eventId: 'note1', runtime });

  expect(Array.isArray(result)).toBe(true);
});
```

- [ ] **Step 2: projection の失敗テストを書く**

```ts
it('projects resonote feed items with deleted and optimistic flags', () => {
  const projection = createResonoteProjection();
  const items = projection.project([mockComment()]);

  expect(items[0]?.state.deleted).toBe(false);
  expect(items[0]?.state.optimistic).toBe(false);
});
```

- [ ] **Step 3: relation / resolver / projection を実装**

```ts
export const resonoteCommentsRelation = {
  key: 'resonote.comments',
  resolve: async ({ eventId, runtime }) =>
    runtime.store.queryEvents({ '#e': [eventId], kinds: [1] })
};
```

- [ ] **Step 4: bridge を package 実装の thin wrapper にする**

```ts
export function loadCommentSubscriptionBridge(runtime: Runtime) {
  return createCommentSubscriptionBridge(runtime);
}
```

- [ ] **Step 5: テストを再実行して通す**

Run: `pnpm exec vitest run packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts packages/auftakt-resonote/src/bridge/comment-subscription-bridge.test.ts packages/auftakt-resonote/src/index.test.ts`  
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add packages/auftakt-resonote/src/preset packages/auftakt-resonote/src/comments packages/auftakt-resonote/src/content packages/auftakt-resonote/src/projection packages/auftakt-resonote/src/bridge packages/auftakt-resonote/src/preset/register-resonote-preset.test.ts packages/auftakt-resonote/src/bridge/comment-subscription-bridge.test.ts packages/auftakt-resonote/src/index.test.ts
git commit -m "feat: implement resonote preset working definitions"
```

### Task 8: app bridge を縮退し v1 受け入れ確認を行う

**Files:**

- Modify: `src/shared/nostr/auftakt-runtime.ts`
- Modify: `src/shared/nostr/gateway.ts`
- Modify: `src/shared/browser/profile.svelte.ts`
- Modify: `src/shared/browser/relays.svelte.ts`
- Modify: `src/shared/browser/emoji-sets.svelte.ts`
- Modify: `src/features/comments/application/comment-subscription.ts`
- Test: `src/shared/nostr/auftakt-runtime.test.ts`
- Test: `src/shared/browser/profile.svelte.test.ts`
- Test: `src/shared/browser/relays-fetch.test.ts`
- Test: `src/shared/browser/emoji-sets.test.ts`
- Test: `src/features/comments/application/comment-subscription.test.ts`

- [ ] **Step 1: runtime bridge が package helper へ委譲する失敗テストを書く**

```ts
it('keeps auftakt-runtime as thin wrapper over package helpers', async () => {
  const runtime = await getAuftaktRuntime();
  const profile = await runtime.fetchLatestProfileEvents(['pubkey']);

  expect(profile).toBeDefined();
  expect(runtime.__bridgeMode).toBe('thin-wrapper');
});
```

- [ ] **Step 2: `gateway` の残 surface を最小にする失敗テストを書く**

```ts
it('gateway only re-exports transitional publish helpers', async () => {
  expect(typeof publishSignedEvents).toBe('function');
  expect((gateway as any).fetchLatestEvent).toBeUndefined();
});
```

- [ ] **Step 3: `auftakt-runtime.ts` を thin wrapper 化**

```ts
export async function fetchLatestProfileEvents(pubkeys: string[]) {
  const runtime = await getAuftaktRuntime();
  return readHelpers.fetchLatestProfileEvents(runtime, pubkeys);
}
```

- [ ] **Step 4: feature/browser 側の回帰テストを通す**

Run: `pnpm exec vitest run src/shared/nostr/auftakt-runtime.test.ts src/shared/browser/profile.svelte.test.ts src/shared/browser/relays-fetch.test.ts src/shared/browser/emoji-sets.test.ts src/features/comments/application/comment-subscription.test.ts`  
Expected: PASS

- [ ] **Step 5: v1 受け入れテストをまとめて実行**

Run: `pnpm exec vitest run src/shared/browser/profile.svelte.test.ts src/shared/browser/relays-fetch.test.ts src/shared/browser/emoji-sets.test.ts src/features/follows/application/follow-actions.test.ts src/features/bookmarks/application/bookmark-actions.test.ts src/features/mute/application/mute-actions.test.ts src/features/nip19-resolver/application/fetch-event.test.ts src/features/comments/application/comment-subscription.test.ts src/shared/nostr/client.test.ts packages/auftakt/src/index.test.ts packages/auftakt-resonote/src/index.test.ts`  
Expected: PASS。`profiles / relays / follows / mute / bookmarks / emoji sets / nip19 / comments / publish` が `auftakt` 主体で回帰なし

- [ ] **Step 6: コミット**

```bash
git add src/shared/nostr/auftakt-runtime.ts src/shared/nostr/gateway.ts src/shared/browser/profile.svelte.ts src/shared/browser/relays.svelte.ts src/shared/browser/emoji-sets.svelte.ts src/features/comments/application/comment-subscription.ts src/shared/nostr/auftakt-runtime.test.ts src/shared/browser/profile.svelte.test.ts src/shared/browser/relays-fetch.test.ts src/shared/browser/emoji-sets.test.ts src/features/comments/application/comment-subscription.test.ts
git commit -m "refactor: shrink app bridge after auftakt v1 activation"
```

## Self-Review

- Spec coverage:
  - `builtins` の v1 対象は Task 3 で実装
  - `models` を facade 扱いにする件は Task 2 で実装
  - `registry` surface 拡張は Task 1 で実装
  - `handle state / queryIdentityKey / coverage / optimistic reconciliation` は Task 4 で実装
  - `publish/signer` の補完パススルーは Task 5 で実装
  - `transport v1` と `negentropy 非必須` は Task 6 で実装
  - `comments/content/projection` の preset 実働化は Task 7 で実装
  - app bridge の縮退と v1 受け入れ確認は Task 8 で実施
- Placeholder scan:
  - `TODO`, `TBD`, `implement later` は未使用
  - 各 Task に対象ファイル、最小コード、実行コマンド、期待結果を記載済み
- Type consistency:
  - `queryIdentityKey / fetchWindowKey / visibilityRules / backfillPolicies / codecs` の名称は spec と一致
  - `user.profile / user.relays / user.follows / user.muteList / user.bookmarks / user.customEmojis` の relation key を統一
