# AudioProvider / PodcastProvider Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HTML5 `<audio>` ベースの汎用音声/Podcast 再生機能を実装し、NIP-73 guid によるコメント紐付けと NIP-B0 ブックマークによる URL→guid マッピングを実現する。

**Architecture:** 2つの ContentProvider（AudioProvider + PodcastProvider）で URL を解析し、共通の AudioEmbed.svelte で再生。Cloudflare Pages Functions の API が RSS パース + kind:39701 署名を行い、クライアントがリレーに publish。d タグ検索で既知 URL は API スキップ。

**Tech Stack:** SvelteKit (Svelte 5 runes), rx-nostr, Tailwind CSS v4, Cloudflare Pages Functions, nostr-tools (署名), idb (IndexedDB)

**Spec:** `docs/superpowers/specs/2026-03-15-audio-provider-design.md`

---

## File Structure

### 新規作成

| ファイル                                       | 責務                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `src/lib/content/audio.ts`                     | AudioProvider — 音声直 URL の拡張子マッチ                             |
| `src/lib/content/podcast.ts`                   | PodcastProvider — RSS フィード URL マッチ + エピソード ContentId 構築 |
| `src/lib/content/url-utils.ts`                 | URL 正規化 + Base64url エンコード/デコードユーティリティ              |
| `src/lib/components/AudioEmbed.svelte`         | HTML5 `<audio>` カスタムプレイヤー UI                                 |
| `src/lib/components/PodcastEpisodeList.svelte` | エピソード一覧 UI                                                     |
| `src/lib/components/ResolveLoader.svelte`      | URL 解決中間ページ UI                                                 |
| `src/lib/content/podcast-resolver.ts`          | d タグ検索 + API 呼び出し調整                                         |
| `src/lib/nostr/pending-publishes.ts`           | 署名済みイベントの publish キュー（IndexedDB）                        |
| `src/web/routes/resolve/[id]/+page.svelte`     | /resolve/ ルート                                                      |
| `functions/api/podcast/resolve.ts`             | Cloudflare Pages Functions API エンドポイント                         |
| `src/lib/content/audio.test.ts`                | AudioProvider テスト                                                  |
| `src/lib/content/podcast.test.ts`              | PodcastProvider テスト                                                |
| `src/lib/content/url-utils.test.ts`            | URL ユーティリティテスト                                              |
| `src/lib/content/podcast-resolver.test.ts`     | Podcast resolver テスト                                               |
| `src/lib/nostr/pending-publishes.test.ts`      | Pending publishes テスト                                              |
| `functions/api/podcast/resolve.test.ts`        | API RSS パース・guid 解決テスト                                       |

### 変更

| ファイル                                             | 変更内容                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `src/lib/content/registry.ts`                        | AudioProvider + PodcastProvider をプロバイダー配列末尾に追加 |
| `src/lib/stores/comments.svelte.ts`                  | `addSubscription()` メソッド追加                             |
| `src/web/routes/[platform]/[type]/[id]/+page.svelte` | AudioEmbed / PodcastEpisodeList の条件分岐追加               |
| ~~`src/lib/nostr/event-db.ts`~~                      | ~~不要: pending-publishes は独立 DB として実装~~             |

---

## Chunk 1: URL ユーティリティ + AudioProvider + PodcastProvider

### Task 1: URL ユーティリティ

**Files:**

- Create: `src/lib/content/url-utils.ts`
- Test: `src/lib/content/url-utils.test.ts`

- [ ] **Step 1: Write failing tests for URL utilities**

```typescript
// src/lib/content/url-utils.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeUrl, toBase64url, fromBase64url, stripScheme } from '$lib/content/url-utils.js';

describe('normalizeUrl', () => {
  it('removes scheme', () => {
    expect(normalizeUrl('https://example.com/feed.xml')).toBe('example.com/feed.xml');
  });

  it('lowercases host', () => {
    expect(normalizeUrl('https://Example.COM/Feed.xml')).toBe('example.com/Feed.xml');
  });

  it('removes trailing slash', () => {
    expect(normalizeUrl('https://example.com/feed/')).toBe('example.com/feed');
  });

  it('removes query parameters', () => {
    expect(normalizeUrl('https://example.com/ep.mp3?token=abc')).toBe('example.com/ep.mp3');
  });

  it('removes fragment', () => {
    expect(normalizeUrl('https://example.com/ep.mp3#t=10')).toBe('example.com/ep.mp3');
  });

  it('handles http scheme', () => {
    expect(normalizeUrl('http://example.com/feed.xml')).toBe('example.com/feed.xml');
  });
});

describe('toBase64url / fromBase64url', () => {
  it('round-trips a URL', () => {
    const url = 'https://example.com/episodes/ep01.mp3';
    expect(fromBase64url(toBase64url(url))).toBe(url);
  });

  it('does not contain +, /, or =', () => {
    const encoded = toBase64url('https://example.com/a+b/c=d');
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

describe('stripScheme', () => {
  it('strips https://', () => {
    expect(stripScheme('https://example.com/path')).toBe('example.com/path');
  });

  it('strips http://', () => {
    expect(stripScheme('http://example.com/path')).toBe('example.com/path');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/content/url-utils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement url-utils.ts**

```typescript
// src/lib/content/url-utils.ts

export function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  const port = parsed.port ? `:${parsed.port}` : '';
  let path = parsed.pathname;
  if (path.endsWith('/') && path.length > 1) {
    path = path.slice(0, -1);
  }
  return `${host}${port}${path}`;
}

export function toBase64url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, '');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/content/url-utils.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/url-utils.ts src/lib/content/url-utils.test.ts
git commit -m "Add URL utility functions for AudioProvider"
```

---

### Task 2: AudioProvider

**Files:**

- Create: `src/lib/content/audio.ts`
- Test: `src/lib/content/audio.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/content/audio.test.ts
import { describe, it, expect } from 'vitest';
import { audio } from '$lib/content/audio.js';
import { fromBase64url } from '$lib/content/url-utils.js';

describe('AudioProvider.parseUrl', () => {
  const cases = [
    ['https://example.com/ep.mp3', 'mp3'],
    ['https://example.com/ep.m4a', 'm4a'],
    ['https://example.com/ep.ogg', 'ogg'],
    ['https://example.com/ep.wav', 'wav'],
    ['https://example.com/ep.opus', 'opus'],
    ['https://example.com/ep.flac', 'flac'],
    ['https://example.com/ep.aac', 'aac']
  ];

  it.each(cases)('matches %s', (url) => {
    const result = audio.parseUrl(url);
    expect(result).not.toBeNull();
    expect(result!.platform).toBe('audio');
    expect(result!.type).toBe('track');
  });

  it('strips query params before matching', () => {
    const result = audio.parseUrl('https://example.com/ep.mp3?token=abc');
    expect(result).not.toBeNull();
  });

  it('rejects non-audio URLs', () => {
    expect(audio.parseUrl('https://example.com/page.html')).toBeNull();
    expect(audio.parseUrl('https://spotify.com/track/abc')).toBeNull();
  });

  it('id is base64url encoded URL', () => {
    const url = 'https://example.com/ep.mp3';
    const result = audio.parseUrl(url);
    expect(fromBase64url(result!.id)).toBe(url);
  });
});

