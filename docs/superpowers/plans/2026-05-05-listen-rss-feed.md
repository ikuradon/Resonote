# LISTEN RSS Feed Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` if subagents are available, or `superpowers:executing-plans` if implementing inline. Track progress with these checkboxes and do not skip verification.

**Goal:** LISTEN (`listen.style`) の podcast / episode URL を、既存の podcast RSS feed flow に乗せて解決する。LISTEN 固有 platform は増やさず、feed は `/podcast/feed/{feedBase64}`、episode は RSS item `guid` identity の `/podcast/episode/{feedBase64}:{guidBase64}` へ遷移させる。

**Architecture:** `src/shared/content/podcast.ts` に LISTEN URL parser と normalization を追加し、`src/server/api/podcast.ts` の RSS parser が item `<link>` と normalized guid を返す。`src/features/content-resolution/application/resolve-listen-episode.ts` が LISTEN episode URL を RSS item link 経由で episode ContentId に解決し、`content-navigation` が normal provider parsing より前に intercept する。feed fallback warning は allowlist helper + i18n key で inline 表示する。

**Tech Stack:** SvelteKit / Svelte 5 runes, Hono API, existing podcast RSS resolver, Vitest, existing `$shared` / `$features` / `$server` aliases.

**Spec:** `docs/superpowers/specs/2026-05-05-listen-rss-feed-design.md`

---

## File Structure

### 新規作成

| ファイル                                                                     | 責務                                                             |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/features/content-resolution/application/resolve-listen-episode.ts`      | LISTEN episode URL を RSS item link で episode path へ解決       |
| `src/features/content-resolution/application/resolve-listen-episode.test.ts` | resolver の success / fallback / error / `t` preservation テスト |
| `src/features/content-resolution/application/feed-warning.ts`                | feed warning code allowlist と translation key mapping           |
| `src/features/content-resolution/application/feed-warning.test.ts`           | warning allowlist テスト                                         |

### 変更

| ファイル                                                                 | 変更内容                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `src/shared/content/podcast.ts`                                          | LISTEN parser / normalization / helper exports を追加し、provider parse を RSS feed fallback 対応 |
| `src/shared/content/podcast.test.ts`                                     | LISTEN URL parser と provider fallback の境界テスト追加                                           |
| `src/server/api/podcast.ts`                                              | `ParsedEpisode.link` / `rawGuid` / normalized `guid` fallback を追加                              |
| `src/server/api/podcast.test.ts`                                         | RSS item link parsing と guid fallback のテスト追加                                               |
| `src/features/content-resolution/application/resolve-feed.ts`            | `FeedEpisode` に `link` / `rawGuid` を追加                                                        |
| `src/features/content-resolution/application/resolve-feed.test.ts`       | episode shape の後方互換テスト更新                                                                |
| `src/features/content-resolution/application/content-navigation.ts`      | async 化し、LISTEN episode URL を provider parsing より前に intercept                             |
| `src/features/content-resolution/application/content-navigation.test.ts` | async navigation と LISTEN intercept テスト追加                                                   |
| `src/features/content-resolution/ui/track-input-view-model.svelte.ts`    | async submit と stale resolver guard を追加                                                       |
| `src/features/content-resolution/ui/track-input-view-model.test.ts`      | async submit / stale result テスト更新                                                            |
| `src/web/routes/+page.svelte`                                            | example click handler を async navigation に対応                                                  |
| `src/web/routes/[platform]/[type]/[id]/+page.svelte`                     | feed warning text を URL query から allowlist で取得                                              |
| `src/web/routes/[platform]/[type]/[id]/PlayerColumn.svelte`              | feed warning text を `PodcastEpisodeList` に渡す                                                  |
| `src/features/content-resolution/ui/PodcastEpisodeList.svelte`           | inline warning 表示                                                                               |
| `src/shared/i18n/*.json`                                                 | `podcast.warning.listen_episode_not_found` を全 locale に追加                                     |

---

## Task 1: LISTEN URL Parser

**Files:**

- Modify: `src/shared/content/podcast.ts`
- Test: `src/shared/content/podcast.test.ts`

- [ ] **Step 1: Add failing tests for LISTEN parsing**

Add a `describe('LISTEN URL parsing')` block in `src/shared/content/podcast.test.ts`.

Required assertions:

```ts
import {
  buildListenFeedUrl,
  isListenEpisodeUrl,
  normalizeListenEpisodeUrl,
  parseListenUrl
} from '$shared/content/podcast.js';

expect(buildListenFeedUrl('foo')).toBe('https://rss.listen.style/p/foo/rss');

expect(parseListenUrl('https://listen.style/p/foo')).toEqual({
  feedUrl: 'https://rss.listen.style/p/foo/rss'
});

expect(parseListenUrl('http://listen.style/p/Foo/Ep?t=90.50#x')).toEqual({
  feedUrl: 'https://rss.listen.style/p/Foo/rss',
  episodeUrl: 'https://listen.style/p/Foo/Ep',
  initialTimeSec: 90.5,
  initialTimeParam: '90.50'
});

expect(parseListenUrl('https://rss.listen.style/p/foo/rss/')).toEqual({
  feedUrl: 'https://rss.listen.style/p/foo/rss'
});

expect(normalizeListenEpisodeUrl('https://listen.style/p/Foo/Ep?x=1#frag')).toBe(
  'https://listen.style/p/Foo/Ep'
);
expect(normalizeListenEpisodeUrl('https://listen.style/p/foo/bar//')).toBeNull();
expect(normalizeListenEpisodeUrl('https://listen.style/u/user')).toBeNull();
expect(normalizeListenEpisodeUrl('https://listen.style/p/foo/%2Fbar')).toBeNull();
expect(normalizeListenEpisodeUrl('https://listen.style/p/%E0%A4%A/bar')).toBeNull();
expect(isListenEpisodeUrl('https://listen.style/p/foo/bar?t=1e3')).toBe(true);
expect(isListenEpisodeUrl('https://listen.style/p/foo')).toBe(false);
```

Also assert `?t=1e3`, `?t=+90`, `?t=0`, `?t=-1`, `?t=abc` are dropped, while `?t=90.5` and `?t=90.50` are accepted. `isListenEpisodeUrl()` must be equivalent to `parseListenUrl(url)?.episodeUrl != null`.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
pnpm vitest run src/shared/content/podcast.test.ts
```

Expected: FAIL because the LISTEN helpers are not exported yet.

- [ ] **Step 3: Implement parser helpers in `podcast.ts`**

Add these exports near the top of `src/shared/content/podcast.ts`:

```ts
export interface ParsedListenUrl {
  feedUrl: string;
  /** Normalized canonical LISTEN episode URL used for RSS item.link matching. */
  episodeUrl?: string;
  initialTimeSec?: number;
  initialTimeParam?: string;
}

