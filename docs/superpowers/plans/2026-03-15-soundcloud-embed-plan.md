# SoundCloud Web Embed — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SoundCloud Web embed player with playback position sync, matching existing Spotify/YouTube embed patterns.

**Architecture:** New `SoundCloudEmbed.svelte` component using SoundCloud Widget API (`api.js` + `SC.Widget()`). Change `SoundCloudProvider.requiresExtension` to `false` and implement `embedUrl()`. Content page renders the embed for SoundCloud URLs.

**Tech Stack:** SvelteKit, Svelte 5 runes, SoundCloud Widget JS API (`https://w.soundcloud.com/player/api.js`)

**Pre-commit validation (MUST run before every commit):**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

---

## Task 1: Update SoundCloud provider

**Files:**

- Modify: `src/lib/content/soundcloud.ts`

- [ ] **Step 1: Change `requiresExtension` to `false`**

- [ ] **Step 2: Implement `embedUrl()`**

Return the SoundCloud Widget embed URL:

```typescript
embedUrl(contentId: ContentId): string {
  const trackUrl = `https://soundcloud.com/${contentId.id}`;
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(trackUrl)}&auto_play=false&show_artwork=true&show_playcount=false&show_user=true&color=%23c9a256`;
}
```

Note: `contentId.id` is in `user/track` format (e.g., `artist-name/track-name`).

- [ ] **Step 3: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/content/soundcloud.ts
git commit -m "Enable SoundCloud web embed (requiresExtension=false, add embedUrl)"
```

---

## Task 1b: Fix URL routing for IDs containing slashes

SoundCloud IDs are in `user/track` format which contains `/`. This breaks the `[platform]/[type]/[id]` route because `/` splits into extra segments.

**Files:**

- Modify: `src/lib/components/TrackInput.svelte` (encode ID in goto)
- Modify: `src/lib/nostr/content-link.ts` (fix iTagToContentPath for single-colon tags + encode slashes)

- [ ] **Step 1: URL-encode the ID in TrackInput goto**

In `src/lib/components/TrackInput.svelte`, find the `goto()` call and encode the ID:

```typescript
// Before:
goto(`/${contentId.platform}/${contentId.type}/${contentId.id}`);
// After:
goto(`/${contentId.platform}/${contentId.type}/${encodeURIComponent(contentId.id)}`);
```

SvelteKit auto-decodes `page.params.id`, so the content page receives the correct value. `encodeURIComponent` on alphanumeric IDs (Spotify, YouTube) is a no-op, so this is safe for all providers.

- [ ] **Step 2: Fix iTagToContentPath for SoundCloud tags**

SoundCloud's I-tag format: `soundcloud:user/track` (1 colon, no type segment)
Other providers: `spotify:track:abc123` (2 colons)

In `src/lib/nostr/content-link.ts`, update `iTagToContentPath`:

```typescript
export function iTagToContentPath(iTagValue: string): string | null {
  const i1 = iTagValue.indexOf(':');
  if (i1 === -1) return null;
  const i2 = iTagValue.indexOf(':', i1 + 1);
  if (i2 !== -1) {
    // Standard 3-part format: platform:type:id
    const platform = iTagValue.slice(0, i1);
    const type = iTagValue.slice(i1 + 1, i2);
    const id = iTagValue.slice(i2 + 1);
    return `/${platform}/${type}/${encodeURIComponent(id)}`;
  }
  // 2-part format (e.g., soundcloud:user/track) — default type to 'track'
  const platform = iTagValue.slice(0, i1);
  const id = iTagValue.slice(i1 + 1);
  return `/${platform}/track/${encodeURIComponent(id)}`;
}
```

Also update `getContentPathFromTags` — no change needed (it calls `iTagToContentPath`).

- [ ] **Step 3: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/TrackInput.svelte src/lib/nostr/content-link.ts
git commit -m "Fix URL routing for content IDs with slashes (SoundCloud user/track)"
```

---

## Task 2: Create SoundCloudEmbed component

**Files:**

- Create: `src/lib/components/SoundCloudEmbed.svelte`

- [ ] **Step 1: Implement the component**

Follow the SpotifyEmbed pattern:

1. Load the SoundCloud Widget API script (`https://w.soundcloud.com/player/api.js`)
2. Create iframe with the embed URL
3. Initialize `SC.Widget(iframe)` when ready
4. Bind `PLAY_PROGRESS` event for playback position sync → `updatePlayback(position, duration, isPaused)`
5. Bind `PLAY`/`PAUSE` events for state tracking
6. Handle `resonote:seek` custom event → `widget.seekTo(positionMs)`
7. Handle content ID changes → `widget.load(newUrl)`
8. Cleanup on destroy