describe('AudioProvider.toNostrTag', () => {
  it('returns audio:<url> format', () => {
    const url = 'https://example.com/ep.mp3';
    const result = audio.parseUrl(url)!;
    const [value, hint] = audio.toNostrTag(result);
    expect(value).toBe(`audio:${url}`);
    expect(hint).toBe(url);
  });
});

describe('AudioProvider.contentKind', () => {
  it('returns audio', () => {
    const result = audio.parseUrl('https://example.com/ep.mp3')!;
    expect(audio.contentKind(result)).toBe('audio');
  });
});

describe('AudioProvider.embedUrl', () => {
  it('returns decoded audio URL', () => {
    const url = 'https://example.com/ep.mp3';
    const result = audio.parseUrl(url)!;
    expect(audio.embedUrl(result)).toBe(url);
  });
});

describe('AudioProvider.openUrl', () => {
  it('returns decoded audio URL', () => {
    const url = 'https://example.com/ep.mp3';
    const result = audio.parseUrl(url)!;
    expect(audio.openUrl(result)).toBe(url);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/content/audio.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement AudioProvider**

```typescript
// src/lib/content/audio.ts
import type { ContentId, ContentProvider } from './types.js';
import { toBase64url, fromBase64url } from './url-utils.js';

const AUDIO_EXT_RE = /\.(mp3|m4a|ogg|wav|opus|flac|aac)$/i;

class AudioProvider implements ContentProvider {
  readonly platform = 'audio';
  readonly displayName = 'Audio';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      return null;
    }
    if (!AUDIO_EXT_RE.test(pathname)) return null;
    return { platform: 'audio', type: 'track', id: toBase64url(url) };
  }

  toNostrTag(contentId: ContentId): [string, string] {
    const url = fromBase64url(contentId.id);
    return [`audio:${url}`, url];
  }

  contentKind(): string {
    return 'audio';
  }

  embedUrl(contentId: ContentId): string {
    return fromBase64url(contentId.id);
  }

  openUrl(contentId: ContentId): string {
    return fromBase64url(contentId.id);
  }
}

export const audio = new AudioProvider();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/content/audio.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/audio.ts src/lib/content/audio.test.ts
git commit -m "Add AudioProvider for direct audio URL matching"
```

---

### Task 3: PodcastProvider

**Files:**

- Create: `src/lib/content/podcast.ts`
- Test: `src/lib/content/podcast.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/content/podcast.test.ts
import { describe, it, expect } from 'vitest';
import { podcast, buildEpisodeContentId } from '$lib/content/podcast.js';
import { toBase64url, fromBase64url } from '$lib/content/url-utils.js';

describe('PodcastProvider.parseUrl', () => {
  it('matches .rss URLs', () => {
    const result = podcast.parseUrl('https://example.com/podcast.rss');
    expect(result).not.toBeNull();
    expect(result!.platform).toBe('podcast');
    expect(result!.type).toBe('feed');
  });

  it('matches .xml URLs', () => {
    const result = podcast.parseUrl('https://example.com/feed.xml');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('feed');
  });

  it('matches .atom URLs', () => {
    const result = podcast.parseUrl('https://example.com/feed.atom');
    expect(result).not.toBeNull();
  });

  it('matches /feed path', () => {
    const result = podcast.parseUrl('https://example.com/feed');
    expect(result).not.toBeNull();
  });

  it('matches /rss path', () => {
    const result = podcast.parseUrl('https://example.com/rss');
    expect(result).not.toBeNull();
  });

  it('rejects non-feed URLs', () => {
    expect(podcast.parseUrl('https://example.com/page.html')).toBeNull();
    expect(podcast.parseUrl('https://example.com/ep.mp3')).toBeNull();
  });

  it('id is base64url encoded feed URL', () => {
    const url = 'https://example.com/feed.xml';
    const result = podcast.parseUrl(url)!;
    expect(fromBase64url(result.id)).toBe(url);
  });
});

describe('buildEpisodeContentId', () => {
  it('creates composite id with feedBase64:guidBase64', () => {
    const feedUrl = 'https://example.com/feed.xml';
    const guid = 'abc-123-def';
    const result = buildEpisodeContentId(feedUrl, guid);
    expect(result.platform).toBe('podcast');
    expect(result.type).toBe('episode');
    const [feedPart, guidPart] = result.id.split(':');
    expect(fromBase64url(feedPart)).toBe(feedUrl);
    expect(fromBase64url(guidPart)).toBe(guid);
  });
});

describe('PodcastProvider.toNostrTag (episode)', () => {
  it('returns podcast:item:guid format with feed URL hint', () => {
    const feedUrl = 'https://example.com/feed.xml';
    const guid = 'abc-123-def';
    const contentId = buildEpisodeContentId(feedUrl, guid);
    const [value, hint] = podcast.toNostrTag(contentId);
    expect(value).toBe('podcast:item:guid:abc-123-def');
    expect(hint).toBe(feedUrl);
  });
});

describe('PodcastProvider.contentKind', () => {
  it('returns podcast:feed for feed type', () => {
    const result = podcast.parseUrl('https://example.com/feed.xml')!;
    expect(podcast.contentKind(result)).toBe('podcast:feed');
  });

  it('returns podcast:item:guid for episode type', () => {
    const contentId = buildEpisodeContentId('https://example.com/feed.xml', 'guid-1');
    expect(podcast.contentKind(contentId)).toBe('podcast:item:guid');
  });
});

describe('PodcastProvider.embedUrl', () => {
  it('returns null for feed', () => {
    const result = podcast.parseUrl('https://example.com/feed.xml')!;
    expect(podcast.embedUrl(result)).toBeNull();
  });
});

describe('PodcastProvider.openUrl', () => {
  it('returns feed URL for feed type', () => {
    const url = 'https://example.com/feed.xml';
    const result = podcast.parseUrl(url)!;
    expect(podcast.openUrl(result)).toBe(url);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/content/podcast.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PodcastProvider**

```typescript
// src/lib/content/podcast.ts
import type { ContentId, ContentProvider } from './types.js';
import { toBase64url, fromBase64url } from './url-utils.js';

const FEED_PATH_RE = /\.(rss|xml|atom|json)$/i;
const FEED_SEGMENT_RE = /\/(feed|rss|atom)\/?$/i;

class PodcastProvider implements ContentProvider {
  readonly platform = 'podcast';
  readonly displayName = 'Podcast';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      return null;
    }
    if (!FEED_PATH_RE.test(pathname) && !FEED_SEGMENT_RE.test(pathname)) return null;
    return { platform: 'podcast', type: 'feed', id: toBase64url(url) };
  }

  toNostrTag(contentId: ContentId): [string, string] {
    if (contentId.type === 'episode') {
      const [feedPart, guidPart] = contentId.id.split(':');
      const feedUrl = fromBase64url(feedPart);
      const guid = fromBase64url(guidPart);
      return [`podcast:item:guid:${guid}`, feedUrl];
    }
    // feed type
    const feedUrl = fromBase64url(contentId.id);
    return [`podcast:guid:${feedUrl}`, feedUrl];
  }

  contentKind(contentId: ContentId): string {
    return contentId.type === 'episode' ? 'podcast:item:guid' : 'podcast:feed';
  }

  embedUrl(contentId: ContentId): string | null {
    if (contentId.type === 'feed') return null;
    // episode: embedUrl is set externally via enclosureUrl (stored separately)
    // Return null here; AudioEmbed gets the URL from podcast-resolver
    return null;
  }

  openUrl(contentId: ContentId): string {
    if (contentId.type === 'episode') {
      const [feedPart] = contentId.id.split(':');
      return fromBase64url(feedPart);
    }
    return fromBase64url(contentId.id);
  }
}

export const podcast = new PodcastProvider();

export function buildEpisodeContentId(feedUrl: string, guid: string): ContentId {
  return {
    platform: 'podcast',
    type: 'episode',
    id: `${toBase64url(feedUrl)}:${toBase64url(guid)}`
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/content/podcast.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/podcast.ts src/lib/content/podcast.test.ts
git commit -m "Add PodcastProvider for RSS feed URL matching"
```

---

### Task 4: Registry 登録

**Files:**

- Modify: `src/lib/content/registry.ts`

- [ ] **Step 1: Add providers to registry**

`src/lib/content/registry.ts` を編集:

インポート追加:

```typescript
import { podcast } from './podcast.js';
import { audio } from './audio.js';
```

プロバイダー配列末尾に追加（既存プロバイダーの後）:

```typescript
const providers: ContentProvider[] = [
  spotify,
  youtube,
  vimeo,
  netflix,
  primeVideo,
  disneyPlus,
  appleMusic,
  soundcloud,
  fountainFm,
  abema,
  tver,
  uNext,
  mixcloud,
  spreaker,
  podcast, // フィード URL パターン
  audio // 最後: 拡張子フォールバック
];
```

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `pnpm test`
Expected: PASS (all existing + new tests)

- [ ] **Step 3: Run lint and check**

Run: `pnpm format:check && pnpm lint && pnpm check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/content/registry.ts
git commit -m "Register AudioProvider and PodcastProvider in content registry"
```

---

## Chunk 2: AudioEmbed コンポーネント

### Task 5: AudioEmbed.svelte

**Files:**

- Create: `src/lib/components/AudioEmbed.svelte`

- [ ] **Step 1: Create AudioEmbed component**

```svelte
<!-- src/lib/components/AudioEmbed.svelte -->
<script lang="ts">
  import type { ContentId } from '$lib/content/types.js';
  import { fromBase64url } from '$lib/content/url-utils.js';
  import { setContent, updatePlayback } from '$lib/stores/player.svelte.js';

  interface Props {
    contentId: ContentId;
    enclosureUrl?: string;
  }

  let { contentId, enclosureUrl }: Props = $props();

  let audioEl: HTMLAudioElement | undefined = $state();
  let ready = $state(false);
  let error = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let paused = $state(true);
  let volume = $state(1);
  let seeking = $state(false);

  let audioSrc = $derived(
    enclosureUrl ?? (contentId.platform === 'audio' ? fromBase64url(contentId.id) : null)
  );

  function formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

  function handleSeek(e: Event) {
    const detail = (e as CustomEvent<{ position: number }>).detail;
    if (audioEl) {
      audioEl.currentTime = detail.position / 1000;
    }
  }

  function onSliderInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = Number(target.value);
    seeking = true;
    currentTime = value;
  }

  function onSliderChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = Number(target.value);
    if (audioEl) {
      audioEl.currentTime = value / 1000;
    }
    seeking = false;
  }

  function togglePlay() {
    if (!audioEl) return;
    if (audioEl.paused) {
      audioEl.play();
    } else {
      audioEl.pause();
    }
  }

  function onVolumeChange(e: Event) {
    const target = e.target as HTMLInputElement;
    volume = Number(target.value);
    if (audioEl) audioEl.volume = volume;
  }

  $effect(() => {
    if (!audioEl || !audioSrc) return;

    setContent(contentId);

    const seekHandler = handleSeek;
    window.addEventListener('resonote:seek', seekHandler);

    const onLoadedMetadata = () => {
      duration = audioEl!.duration * 1000;
      ready = true;
    };
    const onTimeUpdate = () => {
      if (!seeking) {
        currentTime = audioEl!.currentTime * 1000;
      }
      updatePlayback(audioEl!.currentTime * 1000, audioEl!.duration * 1000 || 0, audioEl!.paused);
    };
    const onPlay = () => {
      paused = false;
    };
    const onPause = () => {
      paused = true;
    };
    const onError = () => {
      error = true;
    };

    audioEl.addEventListener('loadedmetadata', onLoadedMetadata);
    audioEl.addEventListener('timeupdate', onTimeUpdate);
    audioEl.addEventListener('play', onPlay);
    audioEl.addEventListener('pause', onPause);
    audioEl.addEventListener('error', onError);

    return () => {
      window.removeEventListener('resonote:seek', seekHandler);
      audioEl?.removeEventListener('loadedmetadata', onLoadedMetadata);
      audioEl?.removeEventListener('timeupdate', onTimeUpdate);
      audioEl?.removeEventListener('play', onPlay);
      audioEl?.removeEventListener('pause', onPause);
      audioEl?.removeEventListener('error', onError);
    };
  });
</script>

{#if error}
  <div class="flex items-center justify-center rounded-lg bg-zinc-800 p-8 text-zinc-400">
    <p>音声を読み込めませんでした</p>
  </div>
{:else}
  <div class="flex flex-col gap-2 rounded-lg bg-zinc-800 p-4">
    {#if audioSrc}
      <audio bind:this={audioEl} src={audioSrc} preload="metadata"></audio>
    {/if}

    <!-- Controls -->
    <div class="flex items-center gap-3">
      <!-- Play/Pause -->
      <button
        onclick={togglePlay}
        disabled={!ready}
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-600 text-white transition hover:bg-amber-500 disabled:opacity-50"
      >
        {#if paused}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="h-5 w-5"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="h-5 w-5"
          >
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        {/if}
      </button>

      <!-- Time + Seek -->
      <span class="w-12 shrink-0 text-right text-xs text-zinc-400">{formatTime(currentTime)}</span>
      <input
        type="range"
        min="0"
        max={duration}
        value={currentTime}
        oninput={onSliderInput}
        onchange={onSliderChange}
        disabled={!ready}
        class="h-1 flex-1 cursor-pointer appearance-none rounded bg-zinc-600 accent-amber-500"
      />
      <span class="w-12 shrink-0 text-xs text-zinc-400">{formatTime(duration)}</span>

      <!-- Volume -->
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={volume}
        oninput={onVolumeChange}
        class="h-1 w-20 shrink-0 cursor-pointer appearance-none rounded bg-zinc-600 accent-amber-500"
      />
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Run lint and check**

Run: `pnpm format:check && pnpm lint && pnpm check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/AudioEmbed.svelte
git commit -m "Add AudioEmbed component with custom HTML5 audio player UI"
```

---

## Chunk 3: コンテンツページ統合 + ルーティング

### Task 6: コンテンツページに AudioEmbed / PodcastEpisodeList 条件分岐追加

**Files:**

- Modify: `src/web/routes/[platform]/[type]/[id]/+page.svelte`

- [ ] **Step 1: Add import and conditional rendering**

`src/web/routes/[platform]/[type]/[id]/+page.svelte` に以下を追加:

インポート追加:

```typescript
import AudioEmbed from '$lib/components/AudioEmbed.svelte';
import PodcastEpisodeList from '$lib/components/PodcastEpisodeList.svelte';
```

プレイヤー描画セクション（既存の `{#if platform === 'spotify'}` ブロック）を修正。**platform/type チェックを embedUrl ベース判定より先に追加**:

```svelte
{#if platform === 'podcast' && contentType === 'feed'}
  <PodcastEpisodeList {contentId} />
{:else if platform === 'audio' || (platform === 'podcast' && contentType === 'episode')}
  <AudioEmbed {contentId} enclosureUrl={resolvedEnclosureUrl} />
{:else if platform === 'spotify'}
  <SpotifyEmbed {contentId} />
  <!-- ...existing else-if chain... -->
{/if}
```

コメントストア初期化の `$effect` で、`type === 'feed'` の場合はコメント購読をスキップ（フィードはコメント対象外）:

```typescript
if (!isValid || !provider || isCollection || contentType === 'feed') return;
```

podcast episode の enclosure URL 解決用の state と $effect を追加:

```typescript
import { resolveByDTag } from '$lib/content/podcast-resolver.js';
import { fromBase64url } from '$lib/content/url-utils.js';

let resolvedEnclosureUrl = $state<string | undefined>();

$effect(() => {
  if (platform === 'audio') {
    // AudioProvider: id から直接デコード
    resolvedEnclosureUrl = fromBase64url(contentIdParam);
  } else if (platform === 'podcast' && contentType === 'episode') {
    // PodcastProvider: i タグの hint から enclosure URL を取得
    // episode id は feedBase64:guidBase64 形式
    // d タグ検索で kind:39701 を引き、enclosure URL を取得
    resolvedEnclosureUrl = undefined; // loading
    resolveEpisodeEnclosure(contentIdParam);
  }
});

async function resolveEpisodeEnclosure(episodeId: string) {
  // episodeId = feedBase64:guidBase64
  // フィード URL + guid から enclosure URL を API で取得
  // または d タグ検索で kind:39701 の r タグから取得
  const [feedPart, guidPart] = episodeId.split(':');
  const feedUrl = fromBase64url(feedPart);
  const guid = fromBase64url(guidPart);

  // まず d タグ検索（enclosure URL は r タグの最初の値）
  // 失敗時は API にフォールバック
  const { resolveByApi } = await import('$lib/content/podcast-resolver.js');
  // 実装の詳細は podcast-resolver.ts に委譲
}
```

注: 完全な実装は Task 10 (podcast-resolver) と Task 13 (統合) で行う。ここではプレースホルダーとして enclosureUrl の state と props 受け渡しを準備。

- [ ] **Step 2: Create PodcastEpisodeList placeholder**

```svelte
<!-- src/lib/components/PodcastEpisodeList.svelte -->
<script lang="ts">
  import type { ContentId } from '$lib/content/types.js';

  interface Props {
    contentId: ContentId;
  }

  let { contentId }: Props = $props();
</script>

<div class="rounded-lg bg-zinc-800 p-4">
  <p class="text-zinc-400">エピソード一覧を読み込み中...</p>
  <!-- API 統合は Task 11 で実装 -->
</div>
```

- [ ] **Step 3: Run lint and check**

Run: `pnpm format:check && pnpm lint && pnpm check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/web/routes/\[platform\]/\[type\]/\[id\]/+page.svelte src/lib/components/PodcastEpisodeList.svelte
git commit -m "Integrate AudioEmbed and PodcastEpisodeList into content page"
```

---

### Task 7: /resolve/ ルート

**Files:**

- Create: `src/web/routes/resolve/[id]/+page.svelte`
- Create: `src/lib/components/ResolveLoader.svelte`

- [ ] **Step 1: Create ResolveLoader component**

```svelte
<!-- src/lib/components/ResolveLoader.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { fromBase64url, toBase64url } from '$lib/content/url-utils.js';

  interface Props {
    encodedUrl: string;
  }

  let { encodedUrl }: Props = $props();

  let status = $state<'loading' | 'error'>('loading');
  let errorMessage = $state('');

  $effect(() => {
    const url = fromBase64url(encodedUrl);
    resolve(url);
  });

  async function resolve(url: string) {
    try {
      const res = await fetch(`/api/podcast/resolve?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error('fetch_failed');
      const data = await res.json();

      if (data.error) {
        status = 'error';
        errorMessage =
          data.error === 'rss_not_found'
            ? 'このURLからポッドキャストが見つかりませんでした'
            : 'URLの解析に失敗しました';
        return;
      }

      if (data.type === 'redirect' && data.feedUrl) {
        goto(`/podcast/feed/${toBase64url(data.feedUrl)}`);
        return;
      }
    } catch {
      status = 'error';
      errorMessage = 'URLの解析に失敗しました';
    }
  }
</script>

<div class="flex min-h-[200px] items-center justify-center">
  {#if status === 'loading'}
    <div class="flex flex-col items-center gap-3">
      <div
        class="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent"
      ></div>
      <p class="text-zinc-400">URLを解析中...</p>
    </div>
  {:else}
    <div class="rounded-lg bg-zinc-800 p-6 text-center">
      <p class="text-zinc-400">{errorMessage}</p>
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Create resolve route page**

```svelte
<!-- src/web/routes/resolve/[id]/+page.svelte -->
<script lang="ts">
  import { page } from '$app/state';
  import ResolveLoader from '$lib/components/ResolveLoader.svelte';

  let encodedUrl = $derived(page.params.id ?? '');
</script>

<svelte:head>
  <title>URL 解析中... | Resonote</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-8">
  {#if encodedUrl}
    <ResolveLoader {encodedUrl} />
  {:else}
    <p class="text-center text-zinc-400">無効なURLです</p>
  {/if}
</div>
```

- [ ] **Step 3: Run lint and check**

Run: `pnpm format:check && pnpm lint && pnpm check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/ResolveLoader.svelte src/web/routes/resolve/\[id\]/+page.svelte
git commit -m "Add /resolve/ route for podcast site URL auto-discovery"
```

---

## Chunk 4: Pending Publishes + コメントストア拡張

### Task 8: Pending Publishes Store

**Files:**

- Create: `src/lib/nostr/pending-publishes.ts`
- Test: `src/lib/nostr/pending-publishes.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/nostr/pending-publishes.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  addPendingPublish,
  getPendingPublishes,
  removePendingPublish,
  cleanExpired,
  PENDING_TTL_MS
} from '$lib/nostr/pending-publishes.js';

beforeEach(async () => {
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    if (db.name) indexedDB.deleteDatabase(db.name);
  }
});

describe('pending-publishes', () => {
  const mockEvent = {
    id: 'abc123',
    kind: 39701,
    pubkey: 'system-pub',
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', 'example.com/ep.mp3']],
    content: '',
    sig: 'sig123'
  };

  it('adds and retrieves pending publish', async () => {
    await addPendingPublish(mockEvent);
    const pending = await getPendingPublishes();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('abc123');
  });

  it('removes a pending publish by id', async () => {
    await addPendingPublish(mockEvent);
    await removePendingPublish('abc123');
    const pending = await getPendingPublishes();
    expect(pending).toHaveLength(0);
  });

  it('cleanExpired removes events older than TTL', async () => {
    const oldEvent = {
      ...mockEvent,
      id: 'old1',
      created_at: Math.floor(Date.now() / 1000) - PENDING_TTL_MS / 1000 - 1
    };
    await addPendingPublish(oldEvent);
    await addPendingPublish(mockEvent);
    await cleanExpired();
    const pending = await getPendingPublishes();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('abc123');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/nostr/pending-publishes.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement pending-publishes.ts**

```typescript
// src/lib/nostr/pending-publishes.ts
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'resonote-pending-publishes';
const DB_VERSION = 1;
const STORE_NAME = 'events';

export const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface PendingEvent {
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
  sig: string;
}

let dbPromise: Promise<IDBPDatabase> | undefined;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      }
    });
  }
  return dbPromise;
}

