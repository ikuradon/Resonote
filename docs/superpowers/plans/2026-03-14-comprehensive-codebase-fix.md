# Comprehensive Codebase Fix — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all verified source bugs, a11y violations, E2E fragile selectors, CI/CD gaps, documentation inaccuracies, and add test coverage for untested store/nostr layers.

**Architecture:** Targeted fixes to existing files plus new test files for untested modules. No new abstractions. Each task is independent and committable separately.

**Tech Stack:** SvelteKit, Svelte 5 runes, Playwright, Vitest, GitHub Actions, pnpm

**Pre-commit validation (MUST run before every commit):**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

---

## Verified Issues Summary

### False positives excluded from this plan:

- **Extension listener "leak"**: `initExtensionListener()` is called once in `+layout.svelte` — the listener intentionally persists for the SPA's lifetime.
- **follows.svelte.ts race condition**: The generation counter pattern (`if (gen !== generation) return;`) after each `await` is the correct cancellation pattern.
- **castSigned resolve/reject**: RxJS guarantees `error` and `complete` are mutually exclusive; the `resolved` flag prevents double-resolve correctly.
- **popoverIds unbounded Map**: Scoped to `CommentList.svelte` component instance, destroyed on unmount.
- **profile.svelte.ts JSON.parse**: Already does per-field `typeof` validation at lines 30-33.
- **CI permissions**: Top-level `permissions: contents: read` at line 10-11 already applies to all jobs; deploy jobs correctly add `deployments: write`.

---

## Chunk 1: Source Code Fixes

### Task 1: Guard `ref.split(':')` in emoji-sets.svelte.ts

`const [, refPubkey, dTag] = ref.split(':')` at lines 119 and 197 assumes the ref always has 3+ parts. A malformed ref (e.g., `30030:pubkey` with no dTag) would pass `undefined` to `getByReplaceKey()` and `'#d': [dTag]` filter.

**Files:**

- Modify: `src/lib/stores/emoji-sets.svelte.ts:118-121,195-198`

- [ ] **Step 1: Add bounds guard at line 119 (DB restore path)**

In `src/lib/stores/emoji-sets.svelte.ts`, replace:

```typescript
setRefs.map(async (ref) => {
  const [, refPubkey, dTag] = ref.split(':');
  const cached = await eventsDB.getByReplaceKey(refPubkey, 30030, dTag);
  return cached ? buildCategoryFromEvent(cached) : null;
});
```

with:

```typescript
setRefs.map(async (ref) => {
  const parts = ref.split(':');
  if (parts.length < 3 || !parts[1] || !parts[2]) return null;
  const cached = await eventsDB.getByReplaceKey(parts[1], 30030, parts[2]);
  return cached ? buildCategoryFromEvent(cached) : null;
});
```

- [ ] **Step 2: Add same guard at line 197 (relay fetch path)**

Replace:

```typescript
const filters = batch.map((ref) => {
  const [, refPubkey, dTag] = ref.split(':');
  return { kinds: [30030 as number], authors: [refPubkey], '#d': [dTag] };
});
```

with:

```typescript
const filters = batch
  .map((ref) => {
    const parts = ref.split(':');
    if (parts.length < 3 || !parts[1] || !parts[2]) return null;
    return { kinds: [30030 as number], authors: [parts[1]], '#d': [parts[2]] };
  })
  .filter((f): f is NonNullable<typeof f> => f !== null);
```

