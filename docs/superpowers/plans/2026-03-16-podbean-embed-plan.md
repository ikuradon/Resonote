# Podbean Web 埋め込み Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Podbean エピソードの Web 埋め込み再生。PB Widget API で再生同期。

**Architecture:** PodbeanProvider (ContentProvider) + PodbeanEmbed.svelte (PB Widget API) + API で embed ID 解決

**Spec:**
- Widget API: https://developers.podbean.com/apidoc/widget
- Script: `https://pbcdn1.podbean.com/fs1/player/api.js`
- Embed URL: `https://www.podbean.com/player-v2/?i={embedId}`
- Events: READY, PLAY, PAUSE, PLAY_PROGRESS (currentPosition秒), FINISH
- Commands: play(), pause(), seekTo(ms), getPosition(cb)秒, getDuration(cb)秒

---

## File Structure

### 新規作成

| ファイル | 責務 |
|---|---|
| `src/lib/content/podbean.ts` | PodbeanProvider |
| `src/lib/content/podbean.test.ts` | プロバイダーテスト |
| `src/lib/components/PodbeanEmbed.svelte` | 埋め込みコンポーネント |

### 変更

| ファイル | 変更内容 |
|---|---|
| `src/lib/content/registry.ts` | podbean を niconico の後、podcast/audio の前に追加 |
| `src/web/routes/[platform]/[type]/[id]/+page.svelte` | PodbeanEmbed 条件分岐追加 |
| `src/web/routes/+page.svelte` | 入力例チップ追加 |
| `src/lib/components/TrackInput.svelte` | placeholder 追加 |
| `src/types/global.d.ts` | PB Widget 型定義追加 |
| `functions/api/podcast/resolve.ts` | Podbean embed ID 解決追加（チャンネルURL用） |

---

## URL パターン

| 形式 | 例 | embed ID 取得 |
|---|---|---|
| `/media/share/pb-{id}` | `podbean.com/media/share/pb-ar8ve-1920b14` | URL から直接 (`pb-ar8ve-1920b14`) |
| `{channel}.podbean.com/e/{slug}` | `jayburkeshow.podbean.com/e/episode-1...` | HTML パース（API 経由） |
| `/ew/pb-{id}` | `podbean.com/ew/pb-ar8ve-1920b14` | URL から直接 |

---

## Task 1: PodbeanProvider + テスト + 型定義

**Files:**
- Create: `src/lib/content/podbean.ts`
- Create: `src/lib/content/podbean.test.ts`
- Modify: `src/types/global.d.ts`

- [ ] **Step 1: Add PB Widget type definitions to global.d.ts**

```typescript
declare class PB {
  constructor(iframe: HTMLIFrameElement | string);
  play(): void;
  pause(): void;
  toggle(): void;
  seekTo(milliseconds: number): void;
  setVolume(volume: number): void;
  getVolume(callback: (volume: number) => void): void;
  getDuration(callback: (duration: number) => void): void;
  getPosition(callback: (position: number) => void): void;
  isPaused(callback: (paused: boolean) => void): void;
  bind(event: string, callback: (data?: unknown) => void): void;
  unbind(event: string): void;
}

declare namespace PB {
  namespace Widget {
    const Events: {
      READY: string;
      PLAY: string;
      PAUSE: string;
      PLAY_PROGRESS: string;
      FINISH: string;
      LOAD_PROGRESS: string;
      SEEK: string;
    };
  }
}
```

- [ ] **Step 2: Write failing tests**