export function buildListenFeedUrl(podcastSlug: string): string;
export function normalizeListenEpisodeUrl(url: string): string | null;
export function parseListenUrl(url: string): ParsedListenUrl | null;
export function isListenEpisodeUrl(url: string): boolean;
```

Implementation requirements:

- Use `new URL(url)`; return `null` on parse failure.
- Accept only `http:` / `https:`.
- For `listen.style`, accept only `/p/{podcastSlug}` or `/p/{podcastSlug}/{episodeSlug}` with an optional single trailing slash.
- For `rss.listen.style`, accept only `/p/{podcastSlug}/rss` with an optional single trailing slash.
- Canonicalize feed URL as `https://rss.listen.style/p/${encodeURIComponent(decodedPodcastSlug)}/rss`.
- Canonicalize episode URL as `https://listen.style/p/${encodeURIComponent(decodedPodcastSlug)}/${encodeURIComponent(decodedEpisodeSlug)}`.
- Extract slugs from path segments, decode each segment, and return `null` if decoding fails.
- Reject decoded slugs containing `/`, `?`, `#`, or control characters.
- Do not lowercase path segments.
- Drop query/hash before episode matching.
- Remove only one trailing slash; reject multiple trailing slashes.
- Parse the first `t` query param with `/^(?:\d+|\d+\.\d+)$/` and `Number(value) > 0`.
- Preserve accepted `t` as `initialTimeParam`; expose `Number(initialTimeParam)` as `initialTimeSec`.
- Implement `isListenEpisodeUrl(url)` as `return parseListenUrl(url)?.episodeUrl != null;`.

Update `PodcastProvider.parseUrl(url)` before the generic RSS checks:

```ts
const listen = parseListenUrl(url);
if (listen) {
  return { platform: this.platform, type: 'feed', id: toBase64url(listen.feedUrl) };
}
```

This is only provider-level fallback. Episode navigation is handled earlier by `content-navigation`.

- [ ] **Step 4: Run parser tests**

Run:

```bash
pnpm vitest run src/shared/content/podcast.test.ts
```

Expected: PASS.

---

## Task 2: RSS Episode Shape

**Files:**

- Modify: `src/server/api/podcast.ts`
- Modify: `src/server/api/podcast.test.ts`
- Modify: `src/features/content-resolution/application/resolve-feed.ts`
- Modify: `src/features/content-resolution/application/resolve-feed.test.ts`

- [ ] **Step 1: Add failing RSS parser tests**

In `src/server/api/podcast.test.ts`, add cases for:

- `<link>` is trimmed and returned as `episode.link`.
- whitespace-only `<link>` is treated as missing.
- whitespace-only `<guid>` falls back to `enclosureUrl`.
- normal `<guid>` is returned as `guid` and `rawGuid`.
- missing `<guid>` falls back to `enclosureUrl` and has no `rawGuid`.

Expected shape:

```ts
expect(episode).toMatchObject({
  guid: 'raw-guid-1',
  rawGuid: 'raw-guid-1',
  link: 'https://listen.style/p/foo/bar',
  enclosureUrl: 'https://example.com/audio.mp3'
});
```

Fallback assertion:

```ts
expect(episode.guid).toBe('https://example.com/audio.mp3');
expect(episode.rawGuid).toBeUndefined();
```

- [ ] **Step 2: Run API tests and confirm failure**

Run:

```bash
pnpm vitest run src/server/api/podcast.test.ts
```

Expected: FAIL because `link` / `rawGuid` are not exposed and `guid` fallback is still consumer-side.

- [ ] **Step 3: Update RSS parser types and implementation**

In `src/server/api/podcast.ts`, update:

```ts
interface ParsedEpisode {
  title: string;
  guid: string;
  rawGuid?: string;
  link?: string;
  enclosureUrl: string;
  pubDate: string;
  duration: number;
  description: string;
}
```

Add a small helper in the same file:

```ts
function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
```

Inside `parseRss()` item loop:

```ts
const rawGuid = trimToUndefined(extractTagContent(itemXml, 'guid'));
const link = trimToUndefined(extractTagContent(itemXml, 'link'));
const guid = rawGuid ?? enclosureUrl;

episodes.push({
  title: itemTitle,
  guid,
  rawGuid,
  link,
  enclosureUrl,
  pubDate,
  duration,
  description
});
```

Then simplify `handleFeedUrl()` and `handleAudioUrl()` by using `ep.guid` / `matchedEpisode.guid` directly instead of `guid || enclosureUrl`.

- [ ] **Step 4: Update client feed episode type**

In `src/features/content-resolution/application/resolve-feed.ts`, update `FeedEpisode`:

```ts
export interface FeedEpisode {
  title: string;
  guid: string;
  rawGuid?: string;
  link?: string;
  enclosureUrl: string;
  pubDate: string;
  duration: number;
  description: string;
}
```

Keep existing consumers unchanged; `PodcastEpisodeList` should still use `ep.guid`.

- [ ] **Step 5: Run RSS/feed tests**

Run:

```bash
pnpm vitest run src/server/api/podcast.test.ts src/features/content-resolution/application/resolve-feed.test.ts
```

Expected: PASS.

---

## Task 3: LISTEN Episode Resolver

**Files:**

- Create: `src/features/content-resolution/application/resolve-listen-episode.ts`
- Create: `src/features/content-resolution/application/resolve-listen-episode.test.ts`

- [ ] **Step 1: Add failing resolver tests**

Mock `resolvePodcastFeed()` from `$features/content-resolution/application/resolve-feed.js`.

Required cases:

- matching RSS item `link` resolves to `/podcast/episode/{feedBase64}:{guidBase64}`.
- input `?t=90.50` appends `?t=90.50`, not `?t=90.5`.
- item `link` with query/hash/trailing slash matches canonical episode URL.
- RSS item with no `<link>` returns feed fallback with `warning=listen_episode_not_found`.
- missing match returns feed fallback with `warning=listen_episode_not_found`.
- feed resolve failure returns `kind: 'error'` with `reason: 'listen_feed_unavailable'` and no warning query.
- duplicate matches use the first item in feed order.
- malformed LISTEN URL returns `null` or a feed fallback only when `parseListenUrl()` can identify a feed.

