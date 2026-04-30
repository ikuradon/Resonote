# Release Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 issues (H-2, H-3, M-1, M-3~M-7) found during pre-release code review.

**Architecture:** Server-side security hardening (error handler, URL validation), NIP-73 tag compliance fix, CSS injection prevention, architecture dependency direction cleanup (facade + component relocation).

**Tech Stack:** SvelteKit, Hono, TypeScript, Vitest

---

### Task 1: H-3 — Error handler safe message mapping

**Files:**

- Modify: `src/server/api/middleware/error-handler.ts`
- Create: `src/server/api/middleware/error-handler.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/api/middleware/error-handler.test.ts
import { describe, expect, it, vi } from 'vitest';

import { errorHandler } from '$server/api/middleware/error-handler.js';

function fakeContext(): { json: ReturnType<typeof vi.fn> } {
  return { json: vi.fn((_body, _status) => new Response()) };
}

describe('errorHandler', () => {
  it('should return safe message for HTTPException', async () => {
    const { HTTPException } = await import('hono/http-exception');
    const c = fakeContext();
    errorHandler(new HTTPException(400, { message: 'internal detail leak' }), c as never);
    expect(c.json).toHaveBeenCalledWith({ error: 'Bad Request' }, 400);
  });

  it('should return safe message for 404 HTTPException', async () => {
    const { HTTPException } = await import('hono/http-exception');
    const c = fakeContext();
    errorHandler(new HTTPException(404, { message: '/secret/path' }), c as never);
    expect(c.json).toHaveBeenCalledWith({ error: 'Not Found' }, 404);
  });

  it('should return safe message for 429 HTTPException', async () => {
    const { HTTPException } = await import('hono/http-exception');
    const c = fakeContext();
    errorHandler(new HTTPException(429, { message: 'rate limit' }), c as never);
    expect(c.json).toHaveBeenCalledWith({ error: 'Too Many Requests' }, 429);
  });

  it('should fallback to Internal Server Error for unknown status', async () => {
    const { HTTPException } = await import('hono/http-exception');
    const c = fakeContext();
    errorHandler(new HTTPException(418, { message: 'teapot' }), c as never);
    expect(c.json).toHaveBeenCalledWith({ error: 'Internal Server Error' }, 418);
  });

  it('should return 500 for non-HTTPException errors', () => {
    const c = fakeContext();
    errorHandler(new Error('unexpected'), c as never);
    expect(c.json).toHaveBeenCalledWith({ error: 'Internal Server Error' }, 500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/api/middleware/error-handler.test.ts`
Expected: FAIL — current implementation returns raw `err.message`

- [ ] **Step 3: Implement safe message mapping**

Replace `src/server/api/middleware/error-handler.ts`:

```typescript
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

const SAFE_MESSAGES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  429: 'Too Many Requests'
};

export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof HTTPException) {
    return c.json({ error: SAFE_MESSAGES[err.status] ?? 'Internal Server Error' }, err.status);
  }
  console.error('Unhandled API error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/api/middleware/error-handler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/api/middleware/error-handler.ts src/server/api/middleware/error-handler.test.ts
git commit -m "fix: sanitize HTTPException messages in error handler (H-3)"
```

---

### Task 2: M-1 — Audio toNostrTag use contentId.type

**Files:**

- Modify: `src/shared/content/audio.ts:27-35`
- Modify: `src/shared/content/audio.test.ts:100-113`

- [ ] **Step 1: Update test expectations first**

In `src/shared/content/audio.test.ts`, update the `toNostrTag` and `contentKind` tests:

```typescript
describe('toNostrTag', () => {
  it('should return [audio:track:<url>, <url>] format', () => {
    const url = 'https://example.com/episode.mp3';
    const contentId = { platform: 'audio', type: 'track', id: toBase64url(url) };
    const tag = provider.toNostrTag(contentId);
    expect(tag).toEqual([`audio:track:${url}`, url]);
  });
});

describe('contentKind', () => {
  it('should return "audio:track" using contentId.type', () => {
    const contentId = { platform: 'audio', type: 'track', id: 'dummy' };
    expect(provider.contentKind(contentId)).toBe('audio:track');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/content/audio.test.ts`
Expected: FAIL — `toNostrTag` returns `audio:<url>` not `audio:track:<url>`

- [ ] **Step 3: Update audio.ts implementation**

In `src/shared/content/audio.ts`, modify `toNostrTag` and `contentKind`:

```typescript
  toNostrTag(contentId: ContentId): [string, string] {
    const decodedUrl = fromBase64url(contentId.id);
    if (decodedUrl === null) throw new Error(`Failed to decode audio URL from id: ${contentId.id}`);
    return [`audio:${contentId.type}:${decodedUrl}`, decodedUrl];
  }

  contentKind(contentId?: ContentId): string {
    return `audio:${contentId?.type ?? 'track'}`;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/shared/content/audio.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/content/audio.ts src/shared/content/audio.test.ts
git commit -m "fix: audio toNostrTag/contentKind use contentId.type (M-1)"
```