```typescript
// src/lib/content/podbean.test.ts
import { describe, it, expect } from 'vitest';
import { podbean } from './podbean.js';

describe('PodbeanProvider.parseUrl', () => {
  it('matches /media/share/pb-{id}', () => {
    const result = podbean.parseUrl('https://www.podbean.com/media/share/pb-ar8ve-1920b14');
    expect(result).toEqual({ platform: 'podbean', type: 'episode', id: 'pb-ar8ve-1920b14' });
  });

  it('matches /ew/pb-{id}', () => {
    const result = podbean.parseUrl('https://www.podbean.com/ew/pb-wg7zy-1553d66');
    expect(result).toEqual({ platform: 'podbean', type: 'episode', id: 'pb-wg7zy-1553d66' });
  });

  it('matches {channel}.podbean.com/e/{slug}', () => {
    const result = podbean.parseUrl('https://jayburkeshow.podbean.com/e/episode-1-slug/');
    expect(result).toEqual({ platform: 'podbean', type: 'episode', id: 'jayburkeshow/episode-1-slug' });
  });

  it('rejects non-podbean URLs', () => {
    expect(podbean.parseUrl('https://example.com')).toBeNull();
    expect(podbean.parseUrl('https://youtube.com/watch?v=abc')).toBeNull();
  });

  it('handles http URLs', () => {
    const result = podbean.parseUrl('http://www.podbean.com/media/share/pb-ar8ve-1920b14');
    expect(result).not.toBeNull();
  });
});

describe('PodbeanProvider.toNostrTag', () => {
  it('returns podbean:episode:<id> format', () => {
    const [value, hint] = podbean.toNostrTag({ platform: 'podbean', type: 'episode', id: 'pb-ar8ve-1920b14' });
    expect(value).toBe('podbean:episode:pb-ar8ve-1920b14');
    expect(hint).toBe('https://www.podbean.com/media/share/pb-ar8ve-1920b14');
  });
});

describe('PodbeanProvider.contentKind', () => {
  it('returns podbean:episode', () => {
    expect(podbean.contentKind({ platform: 'podbean', type: 'episode', id: 'pb-ar8ve-1920b14' })).toBe('podbean:episode');
  });
});

describe('PodbeanProvider.embedUrl', () => {
  it('returns player-v2 URL for pb- IDs', () => {
    expect(podbean.embedUrl({ platform: 'podbean', type: 'episode', id: 'pb-ar8ve-1920b14' }))
      .toBe('https://www.podbean.com/player-v2/?i=pb-ar8ve-1920b14&share=0&download=0&skin=f6f6f6&btn-skin=c9a256');
  });

  it('returns null for channel slug IDs (resolved at runtime)', () => {
    expect(podbean.embedUrl({ platform: 'podbean', type: 'episode', id: 'jayburkeshow/episode-1-slug' }))
      .toBeNull();
  });
});
```

- [ ] **Step 3: Implement PodbeanProvider**

```typescript
// src/lib/content/podbean.ts
import type { ContentId, ContentProvider } from './types.js';

// https://www.podbean.com/media/share/pb-XXXXX-XXXXXXX
const PODBEAN_SHARE_RE = /^https?:\/\/(?:www\.)?podbean\.com\/media\/share\/(pb-[a-z0-9]+-[a-z0-9]+)/;

// https://www.podbean.com/ew/pb-XXXXX-XXXXXXX
const PODBEAN_EW_RE = /^https?:\/\/(?:www\.)?podbean\.com\/ew\/(pb-[a-z0-9]+-[a-z0-9]+)/;

// https://{channel}.podbean.com/e/{slug}/
const PODBEAN_CHANNEL_RE = /^https?:\/\/([a-zA-Z0-9_-]+)\.podbean\.com\/e\/([a-zA-Z0-9_-]+)/;

class PodbeanProvider implements ContentProvider {
  readonly platform = 'podbean';
  readonly displayName = 'Podbean';
  readonly requiresExtension = false;

  parseUrl(url: string): ContentId | null {
    // Direct embed ID URLs
    for (const re of [PODBEAN_SHARE_RE, PODBEAN_EW_RE]) {
      const match = url.match(re);
      if (match?.[1]) {
        return { platform: this.platform, type: 'episode', id: match[1] };
      }
    }
    // Channel subdomain URLs (need HTML parse to get embed ID)
    const channelMatch = url.match(PODBEAN_CHANNEL_RE);
    if (channelMatch?.[1] && channelMatch?.[2]) {
      return { platform: this.platform, type: 'episode', id: `${channelMatch[1]}/${channelMatch[2]}` };
    }
    return null;
  }

  toNostrTag(contentId: ContentId): [string, string] {
    const id = contentId.id;
    const hint = id.startsWith('pb-')
      ? `https://www.podbean.com/media/share/${id}`
      : `https://${id.split('/')[0]}.podbean.com/e/${id.split('/')[1]}`;
    return [`podbean:episode:${id}`, hint];
  }

  contentKind(): string {
    return 'podbean:episode';
  }

  embedUrl(contentId: ContentId): string | null {
    if (contentId.id.startsWith('pb-')) {
      return `https://www.podbean.com/player-v2/?i=${contentId.id}&share=0&download=0&skin=f6f6f6&btn-skin=c9a256`;
    }
    // Channel slug — embed ID must be resolved at runtime
    return null;
  }

  openUrl(contentId: ContentId): string {
    const id = contentId.id;
    if (id.startsWith('pb-')) {
      return `https://www.podbean.com/media/share/${id}`;
    }
    return `https://${id.split('/')[0]}.podbean.com/e/${id.split('/')[1]}`;
  }
}

