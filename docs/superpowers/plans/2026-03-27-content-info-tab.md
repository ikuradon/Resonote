# Content Info Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Info タブにコンテンツメタデータ（サムネイル・タイトル・概要）を表示し、共有・ブックマークボタンをタブバー右端に移動する。oEmbed API を Mixcloud/Spreaker/Podbean/Niconico に拡張する。

**Architecture:** oEmbed API（Cloudflare Pages Function）にプラットフォームを追加し、クライアント側で `/api/oembed/resolve` を呼び出してメタデータを取得。Podcast/Audio は既存の `EpisodeMetadata` を流用。メタデータは `resolved-content-view-model` → `CommentList` → `CommentInfoTab` の props チェーンで渡す。共有・ブックマークは `CommentTabBar` の右端にアイコンボタンとして配置。

**Tech Stack:** SvelteKit, Svelte 5 runes, Cloudflare Pages Functions, Tailwind CSS v4

---

## File Structure

### New Files

| File                                                                         | Responsibility                           |
| ---------------------------------------------------------------------------- | ---------------------------------------- |
| `src/features/content-resolution/domain/content-metadata.ts`                 | `ContentMetadata` 型定義                 |
| `src/features/content-resolution/application/fetch-content-metadata.ts`      | oEmbed API 呼び出し + Podcast/Audio 変換 |
| `src/features/content-resolution/application/fetch-content-metadata.test.ts` | メタデータ取得のユニットテスト           |
| `functions/api/oembed/resolve.test.ts`                                       | oEmbed API 拡張のユニットテスト          |

### Modified Files

| File                                                                       | Change                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `functions/api/oembed/resolve.ts`                                          | Mixcloud/Spreaker/Podbean/Niconico プラットフォーム追加                 |
| `src/lib/components/CommentTabBar.svelte`                                  | 共有・ブックマークアイコンボタン追加                                    |
| `src/lib/components/CommentInfoTab.svelte`                                 | メタデータカード表示に書き換え、共有・ブックマーク削除                  |
| `src/lib/components/CommentList.svelte`                                    | メタデータ props 追加、ブックマーク確認ダイアログ追加、共有モーダル管理 |
| `src/features/content-resolution/ui/resolved-content-view-model.svelte.ts` | メタデータ取得追加                                                      |
| `src/web/routes/[platform]/[type]/[id]/+page.svelte`                       | メタデータ props を CommentList に渡す                                  |
| `src/web/routes/[platform]/[type]/[id]/PlayerColumn.svelte`                | EpisodeDescription 表示削除                                             |
| `src/shared/i18n/en.json` (+ 全言語ファイル)                               | 新規 i18n キー追加                                                      |

### Deleted Files

| File                                           | Reason          |
| ---------------------------------------------- | --------------- |
| `src/lib/components/EpisodeDescription.svelte` | Info タブに統合 |

---

### Task 1: ContentMetadata 型定義

**Files:**

- Create: `src/features/content-resolution/domain/content-metadata.ts`

- [ ] **Step 1: Create type definition**

```typescript
// src/features/content-resolution/domain/content-metadata.ts
export interface ContentMetadata {
  title: string | null;
  subtitle: string | null;
  thumbnailUrl: string | null;
  description: string | null;
}
```

- [ ] **Step 2: Verify type check passes**

Run: `pnpm check`
Expected: 0 ERRORS

- [ ] **Step 3: Commit**

```bash
git add src/features/content-resolution/domain/content-metadata.ts
git commit -m "feat: add ContentMetadata type definition"
```

---

### Task 2: oEmbed API — Mixcloud/Spreaker/Podbean 追加

**Files:**

- Modify: `functions/api/oembed/resolve.ts` (PLATFORMS object, lines 21-46)
- Create: `functions/api/oembed/resolve.test.ts`

- [ ] **Step 1: Write failing tests for new platforms**

