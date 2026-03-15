# ニコニコ動画 Web 埋め込み Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ニコニコ動画の Web 埋め込み再生対応。postMessage API で再生同期。

**Architecture:** NiconicoProvider (ContentProvider) + NiconicoEmbed.svelte (postMessage 通信) + extractTimeParam 拡張

**Spec:** `docs/superpowers/specs/2026-03-16-niconico-embed-design.md`

---

## File Structure

### 新規作成

| ファイル | 責務 |
|---|---|
| `src/lib/content/niconico.ts` | NiconicoProvider |
| `src/lib/content/niconico.test.ts` | プロバイダーテスト |
| `src/lib/components/NiconicoEmbed.svelte` | 埋め込みコンポーネント |

### 変更

| ファイル | 変更内容 |
|---|---|
| `src/lib/content/registry.ts` | niconico を podcast/audio の前に追加 |
| `src/lib/content/url-utils.ts` | `extractTimeParam` に `from` パラメータ追加 |
| `src/lib/content/url-utils.test.ts` | `from` パラメータのテスト追加 |
| `src/web/routes/[platform]/[type]/[id]/+page.svelte` | NiconicoEmbed 条件分岐追加 |
| `src/web/routes/+page.svelte` | 入力例チップ追加 |
| `src/lib/components/TrackInput.svelte` | placeholder にニコニコ追加 |

---

## Task 1: NiconicoProvider + テスト

**Files:**
- Create: `src/lib/content/niconico.ts`
- Create: `src/lib/content/niconico.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/content/niconico.test.ts
import { describe, it, expect } from 'vitest';
import { niconico } from './niconico.js';

describe('NiconicoProvider.parseUrl', () => {
  it('matches www.nicovideo.jp/watch/smXXX', () => {
    const result = niconico.parseUrl('https://www.nicovideo.jp/watch/sm9');
    expect(result).toEqual({ platform: 'niconico', type: 'video', id: 'sm9' });
  });

  it('matches nicovideo.jp without www', () => {
    const result = niconico.parseUrl('https://nicovideo.jp/watch/sm9');
    expect(result).toEqual({ platform: 'niconico', type: 'video', id: 'sm9' });
  });

  it('matches sp.nicovideo.jp (mobile)', () => {
    const result = niconico.parseUrl('https://sp.nicovideo.jp/watch/sm9');
    expect(result).toEqual({ platform: 'niconico', type: 'video', id: 'sm9' });
  });

  it('matches so prefix (official)', () => {
    const result = niconico.parseUrl('https://www.nicovideo.jp/watch/so38016254');
    expect(result).toEqual({ platform: 'niconico', type: 'video', id: 'so38016254' });
  });

  it('matches nico.ms short URL', () => {
    const result = niconico.parseUrl('https://nico.ms/sm9');
    expect(result).toEqual({ platform: 'niconico', type: 'video', id: 'sm9' });
  });

  it('matches embed URL', () => {
    const result = niconico.parseUrl('https://embed.nicovideo.jp/watch/sm9');
    expect(result).toEqual({ platform: 'niconico', type: 'video', id: 'sm9' });
  });

  it('strips query params', () => {
    const result = niconico.parseUrl('https://www.nicovideo.jp/watch/sm9?from=30');
    expect(result).toEqual({ platform: 'niconico', type: 'video', id: 'sm9' });
  });

  it('rejects nm prefix', () => {
    expect(niconico.parseUrl('https://www.nicovideo.jp/watch/nm1234')).toBeNull();
  });

  it('rejects non-niconico URLs', () => {
    expect(niconico.parseUrl('https://youtube.com/watch?v=abc')).toBeNull();
    expect(niconico.parseUrl('https://example.com')).toBeNull();
  });

  it('matches http URLs', () => {
    const result = niconico.parseUrl('http://www.nicovideo.jp/watch/sm9');
    expect(result).toEqual({ platform: 'niconico', type: 'video', id: 'sm9' });
  });
});

describe('NiconicoProvider.toNostrTag', () => {
  it('returns niconico:video:<id> format', () => {
    const [value, hint] = niconico.toNostrTag({ platform: 'niconico', type: 'video', id: 'sm9' });
    expect(value).toBe('niconico:video:sm9');
    expect(hint).toBe('https://www.nicovideo.jp/watch/sm9');
  });
});

describe('NiconicoProvider.contentKind', () => {
  it('returns niconico:video', () => {
    expect(niconico.contentKind({ platform: 'niconico', type: 'video', id: 'sm9' })).toBe('niconico:video');
  });
});

describe('NiconicoProvider.embedUrl', () => {
  it('returns embed URL with jsapi params', () => {
    expect(niconico.embedUrl({ platform: 'niconico', type: 'video', id: 'sm9' }))
      .toBe('https://embed.nicovideo.jp/watch/sm9?jsapi=1&playerId=1');
  });
});

describe('NiconicoProvider.openUrl', () => {
  it('returns nicovideo.jp URL', () => {
    expect(niconico.openUrl({ platform: 'niconico', type: 'video', id: 'sm9' }))
      .toBe('https://www.nicovideo.jp/watch/sm9');
  });
});
```

