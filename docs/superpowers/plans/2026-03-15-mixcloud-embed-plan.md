# Mixcloud Web Embed — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Mixcloud embed player with playback position sync for DJ mixes and podcasts.

**Architecture:** New `MixcloudProvider` + `MixcloudEmbed.svelte`. Mixcloud Widget API has a unique event system (`widget.events.progress.on()`) different from SoundCloud's `bind()` pattern. The widget is Promise-based (`widget.ready.then()`).

**Tech Stack:** SvelteKit, Svelte 5 runes, Mixcloud Widget API (`//widget.mixcloud.com/media/js/widgetApi.js`)

**Pre-commit validation (MUST run before every commit):**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

---

## Task 1: Create Mixcloud content provider

**Files:**

- Create: `src/lib/content/mixcloud.ts`
- Create: `src/lib/content/mixcloud.test.ts`
- Modify: `src/lib/content/registry.ts`

- [ ] **Step 1: Implement MixcloudProvider**

Mixcloud URL format: `https://www.mixcloud.com/{user}/{mix-slug}/`

```typescript
import type { ContentId, ContentProvider } from './types.js';

// https://www.mixcloud.com/user/mix-name/
const MIXCLOUD_RE =
  /^https?:\/\/(?:www\.)?mixcloud\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/?(?:\?.*)?$/;

export class MixcloudProvider implements ContentProvider {
  readonly platform = 'mixcloud';
  readonly displayName = 'Mixcloud';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    const match = url.match(MIXCLOUD_RE);
    if (!match) return null;
    // Exclude non-content paths
    const reserved = ['upload', 'discover', 'dashboard', 'settings', 'favorites'];
    if (reserved.includes(match[1])) return null;
    return { platform: this.platform, type: 'mix', id: `${match[1]}/${match[2]}` };
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [`mixcloud:${contentId.id}`, `https://www.mixcloud.com/${contentId.id}/`];
  }

  contentKind(): string {
    return 'mixcloud:mix';
  }

  embedUrl(contentId: ContentId): string {
    const feed = encodeURIComponent(`/${contentId.id}/`);
    return `https://www.mixcloud.com/widget/iframe/?hide_cover=1&light=1&feed=${feed}`;
  }

  openUrl(contentId: ContentId): string {
    return `https://www.mixcloud.com/${contentId.id}/`;
  }
}
```

Note: Mixcloud IDs use `user/mix-slug` format (same slash-in-ID issue as SoundCloud). The `iTagToContentPath` fix from the SoundCloud work handles this via `encodeURIComponent`.

- [ ] **Step 2: Write tests**

Test parseUrl: standard URL, with www, with trailing slash, with query params, null for reserved paths (upload, discover), null for non-Mixcloud URLs. Test toNostrTag, embedUrl, openUrl.

- [ ] **Step 3: Register in registry.ts**

Import and add to providers array.

- [ ] **Step 4: Run pre-commit validation**

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/mixcloud.ts src/lib/content/mixcloud.test.ts src/lib/content/registry.ts
git commit -m "Add Mixcloud content provider with URL parser"
```

---

## Task 2: Create MixcloudEmbed component

**Files:**

- Create: `src/lib/components/MixcloudEmbed.svelte`
- Modify: `src/types/global.d.ts`

- [ ] **Step 1: Add Mixcloud type declarations to global.d.ts**

Mixcloud Widget API differs from SoundCloud:

- Init: `Mixcloud.PlayerWidget(iframe)` returns object with `.ready` Promise
- Events: `widget.events.progress.on((position, duration) => ...)` — NOT `.bind()`
- Methods: `widget.play()`, `widget.pause()`, `widget.getPosition()`, `widget.getDuration()` — return Promises

```typescript
declare namespace Mixcloud {
  function PlayerWidget(element: HTMLIFrameElement): MixcloudWidget;

  interface MixcloudWidget {
    ready: Promise<void>;
    play(): void;
    pause(): void;
    togglePlay(): void;
    seek(seconds: number): Promise<boolean>;
    load(cloudcastKey: string, startPlaying?: boolean): void;
    getPosition(): Promise<number>;
    getDuration(): Promise<number>;
    getIsPaused(): Promise<boolean>;
    events: {
      play: { on(callback: () => void): void; off(callback: () => void): void };
      pause: { on(callback: () => void): void; off(callback: () => void): void };
      ended: { on(callback: () => void): void; off(callback: () => void): void };
      buffering: { on(callback: () => void): void; off(callback: () => void): void };
      progress: {
        on(callback: (position: number, duration: number) => void): void;
        off(callback: (position: number, duration: number) => void): void;
      };
      error: {
        on(callback: (error: unknown) => void): void;
        off(callback: (error: unknown) => void): void;
      };
    };
  }
}
```