Expected resolver type:

```ts
export type ResolveListenEpisodeResult =
  | { kind: 'episode'; path: string; initialTimeSec?: number; initialTimeParam?: string }
  | { kind: 'feed-fallback'; path: string; warning: 'listen_episode_not_found' }
  | { kind: 'error'; path: string; reason: 'listen_feed_unavailable' };
```

- [ ] **Step 2: Run resolver tests and confirm failure**

Run:

```bash
pnpm vitest run src/features/content-resolution/application/resolve-listen-episode.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement resolver**

Implementation sketch:

```ts
import { resolvePodcastFeed } from './resolve-feed.js';
import {
  buildEpisodeContentId,
  normalizeListenEpisodeUrl,
  parseListenUrl
} from '$shared/content/podcast.js';
import { toBase64url } from '$shared/content/url-utils.js';

export async function resolveListenEpisodeUrl(
  inputUrl: string
): Promise<ResolveListenEpisodeResult | null> {
  const parsed = parseListenUrl(inputUrl);
  if (!parsed?.episodeUrl) return null;

  const feedPath = `/podcast/feed/${toBase64url(parsed.feedUrl)}`;
  let feed;
  try {
    feed = await resolvePodcastFeed(parsed.feedUrl);
  } catch {
    return { kind: 'error', path: feedPath, reason: 'listen_feed_unavailable' };
  }

  if (!feed) {
    return { kind: 'error', path: feedPath, reason: 'listen_feed_unavailable' };
  }

  const matches = feed.episodes.filter(
    (episode) => episode.link && normalizeListenEpisodeUrl(episode.link) === parsed.episodeUrl
  );
  const episode = matches[0];

  if (!episode) {
    return {
      kind: 'feed-fallback',
      path: `${feedPath}?warning=listen_episode_not_found`,
      warning: 'listen_episode_not_found'
    };
  }

  const contentId = buildEpisodeContentId(parsed.feedUrl, episode.guid);
  const basePath = `/podcast/episode/${contentId.id}`;
  const path = parsed.initialTimeParam
    ? `${basePath}?t=${encodeURIComponent(parsed.initialTimeParam)}`
    : basePath;

  return {
    kind: 'episode',
    path,
    initialTimeSec: parsed.initialTimeSec,
    initialTimeParam: parsed.initialTimeParam
  };
}
```

Optional diagnostic logging can use:

```ts
type ListenResolveMissReason =
  | 'feed_unavailable'
  | 'feed_parse_error'
  | 'item_link_missing'
  | 'item_link_mismatch'
  | 'duplicate_match';
```

Do not surface these diagnostic reasons in UI.

- [ ] **Step 4: Run resolver tests**

Run:

```bash
pnpm vitest run src/features/content-resolution/application/resolve-listen-episode.test.ts
```

Expected: PASS.

---

## Task 4: Navigation Intercept And Stale Guard

**Files:**

- Modify: `src/features/content-resolution/application/content-navigation.ts`
- Modify: `src/features/content-resolution/application/content-navigation.test.ts`
- Modify: `src/features/content-resolution/ui/track-input-view-model.svelte.ts`
- Modify: `src/features/content-resolution/ui/track-input-view-model.test.ts`
- Modify: `src/web/routes/+page.svelte`

- [ ] **Step 1: Add failing navigation tests**

In `content-navigation.test.ts`:

- Convert tests to `await resolveContentNavigation(...)`.
- Mock `resolveListenEpisodeUrl()`.
- Verify LISTEN episode URL calls resolver before provider parsing and returns resolver path.
- Verify LISTEN feed URL still returns `/podcast/feed/{feedBase64}` without resolver.
- Verify resolver `kind: 'error'` returns feed path without warning query.
- Verify non-LISTEN URLs still use current provider / `/resolve/{base64}` behavior.

In `track-input-view-model.test.ts`:

- Mock `resolveContentNavigation()` with resolved promises.
- Assert `submit()` navigates after async result.
- Assert stale first result is ignored when the URL changes and a later submit resolves first.
- Assert error state is still translated from `errorKey`.

- [ ] **Step 2: Run navigation tests and confirm failure**

Run:

```bash
pnpm vitest run \
  src/features/content-resolution/application/content-navigation.test.ts \
  src/features/content-resolution/ui/track-input-view-model.test.ts