- [ ] **Step 2: Implement NiconicoProvider**

```typescript
// src/lib/content/niconico.ts
import type { ContentId, ContentProvider } from './types.js';

const NICONICO_RE =
  /^https?:\/\/(?:www\.|sp\.)?nicovideo\.jp\/watch\/((?:sm|so)\d+)/;
const NICOMS_RE = /^https?:\/\/nico\.ms\/((?:sm|so)\d+)/;
const NICOEMBED_RE =
  /^https?:\/\/embed\.nicovideo\.jp\/watch\/((?:sm|so)\d+)/;

class NiconicoProvider implements ContentProvider {
  readonly platform = 'niconico';
  readonly displayName = 'ニコニコ動画';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    for (const re of [NICONICO_RE, NICOMS_RE, NICOEMBED_RE]) {
      const match = url.match(re);
      if (match?.[1]) {
        return { platform: this.platform, type: 'video', id: match[1] };
      }
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    return [
      `niconico:video:${contentId.id}`,
      `https://www.nicovideo.jp/watch/${contentId.id}`,
    ];
  }

  contentKind(): string {
    return 'niconico:video';
  }

  embedUrl(contentId: ContentId): string {
    return `https://embed.nicovideo.jp/watch/${contentId.id}?jsapi=1&playerId=1`;
  }

  openUrl(contentId: ContentId): string {
    return `https://www.nicovideo.jp/watch/${contentId.id}`;
  }
}

export const niconico = new NiconicoProvider();
```

- [ ] **Step 3: Run tests, lint, check, commit**

---

## Task 2: NiconicoEmbed.svelte

**Files:**
- Create: `src/lib/components/NiconicoEmbed.svelte`

- [ ] **Step 1: Create embed component**

```svelte
<script lang="ts">
  import type { ContentId } from '$lib/content/types.js';
  import { getProvider } from '$lib/content/registry.js';
  import { setContent, updatePlayback } from '$lib/stores/player.svelte.js';
  import { t } from '$lib/i18n/t.js';

  interface Props {
    contentId: ContentId;
  }

  let { contentId }: Props = $props();

  let iframeEl: HTMLIFrameElement | undefined = $state();
  let ready = $state(false);
  let error = $state(false);
  let isPaused = $state(true);

  const EMBED_ORIGIN_HTTPS = 'https://embed.nicovideo.jp';
  const EMBED_ORIGIN_HTTP = 'http://embed.nicovideo.jp';

  let embedSrc = $derived(getProvider('niconico')?.embedUrl(contentId) ?? '');

  function sendCommand(eventName: string, data: Record<string, unknown> = {}) {
    iframeEl?.contentWindow?.postMessage(
      { sourceConnectorType: 1, playerId: '1', eventName, data },
      EMBED_ORIGIN_HTTPS
    );
  }

  function handleMessage(e: MessageEvent) {
    if (e.origin !== EMBED_ORIGIN_HTTPS && e.origin !== EMBED_ORIGIN_HTTP) return;
    const { eventName, data } = e.data ?? {};
    if (!eventName) return;

    switch (eventName) {
      case 'loadComplete':
        ready = true;
        setContent(contentId);
        break;
      case 'playerStatusChange': {
        const status = data?.playerStatus;
        if (status === 2) isPaused = false;       // playing
        else if (status === 3 || status === 4) isPaused = true; // paused or ended
        break;
      }
      case 'playerMetadataChange': {
        const ct = data?.currentTime;
        const dur = data?.duration;
        if (ct !== undefined && dur !== undefined) {
          updatePlayback(ct * 1000, dur * 1000, isPaused);
        }
        break;
      }
      case 'error':
        error = true;
        break;
    }
  }

  function handleSeek(e: Event) {
    const detail = (e as CustomEvent<{ position: number }>).detail;
    if (detail.position >= 0) {
      sendCommand('seek', { time: detail.position / 1000 });
    }
  }

  $effect(() => {
    if (!iframeEl) return;
    window.addEventListener('message', handleMessage);
    window.addEventListener('resonote:seek', handleSeek);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('resonote:seek', handleSeek);
    };
  });