- [ ] **Step 3: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/stores/emoji-sets.svelte.ts
git commit -m "Guard ref.split(':') against malformed emoji set refs in emoji-sets store"
```

---

### Task 2: Add CustomEvent type parameter in auth.svelte.ts

Line 75 uses `(e as CustomEvent).detail` without a type parameter, providing no type-safety for the `detail` shape.

**Files:**

- Modify: `src/lib/stores/auth.svelte.ts:74-75`

- [ ] **Step 1: Add type parameter**

Replace:

```typescript
  document.addEventListener('nlAuth', (e: Event) => {
    const detail = (e as CustomEvent).detail;
```

with:

```typescript
  document.addEventListener('nlAuth', (e: Event) => {
    const detail = (e as CustomEvent<{ type: string }>).detail;
```

- [ ] **Step 2: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/auth.svelte.ts
git commit -m "Add CustomEvent type parameter for nlAuth event detail"
```

---

### Task 3: Fix `<a href="#">` a11y violations on content page

Lines 62-63, 68-69, 128-129, 134-135 in `+page.svelte` use `<a href="#">` for extension install links that aren't real links. These should be `<button>` elements since they currently have no destination.

**Files:**

- Modify: `src/web/routes/[platform]/[type]/[id]/+page.svelte:62-73,128-139`

- [ ] **Step 1: Fix first install prompt block (lines 62-73)**

Replace the two `<a href="#">` elements in the first `showInstallPrompt` block (lines 62-73) with `<button>` elements:

```svelte
<div class="flex gap-3">
  <button
    type="button"
    class="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-surface-0 transition-colors hover:bg-accent-hover"
  >
    {t('content.install_chrome')}
  </button>
  <button
    type="button"
    class="rounded-xl border border-accent px-5 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent-muted"
  >
    {t('content.install_firefox')}
  </button>
</div>
```

- [ ] **Step 2: Fix second install prompt block (lines 128-139)**

Same replacement for the duplicate block inside the two-column layout.

- [ ] **Step 3: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 4: Run E2E tests**

```bash
pnpm test:e2e
```

- [ ] **Step 5: Commit**

```bash
git add src/web/routes/\[platform\]/\[type\]/\[id\]/+page.svelte
git commit -m "Replace href='#' anchors with button elements for a11y compliance"
```

---

## Chunk 2: E2E Test Fixes

### Task 4: Fix remaining fragile selectors in E2E tests

**`resilience.test.ts:45`** still uses `input[placeholder="Paste a Spotify or YouTube URL..."]` instead of `data-testid`.

**`responsive.test.ts:30,37`** use `text=Login to post comments` and `text=Paste an episode URL to view comments` which break on i18n changes.

**`content-page.test.ts:20,69,80,90,110`** also uses fragile text/placeholder selectors that should be replaced with `data-testid`.

**Files:**

- Modify: `e2e/resilience.test.ts:44-45`
- Modify: `e2e/responsive.test.ts:30,37`
- Modify: `e2e/content-page.test.ts:20,69,80,90,110`
- Modify: `src/lib/components/CommentForm.svelte:151` (add `data-testid="comment-login-prompt"`)
- Modify: `src/web/routes/[platform]/[type]/[id]/+page.svelte:103` (add `data-testid="show-paste-hint"`)

- [ ] **Step 1: Fix `resilience.test.ts` line 45**

Replace:

```typescript
await page
  .locator('input[placeholder="Paste a Spotify or YouTube URL..."]')
  .fill('https://open.spotify.com/episode/4C6zDr6e86HYqLxPAhO8jA');
```

with:

```typescript
await page
  .locator('[data-testid="track-url-input"]')
  .fill('https://open.spotify.com/episode/4C6zDr6e86HYqLxPAhO8jA');
```

- [ ] **Step 2: Add `data-testid` to comment login prompt**

In `src/lib/components/CommentForm.svelte` line 151, replace:

```svelte
<div class="rounded-xl border border-dashed border-border py-4 text-center">
  <p class="text-sm text-text-muted">{t('comment.login_prompt')}</p>
</div>
```

with:

```svelte
<div
  class="rounded-xl border border-dashed border-border py-4 text-center"
  data-testid="comment-login-prompt"
>
  <p class="text-sm text-text-muted">{t('comment.login_prompt')}</p>
</div>
```

- [ ] **Step 3: Add `data-testid` to show page paste hint**

In `src/web/routes/[platform]/[type]/[id]/+page.svelte` line 103, add `data-testid="show-paste-hint"` to the `<p>` element:

```svelte
<p class="text-sm text-text-muted" data-testid="show-paste-hint">{t('show.paste_episode')}</p>
```

- [ ] **Step 4: Fix `responsive.test.ts` fragile text selectors**

Replace line 30:

```typescript
await expect(page.locator('text=Login to post comments')).toBeVisible();
```

with:

```typescript
await expect(page.locator('[data-testid="comment-login-prompt"]')).toBeVisible();
```

Replace line 37:

```typescript
await expect(page.locator('text=Paste an episode URL to view comments')).toBeVisible();
```

with:

```typescript
await expect(page.locator('[data-testid="show-paste-hint"]')).toBeVisible();
```

- [ ] **Step 5: Fix `content-page.test.ts` fragile selectors**

Replace all `text=Login to post comments` (lines 20, 90, 110) with `[data-testid="comment-login-prompt"]`.

Replace line 69 `a:has-text("View all episodes on Spotify")` with `[data-testid="show-episodes-link"]` (data-testid already exists on that element).

Replace line 80 `text=Paste an episode URL to view comments` with `[data-testid="show-paste-hint"]`.

**Known limitation:** Lines 25 and 91 use `input[placeholder="Write a comment..."]` which doesn't match any actual placeholder in the app (actual: "Comment on this moment..." / "Share your thoughts..."). These are negative assertions (`.toHaveCount(0)`) that pass vacuously. Leave as-is for now — they test that no comment input exists, which is still the correct intent even if the selector is imprecise.

- [ ] **Step 6: Run E2E tests**

```bash
pnpm test:e2e
```

Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
git add e2e/resilience.test.ts e2e/responsive.test.ts e2e/content-page.test.ts src/lib/components/CommentForm.svelte src/web/routes/\[platform\]/\[type\]/\[id\]/+page.svelte
git commit -m "Replace remaining fragile selectors with data-testid in E2E tests"
```

---

## Chunk 3: CI/CD Improvements

### Task 5: Add `setup-node` to `publish-extension` job

The `publish-extension` job (ci.yml:227-260) uses `npx` commands but lacks a `setup-node` step, relying on whatever Node is on the runner.

**Files:**

- Modify: `.github/workflows/ci.yml:236`

- [ ] **Step 1: Add setup-node step after download-artifact**

Insert after the `actions/download-artifact@v7` step (after line 239):

```yaml
- uses: actions/setup-node@v6
  with:
    node-version: 22
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "Add setup-node to publish-extension job for consistent Node version"
```

---

### Task 6: Add `retention-days` to CI artifacts and `engines.node` to package.json

**Files:**

- Modify: `.github/workflows/ci.yml:81-84,121-126,149-153`
- Modify: `package.json`

- [ ] **Step 1: Add `retention-days: 7` to artifact uploads**

Add `retention-days: 7` to the `upload-artifact` steps for coverage (line 81), playwright-report (line 122), and extension artifacts (line 150).

Example for coverage:

```yaml
- name: Upload coverage
  if: always()
  uses: actions/upload-artifact@v7
  with:
    name: coverage
    path: coverage/
    retention-days: 7
```

- [ ] **Step 2: Change coverage upload condition from `always()` to `success()`**

At line 80, replace:

```yaml
if: always()
```

with:

```yaml
if: success()
```

- [ ] **Step 3: Add `engines.node` to package.json**

Add after line 5 (`"type": "module"`):

```json
  "engines": {
    "node": ">=22.0.0"
  },
```

- [ ] **Step 4: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml package.json
git commit -m "Add artifact retention-days, fix coverage upload condition, add engines.node"
```

---

## Chunk 4: Documentation Fix

### Task 7: Update CLAUDE.md project description

Line 3 says "Spotify iFrame API + Nostr" which is misleading since the app supports 11 platforms (Spotify, YouTube, Netflix, Prime Video, Disney+, Apple Music, SoundCloud, Fountain.fm, AbemaTV, TVer, U-NEXT).

**Files:**

- Modify: `CLAUDE.md:3`

- [ ] **Step 1: Update description**

Replace:

```markdown
Spotify iFrame API + Nostr プロトコルを使った音楽コメント同期システム。
```

with:

```markdown
Nostr プロトコルを使ったメディアコメント同期システム（Spotify, YouTube, Netflix 等 11 プラットフォーム対応）。
```

- [ ] **Step 2: Run format check**

```bash
pnpm format:check
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Update CLAUDE.md description to reflect multi-platform support"
```

---

## Chunk 5: Test Coverage — Pure Logic Functions

Add tests for untested pure-logic functions that don't require mocking Nostr/RxJS.

### Task 8: Test `profile-utils.ts`

**Files:**

- Create: `src/lib/stores/profile-utils.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { truncate, formatDisplayName, MAX_NAME_LENGTH } from './profile-utils.js';

describe('truncate', () => {
  it('should return short strings unchanged', () => {
    expect(truncate('hello')).toBe('hello');
  });

  it('should truncate strings exceeding MAX_NAME_LENGTH', () => {
    const long = 'a'.repeat(MAX_NAME_LENGTH + 5);
    const result = truncate(long);
    expect(result).toHaveLength(MAX_NAME_LENGTH + 1); // +1 for …
    expect(result.endsWith('…')).toBe(true);
  });

  it('should return exact-length strings unchanged', () => {
    const exact = 'a'.repeat(MAX_NAME_LENGTH);
    expect(truncate(exact)).toBe(exact);
  });
});

describe('formatDisplayName', () => {
  it('should use displayName when available', () => {
    expect(formatDisplayName('abc', { displayName: 'Alice' })).toBe('Alice');
  });

  it('should fall back to name', () => {
    expect(formatDisplayName('abc', { name: 'alice_n' })).toBe('alice_n');
  });

  it('should use npub format for unknown profiles', () => {
    const pk = 'a'.repeat(64);
    const result = formatDisplayName(pk, undefined);
    expect(result).toMatch(/^npub1.+\.\.\..+$/);
  });

  it('should use npub format for empty profiles', () => {
    const pk = 'a'.repeat(64);
    const result = formatDisplayName(pk, {});
    expect(result).toMatch(/^npub1.+\.\.\..+$/);
  });

  it('should prefer displayName over name', () => {
    expect(formatDisplayName('abc', { displayName: 'Display', name: 'name' })).toBe('Display');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test -- src/lib/stores/profile-utils.test.ts
```

Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/profile-utils.test.ts
git commit -m "Add unit tests for profile-utils (truncate, formatDisplayName)"
```

---

### Task 9: Test `comments.svelte.ts` pure functions

The `emptyStats`, `buildReactionIndex`, and `applyReaction` functions contain important logic. `emptyStats` is already exported. `buildReactionIndex` and `applyReaction` are module-level but not exported — export them for testing.

**Files:**

- Modify: `src/lib/stores/comments.svelte.ts:44-45,61`
- Create: `src/lib/stores/comments.test.ts`

- [ ] **Step 1: Export `applyReaction` and `buildReactionIndex`**

In `src/lib/stores/comments.svelte.ts`, add `export` to both functions:

At line 45, change:

```typescript
function applyReaction(stats: ReactionStats, r: Reaction): void {
```

to:

```typescript
export function applyReaction(stats: ReactionStats, r: Reaction): void {
```

At line 61, change:

```typescript
function buildReactionIndex(
```

to:

```typescript
export function buildReactionIndex(
```

- [ ] **Step 2: Write tests**

Create `src/lib/stores/comments.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { emptyStats, applyReaction, buildReactionIndex, type Reaction } from './comments.svelte.js';

describe('emptyStats', () => {
  it('should return zeroed stats with empty reactors set', () => {
    const s = emptyStats();
    expect(s.likes).toBe(0);
    expect(s.emojis).toEqual([]);
    expect(s.reactors.size).toBe(0);
  });
});

describe('applyReaction', () => {
  it('should count + as a like', () => {
    const stats = emptyStats();
    applyReaction(stats, {
      id: 'r1',
      pubkey: 'pk1',
      content: '+',
      targetEventId: 'e1'
    });
    expect(stats.likes).toBe(1);
    expect(stats.reactors.has('pk1')).toBe(true);
  });

  it('should count empty string as a like', () => {
    const stats = emptyStats();
    applyReaction(stats, {
      id: 'r1',
      pubkey: 'pk1',
      content: '',
      targetEventId: 'e1'
    });
    expect(stats.likes).toBe(1);
  });

  it('should add custom emoji reaction', () => {
    const stats = emptyStats();
    applyReaction(stats, {
      id: 'r1',
      pubkey: 'pk1',
      content: ':fire:',
      targetEventId: 'e1',
      emojiUrl: 'https://example.com/fire.png'
    });
    expect(stats.likes).toBe(0);
    expect(stats.emojis).toHaveLength(1);
    expect(stats.emojis[0]).toEqual({
      content: ':fire:',
      url: 'https://example.com/fire.png',
      count: 1
    });
  });

  it('should increment count for duplicate emoji reactions', () => {
    const stats = emptyStats();
    const base = {
      targetEventId: 'e1',
      content: ':fire:',
      emojiUrl: 'https://example.com/fire.png'
    };
    applyReaction(stats, { id: 'r1', pubkey: 'pk1', ...base });
    applyReaction(stats, { id: 'r2', pubkey: 'pk2', ...base });
    expect(stats.emojis[0].count).toBe(2);
  });

  it('should handle non-shortcode text reactions', () => {
    const stats = emptyStats();
    applyReaction(stats, {
      id: 'r1',
      pubkey: 'pk1',
      content: '🔥',
      targetEventId: 'e1'
    });
    expect(stats.emojis).toHaveLength(1);
    expect(stats.emojis[0]).toEqual({ content: '🔥', url: undefined, count: 1 });
  });
});

describe('buildReactionIndex', () => {
  const reactions: Reaction[] = [
    { id: 'r1', pubkey: 'pk1', content: '+', targetEventId: 'e1' },
    { id: 'r2', pubkey: 'pk2', content: '+', targetEventId: 'e1' },
    { id: 'r3', pubkey: 'pk3', content: '+', targetEventId: 'e2' },
    {
      id: 'r4',
      pubkey: 'pk4',
      content: ':fire:',
      targetEventId: 'e1',
      emojiUrl: 'https://example.com/fire.png'
    }
  ];

  it('should group reactions by target event', () => {
    const index = buildReactionIndex(reactions, new Set());
    expect(index.get('e1')?.likes).toBe(2);
    expect(index.get('e2')?.likes).toBe(1);
  });

  it('should exclude deleted reactions', () => {
    const index = buildReactionIndex(reactions, new Set(['r1']));
    expect(index.get('e1')?.likes).toBe(1);
  });

  it('should sort emojis by count descending', () => {
    const moreReactions: Reaction[] = [
      { id: 'r5', pubkey: 'pk5', content: ':heart:', targetEventId: 'e1', emojiUrl: 'h' },
      { id: 'r6', pubkey: 'pk6', content: ':heart:', targetEventId: 'e1', emojiUrl: 'h' },
      ...reactions
    ];
    const index = buildReactionIndex(moreReactions, new Set());
    const emojis = index.get('e1')!.emojis;
    expect(emojis[0].count).toBeGreaterThanOrEqual(emojis[1]?.count ?? 0);
  });

  it('should return empty map for no reactions', () => {
    const index = buildReactionIndex([], new Set());
    expect(index.size).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm test -- src/lib/stores/comments.test.ts
```

Expected: All PASS.

- [ ] **Step 4: Run full pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/comments.svelte.ts src/lib/stores/comments.test.ts
git commit -m "Add unit tests for comment reaction logic (applyReaction, buildReactionIndex)"
```

---

### Task 10: Test `follows.svelte.ts` exported functions

`matchesFilter` and `extractFollows` are testable. `extractFollows` is not exported — export it for testing.

**Files:**

- Modify: `src/lib/stores/follows.svelte.ts:69`
- Create: `src/lib/stores/follows.test.ts`

- [ ] **Step 1: Export `extractFollows`**

Change line 69:

```typescript
function extractFollows(event: { tags: string[][] }): Set<string> {
```

to:

```typescript
export function extractFollows(event: { tags: string[][] }): Set<string> {
```

- [ ] **Step 2: Write tests**

Create `src/lib/stores/follows.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractFollows, matchesFilter } from './follows.svelte.js';

describe('extractFollows', () => {
  it('should extract pubkeys from p tags', () => {
    const result = extractFollows({
      tags: [
        ['p', 'pk1'],
        ['p', 'pk2'],
        ['e', 'something']
      ]
    });
    expect(result).toEqual(new Set(['pk1', 'pk2']));
  });

  it('should deduplicate pubkeys', () => {
    const result = extractFollows({
      tags: [
        ['p', 'pk1'],
        ['p', 'pk1']
      ]
    });
    expect(result.size).toBe(1);
  });

  it('should skip p tags without value', () => {
    const result = extractFollows({
      tags: [['p']]
    });
    expect(result.size).toBe(0);
  });

  it('should return empty set for no tags', () => {
    expect(extractFollows({ tags: [] }).size).toBe(0);
  });
});

describe('matchesFilter', () => {
  it('should pass all pubkeys for "all" filter', () => {
    expect(matchesFilter('random', 'all', null)).toBe(true);
  });

  it('should always pass own pubkey regardless of filter', () => {
    expect(matchesFilter('me', 'follows', 'me')).toBe(true);
    expect(matchesFilter('me', 'wot', 'me')).toBe(true);
  });

  it('should return true for "all" even without myPubkey', () => {
    expect(matchesFilter('anyone', 'all', null)).toBe(true);
  });

  it('should reject unknown pubkeys for "follows" filter', () => {
    // Module state starts with empty follows/wot Sets, so unknown pubkeys are rejected
    expect(matchesFilter('unknown', 'follows', null)).toBe(false);
  });

  it('should reject unknown pubkeys for "wot" filter', () => {
    expect(matchesFilter('unknown', 'wot', null)).toBe(false);
  });
});
```

**Note:** `matchesFilter` for `'follows'`/`'wot'` depends on module-level `$state` (populated by `loadFollows`). Only the initial empty-state behavior can be tested without complex mocking. Full integration tests would require populating the store via mocked rx-nostr subscriptions.

- [ ] **Step 3: Run tests**

```bash
pnpm test -- src/lib/stores/follows.test.ts
```

- [ ] **Step 4: Run full pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/follows.svelte.ts src/lib/stores/follows.test.ts
git commit -m "Add unit tests for follows store (extractFollows, matchesFilter)"
```

---

## Chunk 6: Test Coverage — Nostr Layer

### ~~Test `events.ts` additional functions~~ — SKIPPED

`events.test.ts` already has comprehensive tests for `extractHashtags` (6 cases), `buildDeletion` (5 cases), `buildShare` (4 cases), and `extractDeletionTargets` (3 cases). No additional coverage needed.

---

### Task 11: Test `user-relays.ts`

This module has 0% coverage. Test `applyUserRelays` and `resetToDefaultRelays` by mocking rx-nostr.

**Files:**

- Create: `src/lib/nostr/user-relays.test.ts`

- [ ] **Step 1: Write tests with mocked rx-nostr**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSetDefaultRelays = vi.fn();
let subscribeFn: (observer: {
  next?: (packet: unknown) => void;
  complete?: () => void;
  error?: (err: unknown) => void;
}) => { unsubscribe: () => void };

vi.mock('rx-nostr', () => ({
  createRxBackwardReq: () => ({
    emit: vi.fn(),
    over: vi.fn()
  })
}));

vi.mock('./client.js', () => ({
  getRxNostr: vi.fn().mockResolvedValue({
    use: () => ({
      subscribe: (observer: {
        next?: (p: unknown) => void;
        complete?: () => void;
        error?: (e: unknown) => void;
      }) => subscribeFn(observer)
    }),
    setDefaultRelays: mockSetDefaultRelays
  })
}));

vi.mock('./relays.js', () => ({
  DEFAULT_RELAYS: ['wss://relay1.example.com', 'wss://relay2.example.com']
}));

describe('user-relays', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('should fall back to default relays when no relay list found', async () => {
    subscribeFn = (observer) => {
      // Simulate immediate completion with no events
      queueMicrotask(() => observer.complete?.());
      return { unsubscribe: vi.fn() };
    };

    const { applyUserRelays } = await import('./user-relays.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://relay1.example.com', 'wss://relay2.example.com']);
  });

  it('should apply user relays when kind:10002 event found', async () => {
    subscribeFn = (observer) => {
      observer.next?.({
        event: {
          tags: [
            ['r', 'wss://user-relay1.example.com'],
            ['r', 'wss://user-relay2.example.com']
          ]
        }
      });
      queueMicrotask(() => observer.complete?.());
      return { unsubscribe: vi.fn() };
    };

    const { applyUserRelays } = await import('./user-relays.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://user-relay1.example.com', 'wss://user-relay2.example.com']);
    expect(mockSetDefaultRelays).toHaveBeenCalledWith([
      'wss://user-relay1.example.com',
      'wss://user-relay2.example.com'
    ]);
  });

  it('should fall back to defaults on error', async () => {
    subscribeFn = (observer) => {
      queueMicrotask(() => observer.error?.(new Error('network')));
      return { unsubscribe: vi.fn() };
    };

    const { applyUserRelays } = await import('./user-relays.js');
    const result = await applyUserRelays('deadbeef'.repeat(8));
    expect(result).toEqual(['wss://relay1.example.com', 'wss://relay2.example.com']);
  });

  it('resetToDefaultRelays should call setDefaultRelays with defaults', async () => {
    subscribeFn = (observer) => {
      queueMicrotask(() => observer.complete?.());
      return { unsubscribe: vi.fn() };
    };

    const { resetToDefaultRelays } = await import('./user-relays.js');
    await resetToDefaultRelays();
    expect(mockSetDefaultRelays).toHaveBeenCalledWith([
      'wss://relay1.example.com',
      'wss://relay2.example.com'
    ]);
  });
});
```

Note: rx-nostr's `use(req)` returns an Observable; the mock simulates this with a synchronous `subscribe(observer)` pattern. `vi.resetModules()` in `beforeEach` ensures each test gets a fresh module instance. If the mock shape doesn't match, adjust to use an actual RxJS Observable wrapper.

- [ ] **Step 2: Run tests and iterate on mock setup**

```bash
pnpm test -- src/lib/nostr/user-relays.test.ts
```

If tests fail due to mock shape issues, adjust the mock to match rx-nostr's actual observable API.

- [ ] **Step 3: Run full pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/nostr/user-relays.test.ts
git commit -m "Add unit tests for user-relays (applyUserRelays, resetToDefaultRelays)"
```

---

## Final Validation

### Task 12: Run complete validation suite

- [ ] **Step 1: Pre-commit checks**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 2: E2E tests**

```bash
pnpm test:e2e
```

- [ ] **Step 3: Extension build**

```bash
pnpm build:ext:chrome && pnpm build:ext:firefox
```

All three must pass.
