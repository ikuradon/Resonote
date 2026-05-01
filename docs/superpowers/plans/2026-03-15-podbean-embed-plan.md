# Podbean Web Embed — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Podbean podcast embed player with playback position sync, reusing the SoundCloud embed pattern.

**Architecture:** New `PodbeanProvider` content provider + `PodbeanEmbed.svelte` component using Podbean Widget API (`api.js` + `PB`). The API is nearly identical to SoundCloud's Widget API (bind/unbind, seekTo, getPosition, getDuration, PLAY_PROGRESS events).

**Tech Stack:** SvelteKit, Svelte 5 runes, Podbean Widget API (`https://pbcdn1.podbean.com/fs1/player/api.js`)

**Pre-commit validation (MUST run before every commit):**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

---

## Task 1: Create Podbean content provider

**Files:**

- Create: `src/lib/content/podbean.ts`
- Create: `src/lib/content/podbean.test.ts`
- Modify: `src/lib/content/registry.ts` (register provider)

- [ ] **Step 1: Implement PodbeanProvider**

Podbean episode URLs: `https://www.podbean.com/ew/pb-{ID}` or `https://{podcast}.podbean.com/e/{slug}/`

```typescript
import type { ContentId, ContentProvider } from './types.js';

const PODBEAN_EW_RE = /^https?:\/\/(?:www\.)?podbean\.com\/ew\/(pb-[a-zA-Z0-9]+)/;
const PODBEAN_EPISODE_RE = /^https?:\/\/([a-zA-Z0-9-]+)\.podbean\.com\/e\/([a-zA-Z0-9_-]+)/;

export class PodbeanProvider implements ContentProvider {
  readonly platform = 'podbean';
  readonly displayName = 'Podbean';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    const ewMatch = url.match(PODBEAN_EW_RE);
    if (ewMatch) return { platform: this.platform, type: 'episode', id: ewMatch[1] };
    const epMatch = url.match(PODBEAN_EPISODE_RE);
    if (epMatch)
      return { platform: this.platform, type: 'episode', id: `${epMatch[1]}/${epMatch[2]}` };
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [`podbean:${contentId.id}`, this.openUrl(contentId)];
  }

  contentKind(): string {
    return 'podbean:episode';
  }

  embedUrl(contentId: ContentId): string {
    // Podbean embed uses the episode page URL
    return `https://www.podbean.com/player-v2/?i=${contentId.id}&share=1&download=0&rtl=0&fonts=Verdana&skin=1&font-color=c9a256&btn-skin=3`;
  }

  openUrl(contentId: ContentId): string {
    if (contentId.id.startsWith('pb-')) {
      return `https://www.podbean.com/ew/${contentId.id}`;
    }
    return `https://${contentId.id.replace('/', '.podbean.com/e/')}/`;
  }
}
```

Note: Podbean's embed URL format needs verification. The Widget player URL may differ from the above. Read the Podbean embed documentation to confirm the correct iframe URL format. The `?i=` parameter or `/player/` path may vary.

- [ ] **Step 2: Write tests**

Test parseUrl with various Podbean URL formats, null for invalid URLs. Test toNostrTag, contentKind, openUrl.

- [ ] **Step 3: Register in registry.ts**

Add import and register in the providers array.

- [ ] **Step 4: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/podbean.ts src/lib/content/podbean.test.ts src/lib/content/registry.ts
git commit -m "Add Podbean content provider with URL parser"
```

---

## Task 2: Create PodbeanEmbed component

**Files:**

- Create: `src/lib/components/PodbeanEmbed.svelte`
- Modify: `src/types/global.d.ts` (PB type declarations)

- [ ] **Step 1: Add PB type declarations to global.d.ts**

The Podbean Widget API is nearly identical to SoundCloud's:

```typescript
declare class PB {
  constructor(iframe: HTMLIFrameElement | string);
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
  load(url: string, options?: Record<string, unknown>): void;
}

declare namespace PB {
  namespace Widget {
    const Events: {
      READY: string;
      PLAY: string;
      PAUSE: string;
      FINISH: string;
      PLAY_PROGRESS: string;
      SEEK: string;
      LOAD_PROGRESS: string;
    };
  }
}
```

- [ ] **Step 2: Create PodbeanEmbed.svelte**

Follow the SoundCloudEmbed pattern exactly:

- Load API script: `https://pbcdn1.podbean.com/fs1/player/api.js`
- Initialize: `new PB(iframeEl)` (instead of `SC.Widget(iframeEl)`)
- Events: `PB.Widget.Events.READY`, `PLAY`, `PAUSE`, `PLAY_PROGRESS`
- Cache duration on READY, track pause via PLAY/PAUSE events
- PLAY_PROGRESS → `updatePlayback(currentPosition, cachedDuration, cachedPaused)`
- Seek: `widget.seekTo(positionMs)`
- Cleanup: unbind all events on destroy

The component structure is nearly identical to SoundCloudEmbed.svelte — adapt it with Podbean API specifics.

- [ ] **Step 3: Run pre-commit validation**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/PodbeanEmbed.svelte src/types/global.d.ts
git commit -m "Add Podbean embed component with Widget API playback sync"
```

---

## Task 3: Integrate into content page

**Files:**

- Modify: `src/web/routes/[platform]/[type]/[id]/+page.svelte`

- [ ] **Step 1: Add PodbeanEmbed rendering**

```svelte
import PodbeanEmbed from '$lib/components/PodbeanEmbed.svelte';

{:else if showPlayer && platform === 'podbean'}
  <PodbeanEmbed {contentId} />
```

- [ ] **Step 2: Run pre-commit validation + E2E**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test
pnpm test:e2e
```

- [ ] **Step 3: Commit**

```bash
git add src/web/routes/\[platform\]/\[type\]/\[id\]/+page.svelte
git commit -m "Render Podbean embed on content page"
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
