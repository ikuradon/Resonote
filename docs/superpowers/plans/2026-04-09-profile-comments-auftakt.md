# Profile Comments Auftakt Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move profile comment fetching onto the auftakt runtime bridge while preserving sorting, tagging, pagination flags, and application-level error logging.

**Architecture:** Add one bridge helper in `src/shared/nostr/auftakt-runtime.ts` that fetches authored `kind:1111` events with an optional `until` filter and returns raw events. Keep `src/features/profiles/application/profile-queries.ts` responsible only for transforming those events into `ProfileComment` records, sorting them, computing `hasMore`/`oldestTimestamp`, and logging rejection before rethrowing.

**Tech Stack:** TypeScript, Vitest, rx-nostr, Auftakt runtime bridge.

---

### Task 1: Add failing tests for the bridge helper and delegate path

**Files:**

- Modify: `src/shared/nostr/auftakt-runtime.test.ts`
- Modify: `src/features/profiles/application/profile-queries.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('fetches authored profile comments with optional until through the bridge', async () => {
  const req = { emit: vi.fn(), over: vi.fn() };
  const event = {
    id: 'comment-1',
    pubkey: 'alice',
    created_at: 123,
    kind: 1111,
    tags: [['I', 'spotify:track:abc']],
    content: 'hello',
    sig: 'sig-1'
  };

  createRxBackwardReqMock.mockReturnValue(req);
  getRxNostrMock.mockResolvedValue({
    use: vi.fn().mockReturnValue({
      subscribe: vi.fn(
        (observer: { next: (packet: { event: typeof event }) => void; complete: () => void }) => {
          observer.next({ event });
          observer.complete();
          return { unsubscribe: vi.fn() };
        }
      )
    })
  });

  await expect(fetchAuthoredProfileComments('alice', 999)).resolves.toEqual([event]);
  expect(req.emit).toHaveBeenCalledWith({
    kinds: [1111],
    authors: ['alice'],
    limit: 20,
    until: 999
  });
  expect(req.over).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest src/shared/nostr/auftakt-runtime.test.ts -t "fetches authored profile comments with optional until through the bridge" --run`
Expected: FAIL because `fetchAuthoredProfileComments` does not exist yet.

- [ ] **Step 3: Write the delegate-path failing test**

```ts
it('delegates profile comment fetching to the bridge helper and keeps application shaping', async () => {
  fetchAuthoredProfileCommentsMock.mockResolvedValue([
    {
      id: 'b',
      pubkey: 'alice',
      created_at: 200,
      kind: 1111,
      tags: [],
      content: 'second',
      sig: 'sig-b'
    },
    {
      id: 'a',
      pubkey: 'alice',
      created_at: 100,
      kind: 1111,
      tags: [['I', 'spotify:track:abc']],
      content: 'first',
      sig: 'sig-a'
    }
  ]);

  const result = await fetchProfileComments(PUBKEY, 1234);

  expect(fetchAuthoredProfileCommentsMock).toHaveBeenCalledWith(PUBKEY, 1234);
  expect(result.comments.map((comment) => comment.id)).toEqual(['b', 'a']);
  expect(result.comments[1].iTag).toBe('spotify:track:abc');
  expect(result.oldestTimestamp).toBe(100);
  expect(result.hasMore).toBe(false);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest src/features/profiles/application/profile-queries.test.ts -t "delegates profile comment fetching to the bridge helper and keeps application shaping" --run`
Expected: FAIL because `fetchProfileComments` still uses rx-nostr directly and no bridge mock exists.

### Task 2: Implement the bridge helper

**Files:**

- Modify: `src/shared/nostr/auftakt-runtime.ts`
- Modify: `src/shared/nostr/auftakt-runtime.test.ts`

- [ ] **Step 1: Write the minimal implementation**

```ts
export async function fetchAuthoredProfileComments(
  pubkey: string,
  until?: number
): Promise<SyncEventLike[]> {
  const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
    import('rx-nostr'),
    import('$shared/nostr/gateway.js')
  ]);
  const rxNostr = await getRxNostr();
  const req = createRxBackwardReq();

  return new Promise<SyncEventLike[]>((resolve, reject) => {
    const events: SyncEventLike[] = [];
    let subscription: { unsubscribe(): void } | null = null;
    subscription = rxNostr.use(req).subscribe({
      next: (packet: { event: SyncEventLike }) => {
        events.push(packet.event);
      },
      complete: () => {
        subscription?.unsubscribe();
        resolve(events);
      },
      error: (error: unknown) => {
        log.warn('Profile comment fetch through auftakt bridge failed', { error, pubkey, until });
        subscription?.unsubscribe();
        if (events.length > 0) {
          resolve(events);
          return;
        }
        reject(error);
      }
    });

    req.emit(
      until
        ? { kinds: [1111], authors: [pubkey], limit: 20, until }
        : { kinds: [1111], authors: [pubkey], limit: 20 }
    );
    req.over();
  });
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm vitest src/shared/nostr/auftakt-runtime.test.ts -t "fetches authored profile comments with optional until through the bridge" --run`
Expected: PASS.

### Task 3: Delegate profile comment shaping to the bridge

**Files:**

- Modify: `src/features/profiles/application/profile-queries.ts`
- Modify: `src/features/profiles/application/profile-queries.test.ts`

- [ ] **Step 1: Write the minimal implementation**

```ts
import { fetchAuthoredProfileComments } from '$shared/nostr/auftakt-runtime.js';

export async function fetchProfileComments(
  pubkey: string,
  until?: number
): Promise<ProfileCommentsResult> {
  try {
    const events = await fetchAuthoredProfileComments(pubkey, until);
    const comments = events
      .map((event) => ({
        id: event.id,
        content: event.content,
        createdAt: event.created_at,
        iTag: event.tags.find((tag) => tag[0] === 'I')?.[1] ?? null
      }))
      .sort((a, b) => b.createdAt - a.createdAt);

    return {
      comments,
      hasMore: comments.length >= COMMENTS_LIMIT,
      oldestTimestamp: comments.length > 0 ? comments[comments.length - 1].createdAt : null
    };
  } catch (err) {
    log.error('Failed to load profile comments', err);
    throw err;
  }
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm vitest src/features/profiles/application/profile-queries.test.ts --run`
Expected: PASS.

### Task 4: Verify both suites and commit

**Files:**

- Modify: `src/shared/nostr/auftakt-runtime.ts`
- Modify: `src/shared/nostr/auftakt-runtime.test.ts`
- Modify: `src/features/profiles/application/profile-queries.ts`
- Modify: `src/features/profiles/application/profile-queries.test.ts`

- [ ] **Step 1: Run the focused test files**

Run: `pnpm vitest src/shared/nostr/auftakt-runtime.test.ts src/features/profiles/application/profile-queries.test.ts --run`
Expected: PASS with zero failures.

- [ ] **Step 2: Commit**

```bash
git add src/shared/nostr/auftakt-runtime.ts src/shared/nostr/auftakt-runtime.test.ts src/features/profiles/application/profile-queries.ts src/features/profiles/application/profile-queries.test.ts docs/superpowers/plans/2026-04-09-profile-comments-auftakt.md
git commit -m "feat: bridge profile comments through auftakt"
```