---

### Task 3: M-3 — SoundCloud API client URL validation

**Files:**

- Modify: `src/features/content-resolution/infra/soundcloud-api-client.ts:10-14`
- Modify: `src/features/content-resolution/infra/soundcloud-api-client.test.ts`

- [ ] **Step 1: Add failing test for invalid URL**

Append to `soundcloud-api-client.test.ts`, inside the describe block:

```typescript
it('should reject a non-SoundCloud URL', async () => {
  await expect(resolveSoundCloudEmbed('https://evil.com/track')).rejects.toThrow(
    'Invalid SoundCloud URL'
  );
});

it('should reject a non-https URL', async () => {
  await expect(resolveSoundCloudEmbed('http://soundcloud.com/artist/track')).rejects.toThrow(
    'Invalid SoundCloud URL'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/content-resolution/infra/soundcloud-api-client.test.ts`
Expected: FAIL — no validation, fetch is called

- [ ] **Step 3: Add URL validation**

In `soundcloud-api-client.ts`, add validation at the top of the function:

```typescript
export async function resolveSoundCloudEmbed(trackUrl: string): Promise<string> {
  if (!trackUrl.startsWith('https://soundcloud.com/')) {
    throw new Error('Invalid SoundCloud URL');
  }

  const res = await fetch(
    `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(trackUrl)}`
  );
  if (!res.ok) throw new Error(`oEmbed ${res.status}`);

  const data = (await res.json()) as SoundCloudOEmbedResult;
  const match = data.html?.match(/src="([^"]+)"/);
  if (match?.[1]) return match[1];

  throw new Error('No iframe src in oEmbed response');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/features/content-resolution/infra/soundcloud-api-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/content-resolution/infra/soundcloud-api-client.ts src/features/content-resolution/infra/soundcloud-api-client.test.ts
git commit -m "fix: validate SoundCloud URL before oEmbed fetch (M-3)"
```

---

### Task 4: M-4 — CSS selector injection prevention

**Files:**

- Modify: `src/lib/components/CommentList.svelte:185`

- [ ] **Step 1: Apply CSS.escape to the selector**

In `src/lib/components/CommentList.svelte` line 185, change:

```typescript
const el = document.querySelector(`[data-comment-id="${highlightCommentId}"]`);
```

to:

```typescript
const el = document.querySelector(`[data-comment-id="${CSS.escape(highlightCommentId)}"]`);
```

- [ ] **Step 2: Run existing tests**

Run: `pnpm vitest run`
Expected: PASS (no regression)

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/CommentList.svelte
git commit -m "fix: escape CSS selector in comment highlight (M-4)"
```

---

### Task 5: M-5 — nip05.ts browser-only annotation

**Files:**

- Modify: `src/shared/nostr/nip05.ts:48`

- [ ] **Step 1: Add JSDoc annotation**

Above the `fetchNip05` function (line 48), update/add the JSDoc:

```typescript
/**
 * Verify a NIP-05 identifier against a pubkey.
 * @remarks Browser-only — uses browser fetch directly with `isUnsafeDomain` guard.
 * Do not call from server-side code; use `safeFetch` for server contexts.
 */