- [ ] **Step 2: Implement MixcloudEmbed.svelte**

Key differences from SoundCloud/Vimeo:

- Script: `https://widget.mixcloud.com/media/js/widgetApi.js`
- Init: `Mixcloud.PlayerWidget(iframeEl)` → wait for `widget.ready`
- Events use `.events.progress.on(fn)` / `.events.play.on(fn)` pattern (not bind/unbind)
- Progress event provides `(position, duration)` directly — both in seconds
- No separate getDuration call needed (comes from progress)
- Seek: `widget.seek(seconds)` — returns Promise<boolean> (true if allowed, false if not)

```svelte
<script lang="ts">
  import type { ContentId } from '../content/types.js';
  import { MixcloudProvider } from '../content/mixcloud.js';
  import { updatePlayback } from '../stores/player.svelte.js';
  import { t } from '../i18n/t.js';
  import { createLogger } from '../utils/logger.js';

  const log = createLogger('MixcloudEmbed');
  const provider = new MixcloudProvider();

  interface Props {
    contentId: ContentId;
  }

  let { contentId }: Props = $props();

  let iframeEl: HTMLIFrameElement | undefined = $state();
  let widget: Mixcloud.MixcloudWidget | undefined;
  let ready = $state(false);
  let error = $state(false);

  let apiPromise: Promise<void> | undefined;

  function loadApi(): Promise<void> {
    if (apiPromise) return apiPromise;
    if (typeof window !== 'undefined' && (window as any).Mixcloud?.PlayerWidget) {
      apiPromise = Promise.resolve();
      return apiPromise;
    }
    log.info('Loading Mixcloud Widget API...');
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://widget.mixcloud.com/media/js/widgetApi.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Mixcloud API'));
      document.head.appendChild(script);
    });
    return apiPromise;
  }

  function handleSeek(e: Event) {
    const detail = (e as CustomEvent<{ positionMs: number }>).detail;
    if (widget && detail.positionMs >= 0) {
      log.debug('Seeking to position', { positionMs: detail.positionMs });
      widget.seek(detail.positionMs / 1000); // Mixcloud uses seconds
    }
  }

  $effect(() => {
    if (!iframeEl) return;

    window.addEventListener('resonote:seek', handleSeek);

    let cancelled = false;
    let cachedPaused = true;
    let progressHandler: ((position: number, duration: number) => void) | undefined;
    let playHandler: (() => void) | undefined;
    let pauseHandler: (() => void) | undefined;

    loadApi()
      .then(() => {
        if (cancelled) return;
        const w = Mixcloud.PlayerWidget(iframeEl!);

        return w.ready.then(() => {
          if (cancelled) return;
          widget = w;
          ready = true;
          log.info('Mixcloud widget ready');

          playHandler = () => {
            cachedPaused = false;
          };
          pauseHandler = () => {
            cachedPaused = true;
          };
          progressHandler = (position: number, duration: number) => {
            updatePlayback(position * 1000, duration * 1000, cachedPaused);
          };

          w.events.play.on(playHandler);
          w.events.pause.on(pauseHandler);
          w.events.progress.on(progressHandler);
        });
      })
      .catch((err) => {
        log.error('Failed to initialize Mixcloud widget', err);
        error = true;
      });

    return () => {
      cancelled = true;
      window.removeEventListener('resonote:seek', handleSeek);
      if (widget && progressHandler && playHandler && pauseHandler) {
        widget.events.progress.off(progressHandler);
        widget.events.play.off(playHandler);
        widget.events.pause.off(pauseHandler);
      }
      widget = undefined;
      ready = false;
      error = false;
    };
  });
</script>
```

Template: iframe with embed URL from provider, loading/error overlays. Height ~120px for Mixcloud's compact player (`hide_cover=1`).

- [ ] **Step 3: Run pre-commit validation**

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/MixcloudEmbed.svelte src/types/global.d.ts
git commit -m "Add Mixcloud embed component with Widget API playback sync and seek"
```

---

## Task 3: Integrate into content page

**Files:**

- Modify: `src/web/routes/[platform]/[type]/[id]/+page.svelte`

- [ ] **Step 1: Add MixcloudEmbed rendering**

```svelte
import MixcloudEmbed from '$lib/components/MixcloudEmbed.svelte';

{:else if showPlayer && platform === 'mixcloud'}
  <MixcloudEmbed {contentId} />
```

- [ ] **Step 2: Run pre-commit validation + E2E**

- [ ] **Step 3: Commit**

```bash
git add src/web/routes/\[platform\]/\[type\]/\[id\]/+page.svelte
git commit -m "Render Mixcloud embed on content page"
```

---

## Final Validation

- [ ] **All checks**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e && pnpm build
```