```svelte
<script lang="ts">
  import type { ContentId } from '../content/types.js';
  import { updatePlayback } from '../stores/player.svelte.js';
  import { t } from '../i18n/t.js';
  import { createLogger } from '../utils/logger.js';

  const log = createLogger('SoundCloudEmbed');

  interface Props {
    contentId: ContentId;
  }

  let { contentId }: Props = $props();

  let iframeEl: HTMLIFrameElement | undefined = $state();
  let widget: SC.Widget | undefined;
  let ready = $state(false);
  let error = $state(false);

  function soundcloudUrl(id: ContentId): string {
    const trackUrl = `https://soundcloud.com/${id.id}`;
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(trackUrl)}&auto_play=false&show_artwork=true&show_playcount=false&show_user=true&color=%23c9a256`;
  }

  let apiPromise: Promise<void> | undefined;

  function loadApi(): Promise<void> {
    if (apiPromise) return apiPromise;

    // Check if already loaded
    if (typeof window !== 'undefined' && (window as any).SC?.Widget) {
      apiPromise = Promise.resolve();
      return apiPromise;
    }

    log.info('Loading SoundCloud Widget API...');
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://w.soundcloud.com/player/api.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load SoundCloud API'));
      document.head.appendChild(script);
    });

    return apiPromise;
  }

  function handleSeek(e: Event) {
    const detail = (e as CustomEvent<{ positionMs: number }>).detail;
    if (widget && detail.positionMs >= 0) {
      log.debug('Seeking to position', { positionMs: detail.positionMs });
      widget.seekTo(detail.positionMs);
    }
  }

  $effect(() => {
    if (!iframeEl) return;

    const url = soundcloudUrl(contentId);
    window.addEventListener('resonote:seek', handleSeek);

    let cancelled = false;

    loadApi()
      .then(() => {
        if (cancelled) return;
        const SCWidget = (window as any).SC.Widget;
        const w = SCWidget(iframeEl);

        let cachedDuration = 0;
        let cachedPaused = true;

        w.bind(SCWidget.Events.READY, () => {
          if (cancelled) return;
          widget = w;
          ready = true;
          log.info('SoundCloud widget ready');
          w.getDuration((d: number) => {
            cachedDuration = d;
          });
        });

        w.bind(SCWidget.Events.PLAY, () => {
          cachedPaused = false;
        });
        w.bind(SCWidget.Events.PAUSE, () => {
          cachedPaused = true;
        });

        w.bind(SCWidget.Events.PLAY_PROGRESS, (data: { currentPosition: number }) => {
          updatePlayback(data.currentPosition, cachedDuration, cachedPaused);
        });
      })
      .catch((err) => {
        log.error('Failed to initialize SoundCloud widget', err);
        error = true;
      });

    return () => {
      cancelled = true;
      window.removeEventListener('resonote:seek', handleSeek);
      widget = undefined;
      ready = false;
      error = false;
    };
  });
</script>

<div
  data-testid="soundcloud-embed"
  class="animate-fade-in relative w-full overflow-hidden rounded-2xl border border-border-subtle shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
>
  <iframe
    bind:this={iframeEl}
    src={soundcloudUrl(contentId)}
    width="100%"
    height="166"
    scrolling="no"
    frameborder="no"
    allow="autoplay"
    title="SoundCloud Player"
  ></iframe>
  {#if error}
    <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-surface-1">
      <p class="text-sm text-text-muted">{t('embed.load_failed')}</p>
    </div>
  {:else if !ready}
    <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-1">
      <span class="text-sm font-medium text-text-muted">{t('loading')}</span>
    </div>
  {/if}
</div>
```

**Important notes:**

- SoundCloud Widget API uses callback-style getters (not Promises)
- `PLAY_PROGRESS` fires with `{ currentPosition, relativePosition, loadProgress }`
- Duration must be fetched separately via `getDuration(callback)`
- `isPaused` must be fetched separately via `isPaused(callback)`
- `seekTo(ms)` takes milliseconds
- The iframe `height` of 166px is SoundCloud's standard single-track height

- [ ] **Step 2: Add SC.Widget type declarations**

In `src/types/global.d.ts`, add SoundCloud Widget types:

```typescript
declare namespace SC {
  function Widget(iframe: HTMLIFrameElement): SC.WidgetInstance;
  namespace Widget {
    const Events: {
      READY: string;
      PLAY: string;
      PAUSE: string;
      FINISH: string;
      PLAY_PROGRESS: string;
      SEEK: string;
      ERROR: string;
    };
  }
  interface WidgetInstance {
    bind(eventName: string, listener: (data?: any) => void): void;
    unbind(eventName: string): void;
    play(): void;
    pause(): void;
    toggle(): void;
    seekTo(milliseconds: number): void;
    setVolume(volume: number): void;
    getVolume(callback: (volume: number) => void): void;
    getDuration(callback: (duration: number) => void): void;
    getPosition(callback: (position: number) => void): void;
    isPaused(callback: (paused: boolean) => void): void;
    getCurrentSound(callback: (sound: any) => void): void;
    load(url: string, options?: Record<string, unknown>): void;
  }
}
```

- [ ] **Step 3: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/SoundCloudEmbed.svelte src/types/global.d.ts
git commit -m "Add SoundCloud embed component with Widget API playback sync"
```

---

## Task 3: Integrate into content page

**Files:**

- Modify: `src/web/routes/[platform]/[type]/[id]/+page.svelte`

- [ ] **Step 1: Add SoundCloudEmbed to content page**

Import and render alongside SpotifyEmbed and YouTubeEmbed:

```svelte
import SoundCloudEmbed from '$lib/components/SoundCloudEmbed.svelte';

<!-- In the player section, after YouTube -->
{:else if showPlayer && platform === 'soundcloud'}
  <SoundCloudEmbed {contentId} />
```

- [ ] **Step 2: Run pre-commit validation + E2E**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
pnpm test:e2e
```

- [ ] **Step 3: Commit**

```bash
git add src/web/routes/\[platform\]/\[type\]/\[id\]/+page.svelte
git commit -m "Render SoundCloud embed on content page"
```

---

## Final Validation

### Task 4: Full validation suite

- [ ] **Step 1: Pre-commit checks**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 2: E2E tests**

```bash
pnpm test:e2e
```

- [ ] **Step 3: Production build**

```bash
pnpm build
```