async function fetchNip05(nip05: string, pubkey: string): Promise<Nip05Result> {
```

- [ ] **Step 2: Run lint to verify**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/shared/nostr/nip05.ts
git commit -m "docs: annotate nip05 fetchNip05 as browser-only (M-5)"
```

---

### Task 6: M-6 — Extract comment VM facade to shared/browser

**Files:**

- Create: `src/shared/browser/comments.ts`
- Modify: `src/features/content-resolution/ui/resolved-content-view-model.svelte.ts:10-11,24`

- [ ] **Step 1: Create facade file**

Create `src/shared/browser/comments.ts`:

```typescript
// Re-export facade — provides comment VM creation without cross-feature direct import.
// eslint-disable-next-line no-restricted-imports -- facade: shared/browser re-exports feature internals
export { createCommentViewModel } from '$features/comments/ui/comment-view-model.svelte.js';
```

- [ ] **Step 2: Update resolved-content-view-model imports**

In `src/features/content-resolution/ui/resolved-content-view-model.svelte.ts`:

Remove lines 10-11:

```typescript
// eslint-disable-next-line no-restricted-imports -- TODO: extract comment VM creation to a shared interface
import { createCommentViewModel } from '$features/comments/ui/comment-view-model.svelte.js';
```

Replace with:

```typescript
import { createCommentViewModel } from '$shared/browser/comments.js';
```

- [ ] **Step 3: Run lint and check**

Run: `pnpm lint && pnpm check`
Expected: PASS

- [ ] **Step 4: Run full unit tests**

Run: `pnpm vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/browser/comments.ts src/features/content-resolution/ui/resolved-content-view-model.svelte.ts
git commit -m "refactor: extract comment VM facade to shared/browser (M-6)"
```

---

### Task 7: M-7 — Move 3 components from lib to features

**Files:**

- Move: `src/lib/components/SoundCloudEmbed.svelte` → `src/features/content-resolution/ui/SoundCloudEmbed.svelte`
- Move: `src/lib/components/YouTubeFeedList.svelte` → `src/features/content-resolution/ui/YouTubeFeedList.svelte`
- Move: `src/lib/components/PodcastEpisodeList.svelte` → `src/features/content-resolution/ui/PodcastEpisodeList.svelte`
- Modify: `src/features/content-resolution/ui/embed-component-loader.ts:13`
- Modify: `src/web/routes/[platform]/[type]/[id]/PlayerColumn.svelte:4-5`

- [ ] **Step 1: Move SoundCloudEmbed.svelte**

```bash
cd /root/src/github.com/ikuradon/Resonote
mv src/lib/components/SoundCloudEmbed.svelte src/features/content-resolution/ui/SoundCloudEmbed.svelte
```

In the moved file, remove the ESLint disable comment (line 2):

```
  // eslint-disable-next-line no-restricted-imports -- orchestrates embed URL resolution; full refactor deferred
```

Update the import from relative `'$features/content-resolution/application/resolve-soundcloud-embed.js'` to relative `'../application/resolve-soundcloud-embed.js'`.

Update relative import of `EmbedLoading` from `'./EmbedLoading.svelte'` to `'$lib/components/EmbedLoading.svelte'`.

- [ ] **Step 2: Move YouTubeFeedList.svelte**

```bash
mv src/lib/components/YouTubeFeedList.svelte src/features/content-resolution/ui/YouTubeFeedList.svelte
```

In the moved file, remove the ESLint disable comment (line 3).

Update the import from `'$features/content-resolution/application/resolve-youtube-feed.js'` to `'../application/resolve-youtube-feed.js'`.

Update relative import of `WaveformLoader` from `'./WaveformLoader.svelte'` to `'$lib/components/WaveformLoader.svelte'`.

- [ ] **Step 3: Move PodcastEpisodeList.svelte**

```bash
mv src/lib/components/PodcastEpisodeList.svelte src/features/content-resolution/ui/PodcastEpisodeList.svelte
```

In the moved file, remove the ESLint disable comment (line 3).

Update the import from `'$features/content-resolution/application/resolve-feed.js'` to `'../application/resolve-feed.js'`.

Update relative import of `WaveformLoader` from `'./WaveformLoader.svelte'` to `'$lib/components/WaveformLoader.svelte'`.

- [ ] **Step 4: Update embed-component-loader.ts**

In `src/features/content-resolution/ui/embed-component-loader.ts` line 13, change:

```typescript
  soundcloud: () => import('$lib/components/SoundCloudEmbed.svelte'),
```

to:

```typescript
  soundcloud: () => import('./SoundCloudEmbed.svelte'),
```

- [ ] **Step 5: Update PlayerColumn.svelte**

In `src/web/routes/[platform]/[type]/[id]/PlayerColumn.svelte` lines 4-5, change:

```typescript
import PodcastEpisodeList from '$lib/components/PodcastEpisodeList.svelte';
import YouTubeFeedList from '$lib/components/YouTubeFeedList.svelte';
```

to:

```typescript
import PodcastEpisodeList from '$features/content-resolution/ui/PodcastEpisodeList.svelte';
import YouTubeFeedList from '$features/content-resolution/ui/YouTubeFeedList.svelte';
```

- [ ] **Step 6: Run lint, check, and tests**

Run: `pnpm lint && pnpm check && pnpm vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move SoundCloudEmbed/YouTubeFeedList/PodcastEpisodeList to features/content-resolution/ui (M-7)"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

Expected: All PASS

- [ ] **Step 2: Verify dependency direction improvement**

```bash
pnpm graph:imports:summary
```

Expected: `lib-components → features` count should decrease by 3, `shared → features` count should increase by 1 (new facade).

- [ ] **Step 3: Squash or verify commit history**

Verify all 7 commits are clean and meaningful:

1. `fix: sanitize HTTPException messages in error handler (H-3)`
2. `fix: audio toNostrTag/contentKind use contentId.type (M-1)`
3. `fix: validate SoundCloud URL before oEmbed fetch (M-3)`
4. `fix: escape CSS selector in comment highlight (M-4)`
5. `docs: annotate nip05 fetchNip05 as browser-only (M-5)`
6. `refactor: extract comment VM facade to shared/browser (M-6)`
7. `refactor: move SoundCloudEmbed/YouTubeFeedList/PodcastEpisodeList to features/content-resolution/ui (M-7)`