```typescript
// functions/api/oembed/resolve.test.ts
import { describe, expect, it, vi } from 'vitest';

// Mock safeFetch
const mockSafeFetch = vi.fn();
vi.mock('../lib/url-validation.js', () => ({
  safeFetch: (...args: unknown[]) => mockSafeFetch(...args)
}));

// Dynamic import after mock setup
const { onRequestGet } = await import('./resolve.js');

function makeContext(params: Record<string, string>, env: Record<string, string> = {}) {
  const url = new URL('https://example.com/api/oembed/resolve');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return {
    request: new Request(url.toString()),
    env,
    params: {},
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    next: vi.fn(),
    data: {}
  } as unknown as EventContext<Record<string, string>, string, unknown>;
}

function mockOEmbedResponse(data: Record<string, string>) {
  mockSafeFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => data
  });
}

describe('oEmbed resolve API', () => {
  describe('existing platforms', () => {
    it('should resolve Spotify track', async () => {
      mockOEmbedResponse({
        title: 'Test Track',
        author_name: 'Test Artist',
        thumbnail_url: 'https://i.scdn.co/image/test',
        provider_name: 'Spotify'
      });
      const res = await onRequestGet(
        makeContext({ platform: 'spotify', type: 'track', id: 'abc123' })
      );
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.title).toBe('Test Track');
      expect(body.subtitle).toBe('Test Artist');
      expect(body.thumbnailUrl).toBe('https://i.scdn.co/image/test');
      expect(body.provider).toBe('Spotify');
    });
  });

  describe('new platforms', () => {
    it('should resolve Mixcloud', async () => {
      mockOEmbedResponse({
        title: 'Mix Title',
        author_name: 'DJ Name',
        thumbnail_url: 'https://thumbnailer.mixcloud.com/test.jpg',
        provider_name: 'Mixcloud'
      });
      const res = await onRequestGet(
        makeContext({ platform: 'mixcloud', type: 'show', id: 'djname/mix-title' })
      );
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.title).toBe('Mix Title');
      expect(body.subtitle).toBe('DJ Name');
      expect(body.provider).toBe('Mixcloud');
      expect(mockSafeFetch).toHaveBeenCalledWith(
        expect.stringContaining('mixcloud.com/oembed'),
        expect.any(Object)
      );
    });

    it('should resolve Spreaker', async () => {
      mockOEmbedResponse({
        title: 'Episode Title',
        author_name: 'Show Name',
        thumbnail_url: 'https://d3wo5wojvuv7l.cloudfront.net/test.jpg',
        provider_name: 'Spreaker'
      });
      const res = await onRequestGet(
        makeContext({ platform: 'spreaker', type: 'episode', id: '12345678' })
      );
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.title).toBe('Episode Title');
      expect(body.provider).toBe('Spreaker');
    });

    it('should resolve Podbean', async () => {
      mockOEmbedResponse({
        title: 'Podcast Episode',
        author_name: 'Podcast Host',
        thumbnail_url: 'https://pbcdn1.podbean.com/test.jpg',
        provider_name: 'Podbean'
      });
      const res = await onRequestGet(
        makeContext({ platform: 'podbean', type: 'episode', id: 'abc12-def34' })
      );
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.title).toBe('Podcast Episode');
      expect(body.provider).toBe('Podbean');
    });
  });

  describe('validation', () => {
    it('should reject missing params', async () => {
      const res = await onRequestGet(makeContext({ platform: 'spotify' }));
      expect(res.status).toBe(400);
    });

    it('should reject unsupported platform', async () => {
      const res = await onRequestGet(
        makeContext({ platform: 'unknown', type: 'track', id: '123' })
      );
      expect(res.status).toBe(400);
    });

    it('should reject invalid ID format', async () => {
      const res = await onRequestGet(
        makeContext({ platform: 'spotify', type: 'track', id: '../etc/passwd' })
      );
      expect(res.status).toBe(400);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- functions/api/oembed/resolve.test.ts`
Expected: FAIL — mixcloud, spreaker, podbean tests fail with "unsupported_platform"

- [ ] **Step 3: Add Mixcloud/Spreaker/Podbean to PLATFORMS**

In `functions/api/oembed/resolve.ts`, add to the `PLATFORMS` object after vimeo:

```typescript
  mixcloud: {
    oembedBase: 'https://www.mixcloud.com/oembed/',
    validTypes: new Set(['show']),
    idPattern: /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)+$/,
    buildUrl: (_type, id) => `https://www.mixcloud.com/${id}/`
  },
  spreaker: {
    oembedBase: 'https://api.spreaker.com/oembed',
    validTypes: new Set(['episode', 'show']),
    idPattern: /^[0-9]+$/,
    buildUrl: (_type, id) => `https://www.spreaker.com/episode/${id}`
  },
  podbean: {
    oembedBase: 'https://api.podbean.com/v1/oembed',
    validTypes: new Set(['episode']),
    idPattern: /^[a-zA-Z0-9_-]+$/,
    buildUrl: (_type, id) => `https://www.podbean.com/e/${id}`
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- functions/api/oembed/resolve.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add functions/api/oembed/resolve.ts functions/api/oembed/resolve.test.ts
git commit -m "feat: add Mixcloud/Spreaker/Podbean to oEmbed API"
```

---

### Task 3: oEmbed API — Niconico 追加 (getthumbinfo XML)

**Files:**

- Modify: `functions/api/oembed/resolve.ts`
- Modify: `functions/api/oembed/resolve.test.ts`

- [ ] **Step 1: Write failing test for Niconico**

Add to `functions/api/oembed/resolve.test.ts`:

```typescript
describe('niconico (getthumbinfo XML)', () => {
  it('should resolve Niconico video from XML API', async () => {
    mockSafeFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<?xml version="1.0" encoding="UTF-8"?>
<nicovideo_thumb_response status="ok">
  <thumb>
    <title>Test Video Title</title>
    <thumbnail_url>https://nicovideo.cdn.nimg.jp/thumbnails/sm12345</thumbnail_url>
    <user_nickname>TestUser</user_nickname>
    <description>Video description here</description>
  </thumb>
</nicovideo_thumb_response>`
    });
    const res = await onRequestGet(
      makeContext({ platform: 'niconico', type: 'video', id: 'sm12345' })
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.title).toBe('Test Video Title');
    expect(body.subtitle).toBe('TestUser');
    expect(body.thumbnailUrl).toBe('https://nicovideo.cdn.nimg.jp/thumbnails/sm12345');
    expect(body.provider).toBe('niconico');
  });

  it('should handle getthumbinfo error response', async () => {
    mockSafeFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<?xml version="1.0" encoding="UTF-8"?>
<nicovideo_thumb_response status="fail">
  <error><code>NOT_FOUND</code></error>
</nicovideo_thumb_response>`
    });
    const res = await onRequestGet(
      makeContext({ platform: 'niconico', type: 'video', id: 'sm99999' })
    );
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- functions/api/oembed/resolve.test.ts`
Expected: FAIL — niconico tests fail

- [ ] **Step 3: Add Niconico handling with XML parsing**

In `functions/api/oembed/resolve.ts`, add a `NiconicoConfig` type and special handling:

Add after the `PLATFORMS` object:

```typescript
const NICONICO_CONFIG = {
  validTypes: new Set(['video']),
  idPattern: /^(sm|nm|so)\d+$/
};
```

In `handleRequest`, after the `PLATFORMS` check block (line 61-72), add niconico handling before the oEmbed fetch:

```typescript
// Niconico uses getthumbinfo XML API instead of oEmbed
if (platform === 'niconico') {
  if (!NICONICO_CONFIG.validTypes.has(type)) {
    return json({ error: 'unsupported_type' }, 400);
  }
  if (!NICONICO_CONFIG.idPattern.test(id)) {
    return json({ error: 'invalid_id' }, 400);
  }
  return handleNiconico(id, allowPrivateIPs);
}
```

Add the `handleNiconico` function:

```typescript
async function handleNiconico(id: string, allowPrivateIPs: boolean): Promise<Response> {
  const apiUrl = `https://ext.nicovideo.jp/api/getthumbinfo/${id}`;
  try {
    const res = await safeFetch(apiUrl, { allowPrivateIPs });
    if (!res.ok) {
      return json({ error: 'oembed_failed' }, 502);
    }
    const xml = await res.text();

    const statusMatch = xml.match(/status="(\w+)"/);
    if (statusMatch?.[1] !== 'ok') {
      return json({ error: 'oembed_failed' }, 502);
    }

    const title = xml.match(/<title>([^<]*)<\/title>/)?.[1] ?? null;
    const subtitle = xml.match(/<user_nickname>([^<]*)<\/user_nickname>/)?.[1] ?? null;
    const thumbnailUrl = xml.match(/<thumbnail_url>([^<]*)<\/thumbnail_url>/)?.[1] ?? null;

    return json({ title, subtitle, thumbnailUrl, provider: 'niconico' }, 200, {
      'Cache-Control': 'public, max-age=86400'
    });
  } catch {
    return json({ error: 'fetch_failed' }, 502);
  }
}
```

Also modify the early return logic: move the niconico check before the `PLATFORMS[platform]` lookup by restructuring:

```typescript
if (platform === 'niconico') {
  // ... niconico handling above
}

if (!Object.prototype.hasOwnProperty.call(PLATFORMS, platform)) {
  return json({ error: 'unsupported_platform' }, 400);
}
// ... rest of oEmbed handling
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- functions/api/oembed/resolve.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add functions/api/oembed/resolve.ts functions/api/oembed/resolve.test.ts
git commit -m "feat: add Niconico getthumbinfo XML API to oEmbed endpoint"
```

---

### Task 4: fetchContentMetadata クライアント側

**Files:**

- Create: `src/features/content-resolution/application/fetch-content-metadata.ts`
- Create: `src/features/content-resolution/application/fetch-content-metadata.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/features/content-resolution/application/fetch-content-metadata.test.ts
import { describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { fetchContentMetadata } from './fetch-content-metadata.js';
import type { ContentId } from '$shared/content/types.js';

describe('fetchContentMetadata', () => {
  it('should return metadata from oEmbed API for spotify', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Track Title',
        subtitle: 'Artist',
        thumbnailUrl: 'https://i.scdn.co/image/test',
        provider: 'Spotify'
      })
    });

    const contentId: ContentId = { platform: 'spotify', type: 'track', id: 'abc123' };
    const result = await fetchContentMetadata(contentId);

    expect(result).toEqual({
      title: 'Track Title',
      subtitle: 'Artist',
      thumbnailUrl: 'https://i.scdn.co/image/test',
      description: null
    });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/oembed/resolve?platform=spotify&type=track&id=abc123'
    );
  });

  it('should return null for unsupported platforms', async () => {
    const contentId: ContentId = { platform: 'netflix', type: 'show', id: '123' };
    const result = await fetchContentMetadata(contentId);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return null when API returns error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 502 });

    const contentId: ContentId = { platform: 'youtube', type: 'video', id: 'abc' };
    const result = await fetchContentMetadata(contentId);
    expect(result).toBeNull();
  });

  it('should return null when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    const contentId: ContentId = { platform: 'vimeo', type: 'video', id: '123' };
    const result = await fetchContentMetadata(contentId);
    expect(result).toBeNull();
  });

  it('should skip oEmbed for podcast platform', async () => {
    const contentId: ContentId = { platform: 'podcast', type: 'episode', id: 'abc' };
    const result = await fetchContentMetadata(contentId);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should skip oEmbed for audio platform', async () => {
    const contentId: ContentId = { platform: 'audio', type: 'file', id: 'abc' };
    const result = await fetchContentMetadata(contentId);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/features/content-resolution/application/fetch-content-metadata.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement fetchContentMetadata**

```typescript
// src/features/content-resolution/application/fetch-content-metadata.ts
import type { ContentId } from '$shared/content/types.js';
import type { ContentMetadata } from '../domain/content-metadata.js';

/** Platforms that have server-side oEmbed/metadata endpoints */
const OEMBED_PLATFORMS = new Set([
  'spotify',
  'youtube',
  'soundcloud',
  'vimeo',
  'mixcloud',
  'spreaker',
  'podbean',
  'niconico'
]);

/** Platforms whose metadata comes from existing resolution (not oEmbed) */
const SELF_RESOLVED_PLATFORMS = new Set(['podcast', 'audio']);

export async function fetchContentMetadata(contentId: ContentId): Promise<ContentMetadata | null> {
  if (SELF_RESOLVED_PLATFORMS.has(contentId.platform)) return null;
  if (!OEMBED_PLATFORMS.has(contentId.platform)) return null;

  try {
    const params = new URLSearchParams({
      platform: contentId.platform,
      type: contentId.type,
      id: contentId.id
    });
    const res = await fetch(`/api/oembed/resolve?${params}`);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      title: string | null;
      subtitle: string | null;
      thumbnailUrl: string | null;
    };

    return {
      title: data.title,
      subtitle: data.subtitle,
      thumbnailUrl: data.thumbnailUrl,
      description: null
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/features/content-resolution/application/fetch-content-metadata.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/content-resolution/application/fetch-content-metadata.ts src/features/content-resolution/application/fetch-content-metadata.test.ts
git commit -m "feat: add fetchContentMetadata client-side API"
```

---

### Task 5: resolved-content-view-model にメタデータ取得を追加

**Files:**

- Modify: `src/features/content-resolution/ui/resolved-content-view-model.svelte.ts`

- [ ] **Step 1: Add ContentMetadata state and fetch logic**

In `resolved-content-view-model.svelte.ts`:

1. Add import:

```typescript
import type { ContentMetadata } from '../domain/content-metadata.js';
import { fetchContentMetadata } from '../application/fetch-content-metadata.js';
```

2. Add state after `bookmarkBusy` (line 49):

```typescript
let contentMetadata = $state<ContentMetadata | null>(null);
let contentMetadataLoading = $state(false);
```

3. Add `$effect` for oEmbed metadata fetch (after the audio resolution effect, around line 157):

```typescript
// --- Resolution: oEmbed metadata for embed platforms ---
$effect(() => {
  const cid = getContentId();
  contentMetadata = null;
  contentMetadataLoading = true;
  const signal = { cancelled: false };

  fetchContentMetadata(cid)
    .then((meta) => {
      if (signal.cancelled) return;
      contentMetadata = meta;
    })
    .catch(() => {
      // Silently fail — metadata is non-critical
    })
    .finally(() => {
      if (!signal.cancelled) contentMetadataLoading = false;
    });

  return () => {
    signal.cancelled = true;
  };
});
```

4. Add a `$derived` that merges Podcast/Audio episode metadata into ContentMetadata:

```typescript
let mergedMetadata = $derived.by<ContentMetadata | null>(() => {
  // For podcast/audio, build ContentMetadata from episode fields
  if (episodeTitle || episodeDescription) {
    return {
      title: episodeTitle ?? null,
      subtitle: episodeFeedTitle ?? null,
      thumbnailUrl: episodeImage ?? null,
      description: episodeDescription ?? null
    };
  }
  // For oEmbed platforms, use fetched metadata
  return contentMetadata;
});

let metadataLoading = $derived(contentMetadataLoading && mergedMetadata === null);
```

5. Add to return object:

```typescript
    get contentMetadata() {
      return mergedMetadata;
    },
    get contentMetadataLoading() {
      return metadataLoading;
    },
```

- [ ] **Step 2: Run type check**

Run: `pnpm check`
Expected: 0 ERRORS

- [ ] **Step 3: Commit**

```bash
git add src/features/content-resolution/ui/resolved-content-view-model.svelte.ts
git commit -m "feat: add content metadata fetch to resolved-content VM"
```

---

### Task 6: i18n キー追加

**Files:**

- Modify: `src/shared/i18n/en.json` (and all other locale files)

- [ ] **Step 1: Add new keys to en.json**

Add the following keys to `src/shared/i18n/en.json`:

```json
  "info.loading": "Loading content info...",
  "info.error": "Could not load content info",
  "info.show_more": "Show more",
  "info.show_less": "Show less",
  "bookmark.confirm.add.title": "Add bookmark",
  "bookmark.confirm.add.message": "Add this content to your bookmarks?",
  "bookmark.confirm.remove.title": "Remove bookmark",
  "bookmark.confirm.remove.message": "Remove this content from your bookmarks?",
  "share.button.label": "Share",
  "bookmark.button.label": "Bookmark",
```

- [ ] **Step 2: Add corresponding keys to all other locale files**

Add the same keys (with translated values) to: `ja.json`, `ja_osaka.json`, `ja_kyoto.json`, `ja_villainess.json`, `zh.json`, `pt.json`, and any other locale files present.

- [ ] **Step 3: Run lint and type check**

Run: `pnpm lint && pnpm check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/shared/i18n/
git commit -m "feat: add i18n keys for content info tab and bookmark confirmation"
```

---

### Task 7: CommentTabBar に共有・ブックマークボタン追加

**Files:**

- Modify: `src/lib/components/CommentTabBar.svelte`

- [ ] **Step 1: Add new props and buttons**

Update `CommentTabBar.svelte`:

```svelte
<script lang="ts">
  import type { CommentTab } from '$features/comments/ui/comment-list-view-model.svelte.js';
  import type { FollowFilter } from '$shared/browser/follows.js';
  import { t } from '$shared/i18n/t.js';

  import CommentFilterBar from './CommentFilterBar.svelte';

  interface Props {
    activeTab: CommentTab;
    followFilter: FollowFilter;
    timedCount: number;
    shoutCount: number;
    onTabChange: (tab: CommentTab) => void;
    onFilterChange: (filter: FollowFilter) => void;
    loggedIn: boolean;
    bookmarked: boolean;
    bookmarkBusy: boolean;
    onBookmarkClick: () => void;
    onShareClick: () => void;
  }

  const {
    activeTab,
    followFilter,
    timedCount,
    shoutCount,
    onTabChange,
    onFilterChange,
    loggedIn,
    bookmarked,
    bookmarkBusy,
    onBookmarkClick,
    onShareClick
  }: Props = $props();
</script>

<!-- Heading row with filter -->
<div class="flex items-center gap-2">
  <span class="text-sm font-semibold text-text-primary">{t('comment.heading')}</span>
  <div class="h-px flex-1 bg-border-subtle"></div>
  <CommentFilterBar {followFilter} {onFilterChange} />
</div>

<!-- Tab bar -->
<div class="flex items-center border-b border-border-subtle">
  <button
    type="button"
    onclick={() => onTabChange('flow')}
    class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors
      {activeTab === 'flow'
      ? 'border-b-2 border-accent text-accent -mb-px'
      : 'text-text-muted hover:text-text-secondary'}"
  >
    🎶 <span class="hidden sm:inline">{t('tab.flow')}</span>
    {#if timedCount > 0}
      <span class="text-xs opacity-70">({timedCount})</span>
    {/if}
  </button>
  <button
    type="button"
    onclick={() => onTabChange('shout')}
    class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors
      {activeTab === 'shout'
      ? 'border-b-2 border-amber-500 text-amber-500 -mb-px'
      : 'text-text-muted hover:text-text-secondary'}"
  >
    📢 <span class="hidden sm:inline">{t('tab.shout')}</span>
    {#if shoutCount > 0}
      <span class="text-xs opacity-70">({shoutCount})</span>
    {/if}
  </button>
  <button
    type="button"
    onclick={() => onTabChange('info')}
    class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors
      {activeTab === 'info'
      ? 'border-b-2 border-text-secondary text-text-secondary -mb-px'
      : 'text-text-muted hover:text-text-secondary'}"
  >
    ℹ️ <span class="hidden sm:inline">{t('tab.info')}</span>
  </button>

  <!-- Spacer -->
  <div class="flex-1"></div>

  <!-- Bookmark button -->
  {#if loggedIn}
    <button
      type="button"
      onclick={onBookmarkClick}
      disabled={bookmarkBusy}
      class="flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors disabled:opacity-50
        {bookmarked
        ? 'text-accent hover:bg-accent/10'
        : 'text-text-muted hover:bg-surface-1 hover:text-text-secondary'}"
      aria-label={t('bookmark.button.label')}
    >
      {bookmarked ? '\u2605' : '\u2606'}
    </button>
  {/if}

  <!-- Share button -->
  <button
    type="button"
    onclick={onShareClick}
    class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary"
    aria-label={t('share.button.label')}
  >
    <svg
      class="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  </button>
</div>
```

- [ ] **Step 2: Run format and type check**

Run: `pnpm format && pnpm check`
Expected: 0 ERRORS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/CommentTabBar.svelte
git commit -m "feat: add bookmark and share buttons to CommentTabBar"
```

---

### Task 8: CommentInfoTab をメタデータ表示に書き換え

**Files:**

- Modify: `src/lib/components/CommentInfoTab.svelte`

- [ ] **Step 1: Rewrite CommentInfoTab**

```svelte
<script lang="ts">
  import type { ContentMetadata } from '$features/content-resolution/domain/content-metadata.js';
  import type { ContentProvider } from '$shared/content/types.js';
  import { t } from '$shared/i18n/t.js';

  interface Props {
    metadata: ContentMetadata | null;
    metadataLoading: boolean;
    provider: ContentProvider;
    openUrl?: string;
  }

  const { metadata, metadataLoading, provider, openUrl }: Props = $props();

  let expanded = $state(false);

  let isLong = $derived((metadata?.description?.length ?? 0) > 200);
</script>

<div class="space-y-4 py-6">
  {#if metadataLoading}
    <!-- Skeleton loading -->
    <div class="flex gap-3 animate-pulse">
      <div class="h-20 w-20 shrink-0 rounded-lg bg-surface-2"></div>
      <div class="flex-1 space-y-2">
        <div class="h-4 w-3/4 rounded bg-surface-2"></div>
        <div class="h-3 w-1/2 rounded bg-surface-2"></div>
        <div class="h-3 w-full rounded bg-surface-2"></div>
      </div>
    </div>
  {:else if metadata && (metadata.title || metadata.description)}
    <!-- Metadata card -->
    <div class="flex gap-3 rounded-xl border border-border-subtle bg-surface-1 p-4">
      {#if metadata.thumbnailUrl}
        <img
          src={metadata.thumbnailUrl}
          alt=""
          class="h-20 w-20 shrink-0 rounded-lg object-cover"
        />
      {/if}
      <div class="min-w-0 flex-1">
        {#if metadata.title}
          <h3 class="text-sm font-semibold text-text-primary">{metadata.title}</h3>
        {/if}
        {#if metadata.subtitle}
          <p class="mt-0.5 text-xs text-text-muted">{metadata.subtitle}</p>
        {/if}
        {#if metadata.description}
          <p
            class="mt-2 whitespace-pre-line text-xs leading-relaxed text-text-secondary
              {!expanded && isLong ? 'line-clamp-3' : ''}"
          >
            {metadata.description}
          </p>
          {#if isLong}
            <button
              type="button"
              onclick={() => (expanded = !expanded)}
              class="mt-1 text-xs text-accent hover:text-accent-hover"
            >
              {expanded ? t('info.show_less') : t('info.show_more')}
            </button>
          {/if}
        {/if}
      </div>
    </div>
  {:else}
    <p class="py-4 text-center text-sm text-text-muted">{t('info.error')}</p>
  {/if}

  {#if openUrl}
    <a
      href={openUrl}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 text-sm text-accent hover:underline"
    >
      {t('content.open_and_comment')} &#8599;
    </a>
  {/if}
</div>
```

- [ ] **Step 2: Run format and type check**

Run: `pnpm format && pnpm check`
Expected: 0 ERRORS (there will be errors in CommentList.svelte due to changed props — fixed in Task 9)

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/CommentInfoTab.svelte
git commit -m "feat: rewrite CommentInfoTab to display content metadata"
```

---

### Task 9: CommentList にメタデータ props + ブックマーク確認ダイアログ + 共有モーダル

**Files:**

- Modify: `src/lib/components/CommentList.svelte`

- [ ] **Step 1: Update Props and imports**

In `CommentList.svelte`:

1. Add import:

```typescript
import type { ContentMetadata } from '$features/content-resolution/domain/content-metadata.js';
import ShareButton from './ShareButton.svelte';
```

2. Update Props interface — remove `bookmarked`, `bookmarkBusy`, `onToggleBookmark` and add metadata + bookmark/share state:

```typescript
interface Props {
  comments: Comment[];
  reactionIndex: Map<string, ReactionStats>;
  contentId: ContentId;
  provider: ContentProvider;
  loading?: boolean;
  getPlaceholders?: () => Map<string, PlaceholderComment>;
  fetchOrphanParent?: (parentId: string, positionMs: number | null) => void;
  onQuote?: (comment: Comment) => void;
  threadPubkeys?: string[];
  openUrl?: string;
  highlightCommentId?: string;
  contentMetadata?: ContentMetadata | null;
  contentMetadataLoading?: boolean;
  bookmarked?: boolean;
  bookmarkBusy?: boolean;
  onToggleBookmark?: () => void;
}
```

3. Add state for bookmark dialog and share modal:

```typescript
let bookmarkDialogOpen = $state(false);
let shareModalOpen = $state(false);

function handleBookmarkClick(): void {
  bookmarkDialogOpen = true;
}

async function confirmBookmark(): Promise<void> {
  bookmarkDialogOpen = false;
  onToggleBookmark?.();
}

function cancelBookmark(): void {
  bookmarkDialogOpen = false;
}

function handleShareClick(): void {
  shareModalOpen = true;
}
```

- [ ] **Step 2: Update CommentTabBar usage**

Replace the existing `<CommentTabBar>` call to pass new props:

```svelte
<CommentTabBar
  activeTab={vm.activeTab}
  followFilter={vm.followFilter}
  timedCount={vm.timedCount}
  shoutCount={vm.shoutCount}
  onTabChange={vm.setActiveTab}
  onFilterChange={vm.setFollowFilter}
  loggedIn={vm.canWrite}
  {bookmarked}
  {bookmarkBusy}
  onBookmarkClick={handleBookmarkClick}
  onShareClick={handleShareClick}
/>
```

- [ ] **Step 3: Update CommentInfoTab usage**

Replace the existing `<CommentInfoTab>` block:

```svelte
  {:else if vm.activeTab === 'info'}
    <CommentInfoTab
      metadata={contentMetadata ?? null}
      metadataLoading={contentMetadataLoading ?? false}
      {provider}
      {openUrl}
    />
```

- [ ] **Step 4: Add bookmark ConfirmDialog and ShareButton**

After the existing mute ConfirmDialog, add:

```svelte
<ConfirmDialog
  open={bookmarkDialogOpen}
  title={bookmarked ? t('bookmark.confirm.remove.title') : t('bookmark.confirm.add.title')}
  message={bookmarked ? t('bookmark.confirm.remove.message') : t('bookmark.confirm.add.message')}
  confirmLabel={t('confirm.ok')}
  cancelLabel={t('confirm.cancel')}
  variant="default"
  onConfirm={confirmBookmark}
  onCancel={cancelBookmark}
/>

{#if shareModalOpen}
  <ShareButton {contentId} {provider} bind:open={shareModalOpen} />
{/if}
```

Note: ShareButton currently opens its own modal. This may require modifying ShareButton to accept an `open` prop, or calling its `openMenu()` method directly. Check ShareButton's API and adjust accordingly — the simplest approach is to render ShareButton persistently and trigger its modal via a forwarded click.

Alternative simpler approach if ShareButton doesn't support `open` prop: Keep ShareButton rendered but hidden, and call its openMenu programmatically. Or, render ShareButton always but visually hidden and relay the click:

```svelte
<!-- Hidden ShareButton that we trigger programmatically -->
<div class="hidden">
  <ShareButton {contentId} {provider} bind:this={shareButtonRef} />
</div>
```

The exact integration depends on ShareButton's internals. The implementer should check `ShareButton.svelte` and `share-button-view-model.svelte.ts` and choose the simplest approach.

- [ ] **Step 5: Run format, lint, and type check**

Run: `pnpm format && pnpm lint && pnpm check`
Expected: 0 ERRORS

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/CommentList.svelte
git commit -m "feat: integrate metadata, bookmark dialog, and share button in CommentList"
```

---

### Task 10: +page.svelte にメタデータ props を追加

**Files:**

- Modify: `src/web/routes/[platform]/[type]/[id]/+page.svelte`

- [ ] **Step 1: Pass metadata props to CommentList**

Update the `<CommentList>` usage (around line 200) to include:

```svelte
<CommentList
  comments={vm.store.comments}
  reactionIndex={vm.store.reactionIndex}
  loading={vm.store.loading}
  {contentId}
  {provider}
  {threadPubkeys}
  getPlaceholders={() => vm.store!.placeholders}
  fetchOrphanParent={vm.store.fetchOrphanParent}
  bookmarked={vm.bookmarked}
  bookmarkBusy={vm.bookmarkBusy}
  onToggleBookmark={vm.toggleBookmark}
  openUrl={provider.openUrl(contentId)}
  {highlightCommentId}
  contentMetadata={vm.contentMetadata}
  contentMetadataLoading={vm.contentMetadataLoading}
/>
```

- [ ] **Step 2: Run type check**

Run: `pnpm check`
Expected: 0 ERRORS

- [ ] **Step 3: Commit**

```bash
git add src/web/routes/[platform]/[type]/[id]/+page.svelte
git commit -m "feat: pass content metadata to CommentList from page"
```

---

### Task 11: PlayerColumn から EpisodeDescription を削除

**Files:**

- Modify: `src/web/routes/[platform]/[type]/[id]/PlayerColumn.svelte`
- Delete: `src/lib/components/EpisodeDescription.svelte`

- [ ] **Step 1: Remove EpisodeDescription from PlayerColumn**

In `PlayerColumn.svelte`:

1. Remove import: `import EpisodeDescription from '$lib/components/EpisodeDescription.svelte';`
2. Remove `episodeDescription` from Props interface and destructuring
3. Remove the description rendering block (lines 57-61):

```svelte
{#if episodeDescription}
  <div class="mt-3">
    <EpisodeDescription description={episodeDescription} />
  </div>
{/if}
```

- [ ] **Step 2: Remove episodeDescription prop from +page.svelte**

In `+page.svelte`, remove `episodeDescription={vm.episodeDescription}` from the `<PlayerColumn>` props.

- [ ] **Step 3: Delete EpisodeDescription.svelte**

```bash
git rm src/lib/components/EpisodeDescription.svelte
```

- [ ] **Step 4: Run format, lint, and type check**

Run: `pnpm format && pnpm lint && pnpm check`
Expected: 0 ERRORS

- [ ] **Step 5: Commit**

```bash
git add src/web/routes/[platform]/[type]/[id]/PlayerColumn.svelte src/web/routes/[platform]/[type]/[id]/+page.svelte
git commit -m "refactor: remove EpisodeDescription from PlayerColumn (moved to Info tab)"
```

---

### Task 12: ユニットテスト実行 + 修正

**Files:** All modified files

- [ ] **Step 1: Run full unit test suite**

Run: `pnpm test`
Expected: ALL PASS. If failures, fix mock setups for new props.

- [ ] **Step 2: Run full validation**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm test`
Expected: ALL PASS

- [ ] **Step 3: Commit any test fixes**

```bash
git add -A
git commit -m "test: fix tests for content info tab redesign"
```

---

### Task 13: E2E テスト更新

**Files:**

- Modify: E2E test files that reference Info tab, bookmark button, share button

- [ ] **Step 1: Update E2E tests for new button locations**

Key changes needed:

- Info tab no longer has bookmark/share buttons — update selectors
- Bookmark button is now in tab bar — find by aria-label `bookmark.button.label`
- Share button is now in tab bar — find by aria-label `share.button.label`
- Bookmark click now shows ConfirmDialog — add confirm step
- Info tab now shows metadata card — add assertions for skeleton/content

- [ ] **Step 2: Run E2E tests**

Run: `pnpm test:e2e`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add e2e/
git commit -m "test: update E2E tests for info tab and button migration"
```