```

Expected: FAIL because `resolveContentNavigation()` is still synchronous and no LISTEN intercept exists.

- [ ] **Step 3: Make `resolveContentNavigation()` async**

In `src/features/content-resolution/application/content-navigation.ts`:

```ts
import { isListenEpisodeUrl } from '$shared/content/podcast.js';
import { resolveListenEpisodeUrl } from './resolve-listen-episode.js';

export async function resolveContentNavigation(input: string): Promise<ContentNavigationResult> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const normalizedInput = normalizeInputUrl(trimmed);

  if (isListenEpisodeUrl(normalizedInput)) {
    const listenResult = await resolveListenEpisodeUrl(normalizedInput);
    if (listenResult) return { path: listenResult.path };
  }

  const contentId = parseContentUrl(trimmed);
  ...
}
```

Use the same normalized URL for LISTEN intercept that `/resolve/{base64}` would use, so `listen.style/p/foo/bar` without a scheme is accepted. Keep the rest of the existing behavior intact.

- [ ] **Step 4: Update submit handlers**

In `src/features/content-resolution/ui/track-input-view-model.svelte.ts`:

```ts
let navigationRequestId = 0;

async function submit(): Promise<void> {
  error = '';
  const requestId = ++navigationRequestId;
  const result = await resolveContentNavigation(url);
  if (requestId !== navigationRequestId) return;
  if (!result) return;
  ...
}
```

In the `url` setter, increment `navigationRequestId` when the URL changes to invalidate pending resolver results.

In `src/web/routes/+page.svelte`, make `handleExample()` async:

```ts
async function handleExample(url: string) {
  const result = await resolveContentNavigation(url);
  if (result && 'path' in result) goto(result.path);
}
```

- [ ] **Step 5: Run navigation tests**

Run:

```bash
pnpm vitest run \
  src/features/content-resolution/application/content-navigation.test.ts \
  src/features/content-resolution/ui/track-input-view-model.test.ts
```

Expected: PASS.

---

## Task 5: Feed Warning Allowlist UI

**Files:**

- Create: `src/features/content-resolution/application/feed-warning.ts`
- Create: `src/features/content-resolution/application/feed-warning.test.ts`
- Modify: `src/web/routes/[platform]/[type]/[id]/+page.svelte`
- Modify: `src/web/routes/[platform]/[type]/[id]/PlayerColumn.svelte`
- Modify: `src/features/content-resolution/ui/PodcastEpisodeList.svelte`
- Modify: `src/shared/i18n/en.json`
- Modify: `src/shared/i18n/ja.json`
- Modify: `src/shared/i18n/de.json`
- Modify: `src/shared/i18n/es.json`
- Modify: `src/shared/i18n/fr.json`
- Modify: `src/shared/i18n/ko.json`
- Modify: `src/shared/i18n/pt_br.json`
- Modify: `src/shared/i18n/zh_cn.json`
- Modify: `src/shared/i18n/ja_osaka.json`
- Modify: `src/shared/i18n/ja_kyoto.json`
- Modify: `src/shared/i18n/ja_villainess.json`

- [ ] **Step 1: Add warning helper tests**

In `feed-warning.test.ts`:

```ts
expect(getFeedWarningKey('listen_episode_not_found')).toBe(
  'podcast.warning.listen_episode_not_found'
);
expect(getFeedWarningKey('listen_feed_unavailable')).toBeNull();
expect(getFeedWarningKey('<script>')).toBeNull();
expect(getFeedWarningKey(null)).toBeNull();
```

- [ ] **Step 2: Implement helper**

```ts
import type { TranslationKey } from '$shared/i18n/t.js';

const FEED_WARNING_KEY_BY_CODE = {
  listen_episode_not_found: 'podcast.warning.listen_episode_not_found'
} as const satisfies Record<string, TranslationKey>;