</script>

<div data-testid="niconico-embed" class="animate-fade-in w-full overflow-hidden rounded-2xl border border-border-subtle">
  {#if error}
    <div class="flex items-center justify-center bg-zinc-800 px-4 py-12">
      <p class="text-sm text-zinc-400">{t('embed.load_failed')}</p>
    </div>
  {:else}
    <div class="relative w-full" style="padding-bottom: 56.25%">
      <iframe
        bind:this={iframeEl}
        src={embedSrc}
        class="absolute inset-0 h-full w-full"
        allow="autoplay; fullscreen"
        allowfullscreen
        title="Niconico Player"
      ></iframe>
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Run lint, check, commit**

---

## Task 3: Registry + コンテンツページ統合

**Files:**
- Modify: `src/lib/content/registry.ts`
- Modify: `src/web/routes/[platform]/[type]/[id]/+page.svelte`

- [ ] **Step 1: Add to registry** (before podcast/audio)

```typescript
import { niconico } from './niconico.js';
// ... in providers array, before podcast:
  spreaker,
  niconico,
  podcast,
  audio,
```

- [ ] **Step 2: Add to content page**

Import:
```typescript
import NiconicoEmbed from '$lib/components/NiconicoEmbed.svelte';
```

Add condition (after spreaker, before the closing of the embed chain):
```svelte
{:else if showPlayer && platform === 'niconico'}
  <NiconicoEmbed {contentId} />
```

- [ ] **Step 3: Run all checks, commit**

---

## Task 4: extractTimeParam + ホームページ更新

**Files:**
- Modify: `src/lib/content/url-utils.ts`
- Modify: `src/lib/content/url-utils.test.ts`
- Modify: `src/web/routes/+page.svelte`
- Modify: `src/lib/components/TrackInput.svelte`

- [ ] **Step 1: Add `from` to extractTimeParam**

```typescript
const t = parsed.searchParams.get('t') ?? parsed.searchParams.get('start') ?? parsed.searchParams.get('from');
```

- [ ] **Step 2: Add test for `from` param**

```typescript
it('should extract ?from= parameter (niconico)', () => {
  expect(extractTimeParam('https://www.nicovideo.jp/watch/sm9?from=30')).toBe(30);
});
```

- [ ] **Step 3: Add niconico example chip to home page**

```typescript
{ icon: '🎥', platform: 'ニコニコ', label: 'レッツゴー！陰陽師', url: 'https://www.nicovideo.jp/watch/sm9' },
```

- [ ] **Step 4: Add placeholder rotation entry**

```typescript
'ニコニコ動画のURLを入力...',
```

- [ ] **Step 5: Run all checks (`pnpm format:check && pnpm lint && pnpm check && pnpm test`), commit**
