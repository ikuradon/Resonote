# Vimeo Web Embed — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Vimeo video embed with playback position sync using official Vimeo Player.js SDK.

**Architecture:** New `VimeoProvider` content provider + `VimeoEmbed.svelte` component. Vimeo Player.js is Promise-based (unlike SoundCloud/Podbean's callback style), closer to YouTube's pattern. Script loaded from CDN, player initialized from iframe.

**Tech Stack:** SvelteKit, Svelte 5 runes, Vimeo Player.js (`https://player.vimeo.com/api/player.js`)

**Pre-commit validation (MUST run before every commit):**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

---

## Task 1: Create Vimeo content provider

**Files:**

- Create: `src/lib/content/vimeo.ts`
- Create: `src/lib/content/vimeo.test.ts`
- Modify: `src/lib/content/registry.ts`

- [ ] **Step 1: Implement VimeoProvider**

Vimeo URL formats:

- `https://vimeo.com/{VIDEO_ID}` — standard
- `https://vimeo.com/{VIDEO_ID}/{HASH}` — unlisted/private with hash
- `https://player.vimeo.com/video/{VIDEO_ID}` — embed URL
- `https://vimeo.com/channels/{CHANNEL}/{VIDEO_ID}` — channel video
- `https://vimeo.com/groups/{GROUP}/videos/{VIDEO_ID}` — group video

```typescript
import type { ContentId, ContentProvider } from './types.js';

// https://vimeo.com/76979871
const VIMEO_URL_RE = /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/;
// https://player.vimeo.com/video/76979871
const VIMEO_EMBED_RE = /^https?:\/\/player\.vimeo\.com\/video\/(\d+)/;

export class VimeoProvider implements ContentProvider {
  readonly platform = 'vimeo';
  readonly displayName = 'Vimeo';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    for (const re of [VIMEO_URL_RE, VIMEO_EMBED_RE]) {
      const match = url.match(re);
      if (match && match[1]) {
        return { platform: this.platform, type: 'video', id: match[1] };
      }
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [`vimeo:${contentId.type}:${contentId.id}`, `https://vimeo.com/${contentId.id}`];
  }

  contentKind(contentId: ContentId): string {
    return `vimeo:${contentId.type}`;
  }

  embedUrl(contentId: ContentId): string {
    return `https://player.vimeo.com/video/${contentId.id}`;
  }

  openUrl(contentId: ContentId): string {
    return `https://vimeo.com/${contentId.id}`;
  }
}
```

Note: Vimeo IDs are numeric only. Channel/group URLs also end with the numeric ID.

- [ ] **Step 2: Write tests**

Test parseUrl: standard URL, embed URL, channel URL, group URL, URL with hash, null for invalid. Test toNostrTag, embedUrl, openUrl.

- [ ] **Step 3: Register in registry.ts**

Import and add to the providers array.

- [ ] **Step 4: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/vimeo.ts src/lib/content/vimeo.test.ts src/lib/content/registry.ts
git commit -m "Add Vimeo content provider with URL parser"
```

---

## Task 2: Create VimeoEmbed component

**Files:**

- Create: `src/lib/components/VimeoEmbed.svelte`
- Modify: `src/types/global.d.ts`

- [ ] **Step 1: Add Vimeo Player type declarations to global.d.ts**

```typescript
declare namespace Vimeo {
  class Player {
    constructor(
      element: HTMLIFrameElement | HTMLElement | string,
      options?: Record<string, unknown>
    );
    play(): Promise<void>;
    pause(): Promise<void>;
    getCurrentTime(): Promise<number>;
    setCurrentTime(seconds: number): Promise<number>;
    getDuration(): Promise<number>;
    getPaused(): Promise<boolean>;
    getVolume(): Promise<number>;
    setVolume(volume: number): Promise<number>;
    destroy(): Promise<void>;
    on(event: string, callback: (data: any) => void): void;
    off(event: string, callback?: (data: any) => void): void;
  }
}
```

- [ ] **Step 2: Implement VimeoEmbed.svelte**

Key differences from SoundCloud/Spotify:

- **Promise-based** API (not callbacks)
- **`timeupdate` event** provides `{ seconds, percent, duration }` — all data in one event, no need to cache duration separately
- **`player.setCurrentTime(seconds)`** for seeking (seconds, not milliseconds)
- **`player.destroy()`** returns a Promise for proper cleanup