export const podbean = new PodbeanProvider();
```

- [ ] **Step 4: Run tests, lint, check, commit**

---

## Task 2: PodbeanEmbed.svelte

**Files:**
- Create: `src/lib/components/PodbeanEmbed.svelte`

PB Widget API は SoundCloud Widget API と非常に似たパターン。

- [ ] **Step 1: Create embed component**

Key points:
- contentId.id が `pb-` で始まらない場合（チャンネル slug）→ API で embed ID 解決後 `/podbean/episode/{pbId}` にリダイレクト（コメント ID 統一のため）
- `PB` コンストラクタで iframe を制御
- Script: `https://pbcdn1.podbean.com/fs1/player/api.js`
- `PB.Widget.Events.READY` → `setContent(contentId)`
- `PB.Widget.Events.PLAY_PROGRESS` → `data.currentPosition` (秒) × 1000 で ms 変換
- `PB.Widget.Events.PLAY` / `PAUSE` → isPaused 更新
- `resonote:seek` → `widget.seekTo(posMs)` (ms)
- ブランドローディング画面: Podbean グリーン (#3db56a)
- 両キー対応 seek (`detail.position ?? detail.positionMs`)
- API 解決失敗時はエラー表示

**チャンネル URL リダイレクトフロー:**
```
/podbean/episode/jayburkeshow/episode-slug
  → PodbeanEmbed 検出: id が pb- でない
  → API: /api/podbean/resolve?url=https://jayburkeshow.podbean.com/e/episode-slug
  → { embedId: "pb-8di7w-16fabe1" }
  → goto('/podbean/episode/pb-8di7w-16fabe1')
  → 以降は通常の pb- ID フロー
```
これにより全コメントが `podbean:episode:pb-xxx` の統一タグに紐付く。

- [ ] **Step 2: Run lint, check, commit**

---

## Task 3: API embed ID 解決

**Files:**
- Create: `functions/api/podbean/resolve.ts`

チャンネル URL (`{channel}.podbean.com/e/{slug}`) → embed ID 解決。

```typescript
// GET /api/podbean/resolve?url={channelUrl}
// 1. fetch(channelUrl)
// 2. HTML から embed ID を抽出 (pb-{xxx}-{xxxxxxx} パターン)
// 3. { embedId: "pb-xxx-xxx" } を返却
```

- [ ] **Step 1: Create API endpoint**
- [ ] **Step 2: Commit**

---

## Task 4: Registry + コンテンツページ + ホームページ

**Files:**
- Modify: `src/lib/content/registry.ts` — podbean を niconico の後に追加
- Modify: `src/web/routes/[platform]/[type]/[id]/+page.svelte` — PodbeanEmbed 条件追加
- Modify: `src/web/routes/+page.svelte` — 入力例チップ追加
- Modify: `src/lib/components/TrackInput.svelte` — placeholder 追加

- [ ] **Step 1: Registry**

```typescript
import { podbean } from './podbean.js';
// providers array:
  niconico,
  podbean,
  podcast,
  audio,
```

- [ ] **Step 2: Content page**

```svelte
import PodbeanEmbed from '$lib/components/PodbeanEmbed.svelte';
// ...
{:else if showPlayer && platform === 'podbean'}
  <PodbeanEmbed {contentId} />
```

- [ ] **Step 3: Home page example chip**

```typescript
{ icon: '🎙️', platform: 'Podbean', label: 'Magdo Mix Show', url: 'https://www.podbean.com/media/share/pb-ar8ve-1920b14' },
```

- [ ] **Step 4: Placeholder**

```typescript
'PodbeanのURLを入力...',
```

- [ ] **Step 5: Run all checks, commit**
