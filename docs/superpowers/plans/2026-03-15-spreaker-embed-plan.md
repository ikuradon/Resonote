# Spreaker Web Embed — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Spreaker podcast embed with playback position sync and seek.

**Architecture:** New `SpreakerProvider` + `SpreakerEmbed.svelte`. Spreaker Widget API uses `SP.getWidget(iframe)` with seek(ms)/getPosition(cb) — callback-based like SoundCloud.

**Tech Stack:** SvelteKit, Svelte 5 runes, Spreaker Widget API (`https://widget.spreaker.com/widgets.js`)

**Pre-commit validation:**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

---

## Task 1: Create Spreaker content provider

**Files:**

- Create: `src/lib/content/spreaker.ts`
- Create: `src/lib/content/spreaker.test.ts`
- Modify: `src/lib/content/registry.ts`

- [ ] **Step 1: Implement SpreakerProvider**

Spreaker URL formats:

- `https://www.spreaker.com/episode/EPISODE_ID` — episode page
- `https://www.spreaker.com/episode/slug--EPISODE_ID` — episode with slug
- `https://www.spreaker.com/podcast/show-name--SHOW_ID` — show page

```typescript
import type { ContentId, ContentProvider } from './types.js';

// https://www.spreaker.com/episode/12345678
// https://www.spreaker.com/episode/my-episode-title--12345678
const SPREAKER_EPISODE_RE =
  /^https?:\/\/(?:www\.)?spreaker\.com\/episode\/(?:[a-zA-Z0-9_-]+--)?(\d+)/;

export class SpreakerProvider implements ContentProvider {
  readonly platform = 'spreaker';
  readonly displayName = 'Spreaker';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    const match = url.match(SPREAKER_EPISODE_RE);
    if (match && match[1]) {
      return { platform: this.platform, type: 'episode', id: match[1] };
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [
      `spreaker:${contentId.type}:${contentId.id}`,
      `https://www.spreaker.com/episode/${contentId.id}`
    ];
  }

  contentKind(contentId: ContentId): string {
    return `spreaker:${contentId.type}`;
  }

  embedUrl(contentId: ContentId): string {
    return `https://widget.spreaker.com/player?episode_id=${contentId.id}&theme=dark`;
  }

  openUrl(contentId: ContentId): string {
    return `https://www.spreaker.com/episode/${contentId.id}`;
  }
}
```

Note: Spreaker IDs are numeric only — no slash-in-ID issue.

- [ ] **Step 2: Write tests**

Test parseUrl: standard episode URL, URL with slug prefix, null for show URLs (not episodes), null for non-Spreaker, null for empty. Test toNostrTag, embedUrl, openUrl.

- [ ] **Step 3: Register in registry.ts**

- [ ] **Step 4: Run pre-commit validation**

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/spreaker.ts src/lib/content/spreaker.test.ts src/lib/content/registry.ts
git commit -m "Add Spreaker content provider with URL parser"
```

---

## Task 2: Create SpreakerEmbed component

**Files:**

- Create: `src/lib/components/SpreakerEmbed.svelte`
- Modify: `src/types/global.d.ts`

- [ ] **Step 1: Add SP type declarations to global.d.ts**

```typescript
declare namespace SP {
  function getWidget(iframe: HTMLIFrameElement | string): SpreakerWidget;

  interface SpreakerWidget {
    play(): boolean;
    pause(): boolean;
    seek(milliseconds: number): boolean;
    load(episodeId: string): boolean;
    playPrev(): boolean;
    playNext(): boolean;
    getPosition(callback: (position: number, progress: number, duration: number) => void): boolean;
    getDuration(callback: (duration: number) => void): boolean;
    getState(callback: (episode: unknown, state: string, isPlaying: boolean) => void): boolean;
  }
}
```

- [ ] **Step 2: Implement SpreakerEmbed.svelte**

Spreaker uses a different initialization pattern from other widgets:

- Script: `https://widget.spreaker.com/widgets.js` — exposes `SP.getWidget()`
- Init: After script loads AND iframe loads, call `SP.getWidget(iframe)`
- No ready event — poll for `SP` global availability
- `getPosition(cb)` provides `(position, progress, duration)` — all in one callback
- `seek(ms)` takes milliseconds