```svelte
<script lang="ts">
  import type { ContentId } from '../content/types.js';
  import { VimeoProvider } from '../content/vimeo.js';
  import { updatePlayback } from '../stores/player.svelte.js';
  import { t } from '../i18n/t.js';
  import { createLogger } from '../utils/logger.js';

  const log = createLogger('VimeoEmbed');
  const provider = new VimeoProvider();

  interface Props {
    contentId: ContentId;
  }

  let { contentId }: Props = $props();

  let iframeEl: HTMLIFrameElement | undefined = $state();
  let player: Vimeo.Player | undefined;
  let ready = $state(false);
  let error = $state(false);

  let apiPromise: Promise<void> | undefined;

  function loadApi(): Promise<void> {
    if (apiPromise) return apiPromise;
    if (typeof window !== 'undefined' && (window as any).Vimeo?.Player) {
      apiPromise = Promise.resolve();
      return apiPromise;
    }
    log.info('Loading Vimeo Player API...');
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://player.vimeo.com/api/player.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Vimeo API'));
      document.head.appendChild(script);
    });
    return apiPromise;
  }

  function handleSeek(e: Event) {
    const detail = (e as CustomEvent<{ positionMs: number }>).detail;
    if (player && detail.positionMs >= 0) {
      log.debug('Seeking to position', { positionMs: detail.positionMs });
      player.setCurrentTime(detail.positionMs / 1000); // Vimeo uses seconds
    }
  }

  $effect(() => {
    if (!iframeEl) return;

    window.addEventListener('resonote:seek', handleSeek);

    let cancelled = false;

    loadApi()
      .then(() => {
        if (cancelled) return;
        const p = new Vimeo.Player(iframeEl);

        // timeupdate provides seconds, percent, and duration in one event
        p.on('timeupdate', (data: { seconds: number; percent: number; duration: number }) => {
          p.getPaused().then((paused) => {
            updatePlayback(data.seconds * 1000, data.duration * 1000, paused);
          });
        });

        p.on('loaded', () => {
          if (cancelled) {
            p.destroy();
            return;
          }
          player = p;
          ready = true;
          log.info('Vimeo player ready');
        });
      })
      .catch((err) => {
        log.error('Failed to initialize Vimeo player', err);
        error = true;
      });

    return () => {
      cancelled = true;
      window.removeEventListener('resonote:seek', handleSeek);
      if (player) {
        player.off('timeupdate');
        player.off('loaded');
        player.destroy();
      }
      player = undefined;
      ready = false;
      error = false;
    };
  });
</script>

<div
  data-testid="vimeo-embed"
  class="animate-fade-in relative aspect-video w-full overflow-hidden rounded-2xl border border-border-subtle shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
>
  <iframe
    bind:this={iframeEl}
    src={provider.embedUrl(contentId)}
    width="100%"
    height="100%"
    frameborder="0"
    allow="autoplay; fullscreen; picture-in-picture"
    title="Vimeo Player"
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

**Key design decisions:**

- `timeupdate` fires with `{ seconds, duration }` — use both directly instead of caching
- `getPaused()` called in `timeupdate` handler (returns Promise, lightweight)
- Vimeo uses **seconds** everywhere, Resonote uses **milliseconds** — multiply by 1000
- `setCurrentTime(ms / 1000)` for seek
- `player.destroy()` in cleanup for proper resource release
- `aspect-video` CSS class for 16:9 ratio (same as YouTube)

- [ ] **Step 3: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/VimeoEmbed.svelte src/types/global.d.ts
git commit -m "Add Vimeo embed component with Player.js playback sync"
```

---

## Task 3: Integrate into content page

**Files:**

- Modify: `src/web/routes/[platform]/[type]/[id]/+page.svelte`

- [ ] **Step 1: Add VimeoEmbed rendering**

```svelte
import VimeoEmbed from '$lib/components/VimeoEmbed.svelte';

{:else if showPlayer && platform === 'vimeo'}
  <VimeoEmbed {contentId} />
```

Add after the SoundCloud block in the non-collection view.

- [ ] **Step 2: Run pre-commit validation + E2E**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
pnpm test:e2e
```

- [ ] **Step 3: Commit**

```bash
git add src/web/routes/\[platform\]/\[type\]/\[id\]/+page.svelte
git commit -m "Render Vimeo embed on content page"
```

---

## Final Validation

- [ ] **Step 1: All checks**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e
```

- [ ] **Step 2: Production build**

```bash
pnpm build
```