export function getFeedWarningKey(code: string | null): TranslationKey | null {
  if (!code) return null;
  return FEED_WARNING_KEY_BY_CODE[code as keyof typeof FEED_WARNING_KEY_BY_CODE] ?? null;
}
```

- [ ] **Step 3: Add locale keys**

Add this key to every `src/shared/i18n/*.json` file. Use idiomatic translations where possible; English fallback is acceptable for non-Japanese locales if a better translation is not available.

```json
"podcast.warning.listen_episode_not_found": "指定された LISTEN エピソードは RSS 内で見つかりませんでした。一覧から選択してください。"
```

For `en.json`:

```json
"podcast.warning.listen_episode_not_found": "The requested LISTEN episode was not found in the RSS feed. Select an episode from the list."
```

- [ ] **Step 4: Wire inline warning**

In route `+page.svelte`, derive:

```ts
import { getFeedWarningKey } from '$features/content-resolution/application/feed-warning.js';

let feedWarningKey = $derived(
  isFeed ? getFeedWarningKey(page.url.searchParams.get('warning')) : null
);
let feedWarningText = $derived(feedWarningKey ? t(feedWarningKey) : null);
```

Pass `feedWarningText` into `PlayerColumn`.

In `PlayerColumn.svelte`, add optional prop:

```ts
feedWarningText?: string | null;
```

Then:

```svelte
<PodcastEpisodeList {contentId} {onFeedLoaded} warningText={feedWarningText} />
```

In `PodcastEpisodeList.svelte`, add optional prop and show it above the list:

```svelte
{#if warningText}
  <p
    class="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-text-primary"
    role="status"
  >
    {warningText}
  </p>
{/if}
```

Use existing color tokens if `warning` is not available in Tailwind config. Do not display arbitrary query values.

- [ ] **Step 5: Run warning tests**

Run:

```bash
pnpm vitest run src/features/content-resolution/application/feed-warning.test.ts
```

Expected: PASS.

---

## Task 6: End-To-End Contract Verification

- [ ] **Step 1: Run all focused tests**

Run:

```bash
pnpm vitest run \
  src/shared/content/podcast.test.ts \
  src/server/api/podcast.test.ts \
  src/features/content-resolution/application/resolve-feed.test.ts \
  src/features/content-resolution/application/resolve-listen-episode.test.ts \
  src/features/content-resolution/application/content-navigation.test.ts \
  src/features/content-resolution/application/feed-warning.test.ts \
  src/features/content-resolution/ui/track-input-view-model.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run type/check gate**

Run:

```bash
pnpm run check
```

Expected: PASS.

- [ ] **Step 3: Run architecture structure gate**

Run:

```bash
pnpm run check:structure
```

Expected: PASS.

- [ ] **Step 4: Inspect git diff**

Run:

```bash
git diff --stat
git diff -- src/shared/content/podcast.ts src/server/api/podcast.ts src/features/content-resolution
```

Expected:

- LISTEN changes are limited to podcast content parsing, podcast RSS parsing, content-resolution navigation/UI, and i18n.
- No new LISTEN platform/provider file is introduced.
- Existing unrelated `package.json` workspace change is not reverted or mixed into the implementation commit unless the owner explicitly requests it.

- [ ] **Step 5: Commit implementation**

Only after tests pass:

```bash
git add \
  src/shared/content/podcast.ts \
  src/shared/content/podcast.test.ts \
  src/server/api/podcast.ts \
  src/server/api/podcast.test.ts \
  src/features/content-resolution/application/resolve-feed.ts \
  src/features/content-resolution/application/resolve-feed.test.ts \
  src/features/content-resolution/application/resolve-listen-episode.ts \
  src/features/content-resolution/application/resolve-listen-episode.test.ts \
  src/features/content-resolution/application/content-navigation.ts \
  src/features/content-resolution/application/content-navigation.test.ts \
  src/features/content-resolution/application/feed-warning.ts \
  src/features/content-resolution/application/feed-warning.test.ts \
  src/features/content-resolution/ui/track-input-view-model.svelte.ts \
  src/features/content-resolution/ui/track-input-view-model.test.ts \
  src/features/content-resolution/ui/PodcastEpisodeList.svelte \
  'src/web/routes/+page.svelte' \
  'src/web/routes/[platform]/[type]/[id]/+page.svelte' \
  'src/web/routes/[platform]/[type]/[id]/PlayerColumn.svelte' \
  src/shared/i18n/*.json
git commit -m "Add LISTEN RSS episode resolution"
```

Expected: commit succeeds with no unrelated files staged.