export async function addPendingPublish(event: PendingEvent): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, event);
}

export async function getPendingPublishes(): Promise<PendingEvent[]> {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}

export async function removePendingPublish(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

export async function cleanExpired(): Promise<void> {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - PENDING_TTL_MS / 1000;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const event of all) {
    if (event.created_at < cutoff) {
      tx.store.delete(event.id);
    }
  }
  await tx.done;
}

export function resetPendingDB(): void {
  dbPromise = undefined;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/nostr/pending-publishes.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/nostr/pending-publishes.ts src/lib/nostr/pending-publishes.test.ts
git commit -m "Add pending-publishes IndexedDB store for signed event queue"
```

---

### Task 9: コメントストア addSubscription 拡張

**Files:**

- Modify: `src/lib/stores/comments.svelte.ts`

- [ ] **Step 1: Add addSubscription method to createCommentsStore**

`src/lib/stores/comments.svelte.ts` の `createCommentsStore()` 内、`destroy()` 定義の前に `addSubscription()` メソッドを追加:

```typescript
// addSubscription は subscribe() の後に呼ばれる前提
// subscribe() 内で確保した rxNostr / eventsDB をクロージャ外に持ち上げる
//
// createCommentsStore のトップレベルに追加:
let rxNostrRef: RxNostr | undefined;
let eventsDBRef: EventsDB | undefined;
//
// subscribe() 内で既存の変数代入後に追加:
// rxNostrRef = rxNostr;
// eventsDBRef = eventsDB;

async function addSubscription(idValue: string, _kind: string): Promise<void> {
  if (!rxNostrRef || !eventsDBRef) return;

  // rx-nostr モジュールの動的 import（subscribe() と同じパターン）
  const { createRxBackwardReq, createRxForwardReq, uniq } = await import('rx-nostr');
  const { merge } = await import('rxjs');

  // DB cache restore for additional tag
  const cachedEvents = await eventsDBRef.getByTagValue(`I:${idValue}`);
  for (const ev of cachedEvents) {
    if (ev.kind === COMMENT_KIND && !commentIds.has(ev.id) && !deletedIds.has(ev.id)) {
      commentIds.add(ev.id);
      const comment = buildCommentFromEvent(ev);
      if (comment) commentsRaw.push(comment);
    }
    if (ev.kind === REACTION_KIND && !reactionIds.has(ev.id) && !deletedIds.has(ev.id)) {
      reactionIds.add(ev.id);
      const reaction = buildReactionFromEvent(ev);
      if (reaction) addReaction(reaction);
    }
  }

  // Additional backward + forward subscriptions（既存 subscribe() と同一パターン）
  const commentBwReq = createRxBackwardReq();
  const commentFwReq = createRxForwardReq();

  const commentBw = rxNostrRef.use(commentBwReq).pipe(uniq());
  const commentFw = rxNostrRef.use(commentFwReq).pipe(uniq());

  const sub1 = merge(commentBw, commentFw).subscribe((packet) => {
    const ev = packet.event;
    eventsDBRef?.put(ev);
    if (commentIds.has(ev.id) || deletedIds.has(ev.id)) return;
    commentIds.add(ev.id);
    const comment = buildCommentFromEvent(ev);
    if (comment) commentsRaw.push(comment);
  });

  // リレー指定なし（rxNostr のデフォルトリレーを使用、既存パターンに合わせる）
  commentBwReq.emit({ kinds: [COMMENT_KIND], '#I': [idValue] });
  commentBwReq.over();
  commentFwReq.emit({ kinds: [COMMENT_KIND], '#I': [idValue] });

  const reactionBwReq = createRxBackwardReq();
  const reactionFwReq = createRxForwardReq();

  const sub2 = merge(
    rxNostrRef.use(reactionBwReq).pipe(uniq()),
    rxNostrRef.use(reactionFwReq).pipe(uniq())
  ).subscribe((packet) => {
    const ev = packet.event;
    eventsDBRef?.put(ev);
    if (reactionIds.has(ev.id) || deletedIds.has(ev.id)) return;
    reactionIds.add(ev.id);
    const reaction = buildReactionFromEvent(ev);
    if (reaction) addReaction(reaction);
  });

  reactionBwReq.emit({ kinds: [REACTION_KIND], '#I': [idValue] });
  reactionBwReq.over();
  reactionFwReq.emit({ kinds: [REACTION_KIND], '#I': [idValue] });

  subscriptions.push(
    { unsubscribe: () => sub1.unsubscribe() },
    { unsubscribe: () => sub2.unsubscribe() }
  );
}
```

戻り値オブジェクトに `addSubscription` を追加:

```typescript
return {
  get comments() {
    return visibleComments;
  },
  get reactionIndex() {
    return reactionIndex;
  },
  get deletedIds() {
    return deletedIds;
  },
  subscribe,
  addSubscription,
  destroy
};
```

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 3: Run lint and check**

Run: `pnpm format:check && pnpm lint && pnpm check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/stores/comments.svelte.ts
git commit -m "Add addSubscription to comments store for dual-tag comment merge"
```

---

## Chunk 5: Podcast Resolver + API

### Task 10: Podcast Resolver（クライアント側）

**Files:**

- Create: `src/lib/content/podcast-resolver.ts`
- Test: `src/lib/content/podcast-resolver.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/content/podcast-resolver.test.ts
import { describe, it, expect } from 'vitest';
import { parseDTagEvent, SYSTEM_PUBKEY } from '$lib/content/podcast-resolver.js';

describe('parseDTagEvent', () => {
  it('extracts guid and feedUrl from kind:39701 tags', () => {
    const event = {
      kind: 39701,
      tags: [
        ['d', 'example.com/ep.mp3'],
        ['i', 'podcast:item:guid:abc-123', 'https://example.com/ep.mp3'],
        ['i', 'podcast:guid:feed-guid-1', 'https://example.com/feed.xml'],
        ['k', 'podcast:item:guid']
      ]
    };
    const result = parseDTagEvent(event);
    expect(result).not.toBeNull();
    expect(result!.guid).toBe('abc-123');
    expect(result!.feedUrl).toBe('https://example.com/feed.xml');
    expect(result!.enclosureUrl).toBe('https://example.com/ep.mp3');
  });

  it('returns null for event without podcast:item:guid tag', () => {
    const event = {
      kind: 39701,
      tags: [
        ['d', 'example.com/feed.xml'],
        ['k', 'podcast:guid']
      ]
    };
    expect(parseDTagEvent(event)).toBeNull();
  });
});

describe('SYSTEM_PUBKEY', () => {
  it('is a non-empty string', () => {
    expect(SYSTEM_PUBKEY).toBeTruthy();
    expect(typeof SYSTEM_PUBKEY).toBe('string');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/content/podcast-resolver.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement podcast-resolver.ts**

```typescript
// src/lib/content/podcast-resolver.ts
import { normalizeUrl } from './url-utils.js';

// システム鍵ペアの生成: `npx nostr-tools keygen` 等で生成し、
// 秘密鍵を Cloudflare Pages の環境変数 SYSTEM_NOSTR_PRIVKEY に設定、
// 公開鍵をここに記載する。
// TODO: デプロイ前に実際の pubkey に置き換えること。
export const SYSTEM_PUBKEY = '__SYSTEM_PUBKEY_PLACEHOLDER__';

interface DTagResult {
  guid: string;
  feedUrl: string;
  enclosureUrl: string;
}

export function parseDTagEvent(event: { kind: number; tags: string[][] }): DTagResult | null {
  let guid: string | null = null;
  let enclosureUrl: string | null = null;
  let feedUrl: string | null = null;

  for (const tag of event.tags) {
    if (tag[0] !== 'i') continue;
    const value = tag[1] ?? '';
    const hint = tag[2] ?? '';

    if (value.startsWith('podcast:item:guid:')) {
      guid = value.slice('podcast:item:guid:'.length);
      enclosureUrl = hint;
    } else if (value.startsWith('podcast:guid:')) {
      feedUrl = hint;
    }
  }

  if (!guid || !feedUrl || !enclosureUrl) return null;
  return { guid, feedUrl, enclosureUrl };
}

export async function resolveByDTag(
  url: string,
  rxNostrQuery: (filter: Record<string, unknown>) => Promise<{ tags: string[][] } | null>
): Promise<DTagResult | null> {
  const normalized = normalizeUrl(url);
  const event = await rxNostrQuery({
    kinds: [39701],
    authors: [SYSTEM_PUBKEY],
    '#d': [normalized]
  });
  if (!event) return null;
  return parseDTagEvent({ kind: 39701, tags: event.tags });
}

export interface ResolveApiResponse {
  type: 'episode' | 'feed' | 'redirect';
  feed?: { guid: string; title: string; feedUrl: string; image: string };
  episode?: {
    guid: string;
    title: string;
    enclosureUrl: string;
    duration: number;
    publishedAt: number;
  };
  episodes?: {
    guid: string;
    title: string;
    enclosureUrl: string;
    duration: number;
    publishedAt: number;
  }[];
  feedUrl?: string;
  signedEvents?: Record<string, unknown>[];
  error?: string;
}

export async function resolveByApi(url: string): Promise<ResolveApiResponse> {
  const res = await fetch(`/api/podcast/resolve?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    return { type: 'episode', error: 'fetch_failed' };
  }
  return res.json();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/content/podcast-resolver.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/podcast-resolver.ts src/lib/content/podcast-resolver.test.ts
git commit -m "Add podcast-resolver for d-tag search and API coordination"
```

---

### Task 11: PodcastEpisodeList 完全実装

**Files:**

- Modify: `src/lib/components/PodcastEpisodeList.svelte`

- [ ] **Step 1: Implement full episode list with API integration**

```svelte
<!-- src/lib/components/PodcastEpisodeList.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import type { ContentId } from '$lib/content/types.js';
  import { fromBase64url, toBase64url } from '$lib/content/url-utils.js';
  import { resolveByApi, type ResolveApiResponse } from '$lib/content/podcast-resolver.js';
  import { addPendingPublish } from '$lib/nostr/pending-publishes.js';
  import { getRxNostr } from '$lib/nostr/client.js';

  interface Props {
    contentId: ContentId;
  }

  let { contentId }: Props = $props();

  let status = $state<'loading' | 'loaded' | 'error'>('loading');
  let feedTitle = $state('');
  let feedImage = $state('');
  let episodes = $state<ResolveApiResponse['episodes']>([]);
  let errorMessage = $state('');

  $effect(() => {
    const feedUrl = fromBase64url(contentId.id);
    loadFeed(feedUrl);
  });

  async function loadFeed(feedUrl: string) {
    status = 'loading';
    const data = await resolveByApi(feedUrl);

    if (data.error) {
      status = 'error';
      errorMessage =
        data.error === 'rss_not_found'
          ? 'フィードが見つかりませんでした'
          : 'フィードの取得に失敗しました';
      return;
    }

    if (data.feed) {
      feedTitle = data.feed.title;
      feedImage = data.feed.image;
    }
    episodes = data.episodes ?? [];
    status = 'loaded';

    // Publish signed events in background
    if (data.signedEvents) {
      for (const ev of data.signedEvents) {
        publishOrQueue(ev);
      }
    }
  }

  async function publishOrQueue(event: Record<string, unknown>) {
    // rx-nostr の send()/cast() は EventParameters を受け取り内部で署名するため、
    // pre-signed イベントには使えない（ユーザー鍵で再署名されてしまう）。
    // nostr-tools の Relay.publish() で直接 WebSocket 送信する。
    try {
      const { Relay } = await import('nostr-tools/relay');
      const { getDefaultRelays } = await import('$lib/nostr/relays.js');
      const relays = getDefaultRelays();
      const published = await Promise.any(
        relays.map(async (url) => {
          const relay = await Relay.connect(url);
          try {
            await relay.publish(event as never);
          } finally {
            relay.close();
          }
        })
      );
      return published;
    } catch {
      await addPendingPublish(event as never);
    }
  }

  function selectEpisode(ep: NonNullable<ResolveApiResponse['episodes']>[number]) {
    const feedUrl = fromBase64url(contentId.id);
    const id = `${toBase64url(feedUrl)}:${toBase64url(ep.guid)}`;
    goto(`/podcast/episode/${id}`);
  }

  function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function formatDate(unix: number): string {
    return new Date(unix * 1000).toLocaleDateString('ja-JP');
  }
</script>

{#if status === 'loading'}
  <div class="flex items-center justify-center p-8">
    <div
      class="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent"
    ></div>
  </div>
{:else if status === 'error'}
  <div class="rounded-lg bg-zinc-800 p-6 text-center">
    <p class="text-zinc-400">{errorMessage}</p>
  </div>
{:else}
  <div class="flex flex-col gap-4">
    {#if feedTitle}
      <div class="flex items-center gap-3">
        {#if feedImage}
          <img src={feedImage} alt={feedTitle} class="h-16 w-16 rounded-lg object-cover" />
        {/if}
        <h2 class="text-lg font-semibold text-zinc-100">{feedTitle}</h2>
      </div>
    {/if}

    <div class="flex flex-col gap-1">
      {#each episodes ?? [] as ep (ep.guid)}
        <button
          onclick={() => selectEpisode(ep)}
          class="flex items-center gap-3 rounded-lg p-3 text-left transition hover:bg-zinc-700"
        >
          <div class="flex-1">
            <p class="text-sm text-zinc-100">{ep.title}</p>
            <p class="text-xs text-zinc-500">
              {formatDate(ep.publishedAt)}
              {#if ep.duration > 0}
                <span class="ml-2">{formatDuration(ep.duration)}</span>
              {/if}
            </p>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="h-5 w-5 shrink-0 text-zinc-500"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      {/each}
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Run lint and check**

Run: `pnpm format:check && pnpm lint && pnpm check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/PodcastEpisodeList.svelte
git commit -m "Implement PodcastEpisodeList with API integration and publish queue"
```

---

### Task 12: Cloudflare Pages Functions API

**Files:**

- Create: `functions/api/podcast/resolve.ts`

- [ ] **Step 0: Install API dependencies**

Run: `pnpm add nostr-tools @noble/hashes`

注: これらは既存の依存関係に含まれている可能性がある（rx-nostr 経由）。含まれていない場合のみ追加。

- [ ] **Step 1: Create the API endpoint**

```typescript
// functions/api/podcast/resolve.ts
import { getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

interface Env {
  SYSTEM_NOSTR_PRIVKEY: string;
}

const AUDIO_EXT_RE = /\.(mp3|m4a|ogg|wav|opus|flac|aac)$/i;
const FEED_RE = /\.(rss|xml|atom|json)$/i;
const MAX_EPISODES = 100;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return jsonResponse({ error: 'invalid_url' }, 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return jsonResponse({ error: 'invalid_url' }, 400);
    }
  } catch {
    return jsonResponse({ error: 'invalid_url' }, 400);
  }

  const privkeyHex = context.env.SYSTEM_NOSTR_PRIVKEY;
  const privkey = hexToBytes(privkeyHex);
  const pubkey = getPublicKey(privkey);

  const pathname = parsed.pathname;

  // Determine input type
  if (AUDIO_EXT_RE.test(pathname)) {
    return handleAudioUrl(targetUrl, privkey);
  } else if (FEED_RE.test(pathname) || /\/(feed|rss|atom)\/?$/i.test(pathname)) {
    return handleFeedUrl(targetUrl, privkey);
  } else {
    return handleSiteUrl(targetUrl, privkey);
  }
};

async function handleFeedUrl(feedUrl: string, privkey: Uint8Array) {
  try {
    const res = await fetch(feedUrl);
    if (!res.ok) return jsonResponse({ error: 'fetch_failed' }, 502);

    const xml = await res.text();
    const feed = await parseRss(xml, feedUrl);
    if (!feed) return jsonResponse({ error: 'rss_not_found' }, 404);

    const signedEvents = [];
    // Sign feed bookmark
    signedEvents.push(
      signBookmarkEvent(privkey, {
        dTag: normalizeForDTag(feedUrl),
        iTags: [[`podcast:guid:${feed.guid}`, feedUrl]],
        kTag: 'podcast:guid',
        rTags: [feedUrl, domainRoot(feedUrl)],
        title: feed.title
      })
    );

    const episodes = feed.episodes.slice(0, MAX_EPISODES);

    return jsonResponse({
      type: 'feed',
      feed: { guid: feed.guid, title: feed.title, feedUrl, image: feed.image },
      episodes: episodes.map((ep) => ({
        guid: ep.guid,
        title: ep.title,
        enclosureUrl: ep.enclosureUrl,
        duration: ep.duration,
        publishedAt: ep.publishedAt
      })),
      signedEvents
    });
  } catch {
    return jsonResponse({ error: 'fetch_failed' }, 502);
  }
}

async function handleAudioUrl(audioUrl: string, privkey: Uint8Array) {
  // Try auto-discovery from domain root
  try {
    const domain = new URL(audioUrl).origin;
    const htmlRes = await fetch(domain);
    if (htmlRes.ok) {
      const html = await htmlRes.text();
      const rssUrl = findRssLink(html, domain);
      if (rssUrl) {
        const feedRes = await fetch(rssUrl);
        if (feedRes.ok) {
          const xml = await feedRes.text();
          const feed = await parseRss(xml, rssUrl);
          if (feed) {
            const episode = feed.episodes.find((ep) => ep.enclosureUrl === audioUrl);
            if (episode) {
              const signedEvents = [];
              signedEvents.push(
                signBookmarkEvent(privkey, {
                  dTag: normalizeForDTag(audioUrl),
                  iTags: [
                    [`podcast:item:guid:${episode.guid}`, audioUrl],
                    [`podcast:guid:${feed.guid}`, rssUrl]
                  ],
                  kTag: 'podcast:item:guid',
                  rTags: [audioUrl, rssUrl, domainRoot(audioUrl)],
                  title: episode.title
                })
              );

              return jsonResponse({
                type: 'episode',
                feed: { guid: feed.guid, title: feed.title, feedUrl: rssUrl, image: feed.image },
                episode: {
                  guid: episode.guid,
                  title: episode.title,
                  enclosureUrl: episode.enclosureUrl,
                  duration: episode.duration,
                  publishedAt: episode.publishedAt
                },
                signedEvents
              });
            }
          }
        }
      }
    }
  } catch {
    // Auto-discovery failed, return without guid
  }

  return jsonResponse({
    type: 'episode',
    episode: {
      guid: '',
      title: '',
      enclosureUrl: audioUrl,
      duration: 0,
      publishedAt: 0
    },
    signedEvents: []
  });
}

async function handleSiteUrl(siteUrl: string, privkey: Uint8Array) {
  try {
    const res = await fetch(siteUrl);
    if (!res.ok) return jsonResponse({ error: 'fetch_failed' }, 502);

    const html = await res.text();
    const rssUrl = findRssLink(html, siteUrl);
    if (!rssUrl) return jsonResponse({ error: 'rss_not_found' }, 404);

    return jsonResponse({ type: 'redirect', feedUrl: rssUrl });
  } catch {
    return jsonResponse({ error: 'fetch_failed' }, 502);
  }
}

// --- Helpers ---

function findRssLink(html: string, baseUrl: string): string | null {
  const match = html.match(/<link[^>]+type=["']application\/rss\+xml["'][^>]*>/i);
  if (!match) return null;
  const hrefMatch = match[0].match(/href=["']([^"']+)["']/);
  if (!hrefMatch) return null;
  try {
    return new URL(hrefMatch[1], baseUrl).href;
  } catch {
    return null;
  }
}

interface ParsedFeed {
  guid: string;
  title: string;
  image: string;
  episodes: {
    guid: string;
    title: string;
    enclosureUrl: string;
    duration: number;
    publishedAt: number;
  }[];
}

async function parseRss(xml: string, feedUrl: string): Promise<ParsedFeed | null> {
  // Simple XML parsing for RSS 2.0
  const channelMatch = xml.match(/<channel>([\s\S]*?)<\/channel>/);
  if (!channelMatch) return null;
  const channel = channelMatch[1];

  const title = extractTag(channel, 'title') ?? 'Unknown';
  const podcastGuid = extractTag(channel, 'podcast:guid');
  const guid = podcastGuid ?? (await syntheticGuid(feedUrl));
  const image = extractImageUrl(channel) ?? '';

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const episodes = items
    .map((m) => parseItem(m[1]))
    .filter((ep): ep is NonNullable<typeof ep> => ep !== null);

  return { guid, title, image, episodes };
}

function parseItem(itemXml: string): {
  guid: string;
  title: string;
  enclosureUrl: string;
  duration: number;
  publishedAt: number;
} | null {
  const enclosureMatch = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*>/);
  if (!enclosureMatch) return null;

  const enclosureUrl = enclosureMatch[1];
  const title = extractTag(itemXml, 'title') ?? 'Untitled';
  const guid = extractTag(itemXml, 'guid') ?? enclosureUrl;
  const pubDate = extractTag(itemXml, 'pubDate');
  const publishedAt = pubDate ? Math.floor(new Date(pubDate).getTime() / 1000) : 0;
  const durationStr = extractTag(itemXml, 'itunes:duration');
  const duration = parseDuration(durationStr);

  return { guid, title, enclosureUrl, duration, publishedAt };
}

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  const match = xml.match(re);
  return match ? match[1].trim() : null;
}

function extractImageUrl(channel: string): string | null {
  const itunesImage = channel.match(/<itunes:image[^>]+href=["']([^"']+)["']/);
  if (itunesImage) return itunesImage[1];
  const imageUrl = extractTag(channel, 'url');
  return imageUrl;
}

function parseDuration(str: string | null): number {
  if (!str) return 0;
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

async function syntheticGuid(feedUrl: string): Promise<string> {
  const data = new TextEncoder().encode(feedUrl);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hex = bytesToHex(new Uint8Array(hashBuffer)).slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function normalizeForDTag(url: string): string {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  const port = parsed.port ? `:${parsed.port}` : '';
  let path = parsed.pathname;
  if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1);
  return `${host}${port}${path}`;
}

function domainRoot(url: string): string {
  const parsed = new URL(url);
  return `https://${parsed.hostname.toLowerCase()}`;
}

interface BookmarkParams {
  dTag: string;
  iTags: [string, string][];
  kTag: string;
  rTags: string[];
  title: string;
}

function signBookmarkEvent(privkey: Uint8Array, params: BookmarkParams) {
  const tags: string[][] = [
    ['d', params.dTag],
    ...params.iTags.map(([value, hint]) => ['i', value, hint]),
    ['k', params.kTag],
    ...params.rTags.map((url) => ['r', url]),
    ['title', params.title],
    ['t', 'podcast']
  ];

  const event = finalizeEvent(
    {
      kind: 39701,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: ''
    },
    privkey
  );

  return event;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add functions/api/podcast/resolve.ts
git commit -m "Add Cloudflare Pages Functions API for podcast resolution"
```

---

## Chunk 6: 統合 + pre-commit 検証

### Task 13: URL 入力フォームに d タグ検索統合

**Files:**

- Modify: URL 入力を処理しているコンポーネント（ホームページの URL 入力フォーム）

- [ ] **Step 1: Identify the URL input component**

`src/web/routes/` 配下のホームページを確認し、URL 入力フォームの場所を特定する。

- [ ] **Step 2: Add d-tag pre-search logic**

URL 入力の `onsubmit` ハンドラに、`parseContentUrl()` と `resolveByDTag()` を並行実行するロジックを追加:

```typescript
import { parseContentUrl } from '$lib/content/registry.js';
import { resolveByDTag, parseDTagEvent } from '$lib/content/podcast-resolver.js';
import { buildEpisodeContentId } from '$lib/content/podcast.js';
import { toBase64url } from '$lib/content/url-utils.js';

async function handleUrlSubmit(url: string) {
  const contentId = parseContentUrl(url);

  // d-tag search in parallel (fire and forget for speed)
  const dTagPromise = resolveByDTag(url, async (filter) => {
    // Use rxNostr to query relays
    // Implementation depends on existing query pattern
    return null; // placeholder
  });

  // If a provider matched, navigate immediately
  if (contentId) {
    goto(`/${contentId.platform}/${contentId.type}/${contentId.id}`);

    // Check d-tag result asynchronously for guid upgrade
    const dTagResult = await dTagPromise;
    if (dTagResult) {
      // Redirect to podcast episode page if guid found
      const episodeId = buildEpisodeContentId(dTagResult.feedUrl, dTagResult.guid);
      goto(`/podcast/episode/${episodeId.id}`);
    }
    return;
  }

  // No provider matched — try d-tag search
  const dTagResult = await dTagPromise;
  if (dTagResult) {
    const episodeId = buildEpisodeContentId(dTagResult.feedUrl, dTagResult.guid);
    goto(`/podcast/episode/${episodeId.id}`);
    return;
  }

  // Nothing matched — go to resolve page
  goto(`/resolve/${toBase64url(url)}`);
}
```

- [ ] **Step 3: Run full validation**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm test`
Expected: PASS (all four checks)

- [ ] **Step 4: Commit**

```bash
git add <modified-files>  # URL 入力フォームの変更ファイルを明示的に指定
git commit -m "Integrate d-tag pre-search into URL input flow"
```

---

### Task 14: 最終検証

- [ ] **Step 1: Run full pre-commit validation**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm test`
Expected: ALL PASS

- [ ] **Step 2: Manual smoke test**

Run: `pnpm run dev`

テスト項目:

1. 音声直 URL（`.mp3`）を入力 → AudioEmbed で再生可能
2. RSS フィード URL を入力 → エピソード一覧表示
3. 不明な URL を入力 → /resolve/ ページに遷移
4. コメント欄が正常に表示される

- [ ] **Step 3: Final commit if any formatting fixes needed**

Run: `pnpm format && git add -A && git commit -m "Format code"`