Key pattern:

- Use `<script module>` for apiPromise (like YouTube/Spotify)
- Check `window.SP?.getWidget` for re-visit case
- iframe src from `provider.embedUrl(contentId)`
- Poll `getPosition` for playback sync (since there's no progress event, use setInterval like YouTube)
- Cache paused state via `getState` polling or initial check

```svelte
<script module lang="ts">
  import { createLogger } from '../utils/logger.js';

  const log = createLogger('SpreakerEmbed');

  let apiPromise: Promise<void> | undefined;

  function loadApi(): Promise<void> {
    if (apiPromise) return apiPromise;
    if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).SP) {
      apiPromise = Promise.resolve();
      return apiPromise;
    }
    log.info('Loading Spreaker Widget API...');
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://widget.spreaker.com/widgets.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Spreaker API'));
      document.head.appendChild(script);
    });
    return apiPromise;
  }
</script>

<script lang="ts">
  import type { ContentId } from '../content/types.js';
  import { SpreakerProvider } from '../content/spreaker.js';
  import { updatePlayback } from '../stores/player.svelte.js';
  import { t } from '../i18n/t.js';

  const provider = new SpreakerProvider();
  const POLL_INTERVAL_MS = 500;

  interface Props {
    contentId: ContentId;
  }
  let { contentId }: Props = $props();

  let iframeEl: HTMLIFrameElement | undefined = $state();
  let widget: SP.SpreakerWidget | undefined;
  let ready = $state(false);
  let error = $state(false);

  function handleSeek(e: Event) {
    const detail = (e as CustomEvent<{ positionMs: number }>).detail;
    if (widget && detail.positionMs >= 0) {
      widget.seek(detail.positionMs);
    }
  }

  $effect(() => {
    if (!iframeEl) return;

    window.addEventListener('resonote:seek', handleSeek);
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    // Wait for iframe to load, then init widget
    const onIframeLoad = () => {
      loadApi()
        .then(() => {
          if (cancelled) return;
          const w = SP.getWidget(iframeEl!);
          widget = w;
          ready = true;
          log.info('Spreaker widget ready');

          // Poll for playback position (no progress event available)
          // getPosition and getState run in parallel, not nested
          let cachedPaused = true;
          pollTimer = setInterval(() => {
            w.getPosition((position, _progress, duration) => {
              updatePlayback(position, duration, cachedPaused);
            });
            w.getState((_episode, _state, isPlaying) => {
              cachedPaused = !isPlaying;
            });
          }, POLL_INTERVAL_MS);
        })
        .catch((err) => {
          log.error('Failed to initialize Spreaker widget', err);
          error = true;
        });
    };

    iframeEl.addEventListener('load', onIframeLoad);

    return () => {
      cancelled = true;
      window.removeEventListener('resonote:seek', handleSeek);
      iframeEl?.removeEventListener('load', onIframeLoad);
      if (pollTimer) clearInterval(pollTimer);
      widget = undefined;
      ready = false;
      error = false;
    };
  });
</script>
```

Template: iframe with embed URL, height="200", loading/error overlays.

- [ ] **Step 3: Run pre-commit validation**

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/SpreakerEmbed.svelte src/types/global.d.ts
git commit -m "Add Spreaker embed component with Widget API playback sync"
```

---

## Task 3: Integrate into content page

**Files:**

- Modify: `src/web/routes/[platform]/[type]/[id]/+page.svelte`

- [ ] **Step 1: Add SpreakerEmbed rendering**

```svelte
import SpreakerEmbed from '$lib/components/SpreakerEmbed.svelte';

{:else if showPlayer && platform === 'spreaker'}
  <SpreakerEmbed {contentId} />
```

- [ ] **Step 2: Run pre-commit validation + E2E**

- [ ] **Step 3: Commit**

```bash
git add src/web/routes/\[platform\]/\[type\]/\[id\]/+page.svelte
git commit -m "Render Spreaker embed on content page"
```

---

## Final Validation

- [ ] **All checks**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e && pnpm build
```
