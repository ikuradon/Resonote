# External Content Reaction (kind:17) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 外部コンテンツ (Spotify, YouTube, Podcast 等) に対して NIP-25 kind:17 で直接リアクション (いいね) できるようにする

**Architecture:** `buildContentReaction` でイベント構築、既存の購読パイプラインに kind:17 フィルタを追加、CommentTabBar に UI ボタンを配置。既存の kind:7 (コメントへのリアクション) とは独立した state で管理。

**Tech Stack:** TypeScript, Svelte 5 runes, rx-nostr, Vitest

---

### Task 1: ドメイン型の追加

**Files:**

- Modify: `src/features/comments/domain/comment-model.ts`
- Test: (型定義のみ、テスト不要)

- [ ] **Step 1: ContentReaction 型と ContentReactionStats 型を追加**

`src/features/comments/domain/comment-model.ts` の末尾に追加:

```ts
export interface ContentReaction {
  id: string;
  pubkey: string;
  createdAt: number;
}

export interface ContentReactionStats {
  likes: number;
  reactors: Set<string>;
  myReactionId: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/comments/domain/comment-model.ts
git commit -m "feat: add ContentReaction and ContentReactionStats domain types"
```

---

### Task 2: buildContentReaction イベントビルダー

**Files:**

- Modify: `src/shared/nostr/events.ts`
- Modify: `src/shared/nostr/events.test.ts`

- [ ] **Step 1: Write failing tests**

`src/shared/nostr/events.test.ts` の末尾 (最後の `});` の前) に追加:

```ts
describe('buildContentReaction', () => {
  it('should build a kind:17 event with i, k, and r tags', () => {
    const event = buildContentReaction(trackId, provider);
    expect(event.kind).toBe(17);
    expect(event.content).toBe('+');
    expect(event.tags).toEqual([
      ['i', 'spotify:track:abc123', 'https://open.spotify.com/track/abc123'],
      ['k', 'spotify:track'],
      ['r', 'https://open.spotify.com/track/abc123']
    ]);
  });

  it('should not include e or p tags', () => {
    const event = buildContentReaction(trackId, provider);
    const eTags = event.tags!.filter((t) => t[0] === 'e');
    const pTags = event.tags!.filter((t) => t[0] === 'p');
    expect(eTags).toHaveLength(0);
    expect(pTags).toHaveLength(0);
  });

  it('should work with episode content', () => {
    const event = buildContentReaction(episodeId, provider);
    expect(event.kind).toBe(17);
    expect(event.tags).toContainEqual([
      'i',
      'spotify:episode:ep456',
      'https://open.spotify.com/episode/ep456'
    ]);
    expect(event.tags).toContainEqual(['k', 'spotify:episode']);
    expect(event.tags).toContainEqual(['r', 'https://open.spotify.com/episode/ep456']);
  });
});
```

Also add `buildContentReaction` and `CONTENT_REACTION_KIND` to the import at the top of the test file:

```ts
import {
  buildComment,
  buildContentReaction,
  buildDeletion,
  buildReaction,
  buildShare,
  COMMENT_KIND,
  CONTENT_REACTION_KIND,
  extractDeletionTargets,
  extractHashtags,
  formatPosition,
  parsePosition
} from './events.js';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/nostr/events.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — `buildContentReaction` is not exported

- [ ] **Step 3: Implement buildContentReaction**

In `src/shared/nostr/events.ts`, add the constant after `BOOKMARK_KIND` (line 16):

```ts
export const CONTENT_REACTION_KIND = 17;
```

Then add the function at the end of the file (before the closing):

```ts
export function buildContentReaction(
  contentId: ContentId,
  provider: ContentProvider
): EventParameters {
  const { value, hint, kind } = resolveContentInfo(provider, contentId);
  return {
    kind: CONTENT_REACTION_KIND,
    content: '+',
    tags: [
      ['i', value, hint],
      ['k', kind],
      ['r', hint]
    ]
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/shared/nostr/events.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/events.ts src/shared/nostr/events.test.ts
git commit -m "feat: add buildContentReaction for NIP-25 kind:17 events"
```

---

### Task 3: contentReactionFromEvent マッパー

**Files:**

- Modify: `src/features/comments/domain/comment-mappers.ts`
- Modify: `src/features/comments/domain/comment-mappers.test.ts`

- [ ] **Step 1: Write failing test**

Add to `src/features/comments/domain/comment-mappers.test.ts`. First add the import:

```ts
import {
  commentFromEvent,
  contentReactionFromEvent,
  reactionFromEvent
} from './comment-mappers.js';
```

Then add a new describe block:

```ts
describe('contentReactionFromEvent', () => {
  it('should convert a kind:17 event into a ContentReaction', () => {
    const event = {
      id: 'cr1',
      pubkey: 'pk1',
      content: '+',
      created_at: 1700000000,
      tags: [
        ['i', 'spotify:track:abc', 'https://open.spotify.com/track/abc'],
        ['k', 'spotify:track'],
        ['r', 'https://open.spotify.com/track/abc']
      ],
      kind: 17
    };
    const result = contentReactionFromEvent(event);
    expect(result).toEqual({
      id: 'cr1',
      pubkey: 'pk1',
      createdAt: 1700000000
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/comments/domain/comment-mappers.test.ts --reporter=verbose 2>&1 | tail -10`
Expected: FAIL — `contentReactionFromEvent` is not exported

- [ ] **Step 3: Implement contentReactionFromEvent**

In `src/features/comments/domain/comment-mappers.ts`, add the import:

```ts
import type {
  Comment,
  ContentReaction,
  NostrEvent,
  PlaceholderComment,
  Reaction
} from './comment-model.js';
```

Then add the function at the end of the file:

```ts
/** Convert a kind:17 Nostr event into a ContentReaction domain model. */
export function contentReactionFromEvent(
  event: Pick<NostrEvent, 'id' | 'pubkey' | 'created_at'>
): ContentReaction {
  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/features/comments/domain/comment-mappers.test.ts --reporter=verbose 2>&1 | tail -10`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/comments/domain/comment-mappers.ts src/features/comments/domain/comment-mappers.test.ts
git commit -m "feat: add contentReactionFromEvent mapper for kind:17"
```

---

### Task 4: sendContentReaction / deleteContentReaction アクション

**Files:**

- Modify: `src/features/comments/application/comment-actions.ts`
- Modify: `src/features/comments/application/comment-actions.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `src/features/comments/application/comment-actions.test.ts`. First update the mock and import. Add `buildContentReactionMock` to hoisted mocks:

```ts
buildContentReactionMock: vi.fn(() => ({ kind: 17, content: '+', tags: [] })),
```

Add to the `vi.mock('$shared/nostr/events.js')` block:

```ts
buildContentReaction: buildContentReactionMock,
CONTENT_REACTION_KIND: 17,
```

Add import:

```ts
import { deleteContentReaction, sendContentReaction } from './comment-actions.js';
```

Then add test blocks:

```ts
describe('sendContentReaction', () => {
  it('should call buildContentReaction and castSigned', async () => {
    await sendContentReaction({ contentId: mockContentId, provider: mockProvider });

    expect(buildContentReactionMock).toHaveBeenCalledWith(mockContentId, mockProvider);
    expect(castSignedMock).toHaveBeenCalledWith({ kind: 17, content: '+', tags: [] });
  });
});

describe('deleteContentReaction', () => {
  it('should call buildDeletion with CONTENT_REACTION_KIND and castSigned', async () => {
    await deleteContentReaction({
      reactionId: 'cr-123',
      contentId: mockContentId,
      provider: mockProvider
    });

    expect(buildDeletionMock).toHaveBeenCalledWith(['cr-123'], mockContentId, mockProvider, 17);
    expect(castSignedMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/comments/application/comment-actions.test.ts --reporter=verbose 2>&1 | tail -15`
Expected: FAIL — `sendContentReaction` / `deleteContentReaction` not exported

- [ ] **Step 3: Implement the actions**

In `src/features/comments/application/comment-actions.ts`, update the import:

```ts
import {
  buildComment,
  buildContentReaction,
  buildDeletion,
  buildReaction,
  COMMENT_KIND,
  CONTENT_REACTION_KIND
} from '$shared/nostr/events.js';
```

Add at the end of the file:

```ts
export interface SendContentReactionParams {
  contentId: ContentId;
  provider: ContentProvider;
}

/** Send a content reaction (kind:17 like) to external content. */
export async function sendContentReaction(params: SendContentReactionParams): Promise<void> {
  const eventParams = buildContentReaction(params.contentId, params.provider);
  await castSigned(eventParams);
  log.info('Content reaction sent');
}

export interface DeleteContentReactionParams {
  reactionId: string;
  contentId: ContentId;
  provider: ContentProvider;
}

/** Delete a content reaction via kind:5 deletion event. */
export async function deleteContentReaction(params: DeleteContentReactionParams): Promise<void> {
  const eventParams = buildDeletion(
    [params.reactionId],
    params.contentId,
    params.provider,
    CONTENT_REACTION_KIND
  );
  await castSigned(eventParams);
  log.info('Content reaction deleted', { reactionId: shortHex(params.reactionId) });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/features/comments/application/comment-actions.test.ts --reporter=verbose 2>&1 | tail -15`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/comments/application/comment-actions.ts src/features/comments/application/comment-actions.test.ts
git commit -m "feat: add sendContentReaction and deleteContentReaction actions"
```

---

### Task 5: 購読フィルタに kind:17 追加

**Files:**

- Modify: `src/features/comments/application/comment-subscription.ts`
- Modify: `src/features/comments/application/comment-subscription.test.ts`

- [ ] **Step 1: Write failing test**

In `src/features/comments/application/comment-subscription.test.ts`, add a test (inside the existing `describe('buildContentFilters')` block):

```ts
it('fourth filter uses CONTENT_REACTION_KIND (17) with lowercase #i tag', () => {
  const filters = buildContentFilters('spotify:track:abc123');
  expect(filters[3]).toEqual({
    kinds: [17],
    '#i': ['spotify:track:abc123']
  });
});

it('returns 4 filters total', () => {
  const filters = buildContentFilters('spotify:track:abc123');
  expect(filters).toHaveLength(4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/comments/application/comment-subscription.test.ts --reporter=verbose 2>&1 | tail -15`
Expected: FAIL — filters only has 3 elements

- [ ] **Step 3: Add kind:17 filter**

In `src/features/comments/application/comment-subscription.ts`, update the import:

```ts
import {
  COMMENT_KIND,
  CONTENT_REACTION_KIND,
  DELETION_KIND,
  REACTION_KIND
} from '$shared/nostr/events.js';
```

Update `buildContentFilters`:

```ts
export function buildContentFilters(idValue: string) {
  return [
    { kinds: [COMMENT_KIND], '#I': [idValue] },
    { kinds: [REACTION_KIND], '#I': [idValue] },
    { kinds: [DELETION_KIND], '#I': [idValue] },
    { kinds: [CONTENT_REACTION_KIND], '#i': [idValue] }
  ];
}
```

Note: `#i` (lowercase) for kind:17, `#I` (uppercase) for kind:7/1111/5.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/features/comments/application/comment-subscription.test.ts --reporter=verbose 2>&1 | tail -15`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/comments/application/comment-subscription.ts src/features/comments/application/comment-subscription.test.ts
git commit -m "feat: add kind:17 content reaction filter to subscription"
```

---

### Task 6: comment-view-model に kind:17 処理を追加

**Files:**

- Modify: `src/features/comments/ui/comment-view-model.svelte.ts`

- [ ] **Step 1: Add imports and state**

In `src/features/comments/ui/comment-view-model.svelte.ts`, update the import from events.js:

```ts
import {
  COMMENT_KIND,
  CONTENT_REACTION_KIND,
  DELETION_KIND,
  REACTION_KIND
} from '$shared/nostr/events.js';
```

Add import of contentReactionFromEvent:

```ts
import {
  commentFromEvent,
  contentReactionFromEvent,
  placeholderFromOrphan,
  reactionFromEvent
} from '../domain/comment-mappers.js';
```

Add import of types:

```ts
import type {
  Comment,
  ContentReaction,
  ContentReactionStats,
  PlaceholderComment,
  Reaction
} from '../domain/comment-model.js';
```

- [ ] **Step 2: Add content reaction state inside createCommentViewModel**

After the `let placeholders` line (around line 59), add:

```ts
let contentReactionIds = new Set<string>();
let contentReactionsRaw = $state<ContentReaction[]>([]);
```

- [ ] **Step 3: Add the derived contentReactionStats**

After the contentReactionsRaw declaration, add:

```ts
let contentReactionStats = $derived.by<ContentReactionStats>(() => {
  const { pubkey: myPubkey } =
    // Dynamic import avoidance — getAuth is already available in the module scope
    // eslint-disable-next-line no-restricted-imports
    { pubkey: null as string | null };
  let likes = 0;
  const reactors = new Set<string>();
  let myReactionId: string | null = null;
  for (const cr of contentReactionsRaw) {
    if (deletedIds.has(cr.id)) continue;
    likes++;
    reactors.add(cr.pubkey);
    if (cr.pubkey === myPubkey) myReactionId = cr.id;
  }
  return { likes, reactors, myReactionId };
});
```

Wait — we need access to the logged-in user's pubkey. Let me check how auth is accessed.

- [ ] **Step 3 (revised): Add contentReactionStats with auth access**

Check how auth is accessed in this file. Looking at the codebase, `comment-list-view-model.svelte.ts` imports `getAuth` from `$shared/browser/auth.js`. The comment-view-model doesn't currently need auth. We'll compute `myReactionId` by passing the user's pubkey from the CommentList instead.

Simpler approach: make `contentReactionStats` a function that takes `myPubkey`:

```ts
function buildContentReactionStats(myPubkey: string | null): ContentReactionStats {
  let likes = 0;
  const reactors = new Set<string>();
  let myReactionId: string | null = null;
  for (const cr of contentReactionsRaw) {
    if (deletedIds.has(cr.id)) continue;
    likes++;
    reactors.add(cr.pubkey);
    if (myPubkey && cr.pubkey === myPubkey) myReactionId = cr.id;
  }
  return { likes, reactors, myReactionId };
}
```

Actually, looking at the architecture, the view model is consumed by CommentList which has access to auth. The cleanest approach is to expose `contentReactions` (filtered) and let `comment-list-view-model` compute the stats. But for simplicity, expose a getter that takes myPubkey.

Better yet: expose the raw filtered list and a count. The UI only needs `likes count` and `myReactionId`. Let's keep it simple:

After `contentReactionsRaw`:

```ts
let visibleContentReactions = $derived(contentReactionsRaw.filter((cr) => !deletedIds.has(cr.id)));
```

- [ ] **Step 4: Add handleContentReactionPacket**

After the existing `handleReactionPacket` function, add:

```ts
function handleContentReactionPacket(event: CachedEvent) {
  if (contentReactionIds.has(event.id)) return;
  contentReactionIds.add(event.id);
  eventPubkeys.set(event.id, event.pubkey);
  const cr = contentReactionFromEvent(event);
  contentReactionsRaw = [...contentReactionsRaw, cr];
}
```

- [ ] **Step 5: Add kind:17 to dispatchPacket switch**

In the `dispatchPacket` function, add a case:

```ts
case CONTENT_REACTION_KIND:
  handleContentReactionPacket(event);
  break;
```

- [ ] **Step 6: Add kind:17 to restoreCachedEvents**

In `restoreCachedEvents`, add a category for content reactions. After the REACTION_KIND case in the classification loop:

```ts
case CONTENT_REACTION_KIND:
  cachedContentReactions.push(event);
  break;
```

Declare `const cachedContentReactions: CachedEvent[] = [];` alongside the other arrays.

After the reactions restore loop, add:

```ts
// Restore content reactions
for (const event of cachedContentReactions) {
  if (!contentReactionIds.has(event.id)) {
    contentReactionIds.add(event.id);
    eventPubkeys.set(event.id, event.pubkey);
  }
}
if (cachedContentReactions.length > 0) {
  contentReactionsRaw = [
    ...contentReactionsRaw,
    ...cachedContentReactions.map(contentReactionFromEvent)
  ];
}
```

- [ ] **Step 7: Add kind:17 to addSubscription cache restore**

In the `addSubscription` function, after the REACTION_KIND block in the loop, add:

```ts
if (ev.kind === CONTENT_REACTION_KIND && !contentReactionIds.has(ev.id) && !deletedIds.has(ev.id)) {
  contentReactionIds.add(ev.id);
  eventPubkeys.set(ev.id, ev.pubkey);
  contentReactionsRaw = [...contentReactionsRaw, contentReactionFromEvent(ev)];
}
```

- [ ] **Step 8: Expose in return object**

Add to the return object:

```ts
get contentReactions() {
  return visibleContentReactions;
},
```

- [ ] **Step 9: Run full tests**

Run: `pnpm test 2>&1 | tail -10`
Expected: All PASS

- [ ] **Step 10: Commit**

```bash
git add src/features/comments/ui/comment-view-model.svelte.ts
git commit -m "feat: handle kind:17 content reactions in comment view model"
```

---

### Task 7: CommentTabBar に UI ボタン追加

**Files:**

- Modify: `src/lib/components/CommentTabBar.svelte`
- Modify: `src/lib/components/CommentList.svelte`

- [ ] **Step 1: Add props to CommentTabBar**

In `src/lib/components/CommentTabBar.svelte`, add to the Props interface:

```ts
contentReactionCount: number;
contentReactionMine: boolean;
contentReactionBusy: boolean;
onContentReactionClick: () => void;
```

Add to the destructuring:

```ts
contentReactionCount,
contentReactionMine,
contentReactionBusy,
onContentReactionClick,
```

- [ ] **Step 2: Add heart button to CommentTabBar template**

In the template, before the bookmark button (`{#if loggedIn}`), add:

```svelte
<!-- Content reaction (like) button -->
{#if loggedIn}
  <button
    type="button"
    onclick={onContentReactionClick}
    disabled={contentReactionBusy}
    class="flex items-center gap-1 rounded-lg px-2 py-1 text-sm transition-colors disabled:opacity-50
      {contentReactionMine
      ? 'text-accent hover:bg-accent/10'
      : 'text-text-muted hover:bg-surface-1 hover:text-text-secondary'}"
    aria-label={contentReactionMine ? t('reaction.content.unlike') : t('reaction.content.like')}
  >
    {contentReactionMine ? '\u2665' : '\u2661'}
    {#if contentReactionCount > 0}
      <span class="text-xs">{contentReactionCount}</span>
    {/if}
  </button>
{/if}
```

- [ ] **Step 3: Wire CommentList to pass content reaction props**

In `src/lib/components/CommentList.svelte`, add to Props:

```ts
contentReactions?: ContentReaction[];
onContentReactionClick?: () => void;
contentReactionBusy?: boolean;
```

Add import:

```ts
import type { ContentReaction } from '$features/comments/domain/comment-model.js';
```

Add to destructuring:

```ts
contentReactions = [],
onContentReactionClick,
contentReactionBusy = false,
```

Add derived state for the button:

```ts
import { getAuth } from '$shared/browser/auth.js';
const auth = getAuth();

let contentReactionCount = $derived(contentReactions.length);
let contentReactionMine = $derived(
  auth.pubkey ? contentReactions.some((cr) => cr.pubkey === auth.pubkey) : false
);
```

Pass to CommentTabBar:

```svelte
<CommentTabBar
  ...existing
  props...
  {contentReactionCount}
  {contentReactionMine}
  {contentReactionBusy}
  onContentReactionClick={() => onContentReactionClick?.()}
/>
```

- [ ] **Step 4: Wire the content page to pass content reactions**

In `src/web/routes/[platform]/[type]/[id]/+page.svelte`, pass `contentReactions` and handler to CommentList. The page already has access to `vm.store`. Add:

```svelte
<CommentList
  ...existing
  props...
  contentReactions={vm.store.contentReactions}
  onContentReactionClick={handleContentReactionClick}
  {contentReactionBusy}
/>
```

Add the handler and state:

```ts
import {
  deleteContentReaction,
  sendContentReaction
} from '$features/comments/application/comment-actions.js';

let contentReactionBusy = $state(false);

async function handleContentReactionClick() {
  if (contentReactionBusy || !auth.loggedIn) return;
  contentReactionBusy = true;
  try {
    const myReaction = vm.store.contentReactions.find((cr) => cr.pubkey === auth.pubkey);
    if (myReaction) {
      await deleteContentReaction({
        reactionId: myReaction.id,
        contentId,
        provider
      });
    } else {
      await sendContentReaction({ contentId, provider });
    }
  } catch (err) {
    log.error('Content reaction failed', err);
  } finally {
    contentReactionBusy = false;
  }
}
```

- [ ] **Step 5: Run full validation**

Run: `pnpm format && pnpm lint && pnpm check && pnpm test 2>&1 | tail -10`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/CommentTabBar.svelte src/lib/components/CommentList.svelte src/web/routes/\[platform\]/\[type\]/\[id\]/+page.svelte
git commit -m "feat: add content reaction heart button to CommentTabBar

Closes #207"
```

---

### Task 8: i18n キー追加

**Files:**

- Modify: `src/shared/i18n/en.json` (and other locale files)

- [ ] **Step 1: Add i18n keys**

Add to each locale file:

English (`en.json`):

```json
"reaction.content.like": "Like this content",
"reaction.content.unlike": "Unlike this content"
```

Japanese (`ja.json`):

```json
"reaction.content.like": "このコンテンツにいいね",
"reaction.content.unlike": "いいねを取り消す"
```

Add corresponding keys to all other locale files (`zh_cn.json`, `pt_br.json`, etc.) with English fallback values.

- [ ] **Step 2: Commit**

```bash
git add src/shared/i18n/
git commit -m "feat: add i18n keys for content reaction button"
```

---

### Task 9: CLAUDE.md 更新

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Add kind:17 to Nostr Layer section**

In the `### Nostr Layer` section, after the line about `events.ts`, add mention of kind:17:

```
- `src/shared/nostr/events.ts`: Event builders for kind:1111 (comment), kind:7 (reaction), and kind:17 (content reaction)
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add kind:17 content reaction to CLAUDE.md"
```

---

### Task 10: Final validation

- [ ] **Step 1: Run full pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e
```

Expected: All pass

- [ ] **Step 2: Fix any failures**

If tests fail, fix and re-run.
