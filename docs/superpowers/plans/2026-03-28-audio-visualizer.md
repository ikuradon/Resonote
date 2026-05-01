# Audio Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MediaEmbed へのリネーム、動画 Podcast 判定、画像フォールバック、バーグラフ/MilkDrop ビジュアライザ、FPS 自動判定、設定 UI を実装する。

**Architecture:** `AudioEmbed` を `MediaEmbed` にリネームし `<audio>` → `<video>` 変更。`loadedmetadata` で `videoWidth > 0` を判定して動画/音声を分岐。音声時はフィード画像→ロゴのフォールバック表示 + Web Audio API AnalyserNode でビジュアライザオーバーレイ。ビジュアライザ状態は `src/shared/browser/visualizer.svelte.ts` で管理し、FPS 監視 + prefers-reduced-motion + localStorage 永続化。

**Tech Stack:** SvelteKit (Svelte 5 runes), Web Audio API (AnalyserNode), Canvas 2D, butterchurn (WebGL, dynamic import), Vitest, Playwright

---

## File Structure

### New Files

| File                                                  | Responsibility                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| `src/shared/browser/visualizer.svelte.ts`             | ビジュアライザ状態管理 (mode, effectiveMode, FPS 監視, localStorage) |
| `src/shared/browser/visualizer.test.ts`               | ビジュアライザ状態のユニットテスト                                   |
| `src/lib/components/VisualizerBar.svelte`             | バーグラフ Canvas コンポーネント                                     |
| `src/lib/components/VisualizerMilkdrop.svelte`        | MilkDrop WebGL コンポーネント (butterchurn 動的 import)              |
| `src/lib/components/MediaEmbed.svelte`                | AudioEmbed.svelte のリネーム + 動画判定 + ビジュアライザ統合         |
| `src/lib/components/media-embed-view-model.svelte.ts` | audio-embed-view-model のリネーム + `<video>` + `hasVideo`           |
| `src/lib/components/media-embed-view-model.test.ts`   | media-embed VM テスト                                                |
| `src/web/routes/settings/VisualizerSettings.svelte`   | 設定 UI コンポーネント                                               |

### Modified Files

| File                                                          | Change                                    |
| ------------------------------------------------------------- | ----------------------------------------- |
| `src/web/routes/[platform]/[type]/[id]/PlayerColumn.svelte`   | AudioEmbed → MediaEmbed import 変更       |
| `functions/api/podcast/resolve.ts`                            | enclosure `type` 属性取得                 |
| `src/features/content-resolution/domain/resolution-result.ts` | `EpisodeMetadata.mimeType` 追加           |
| `src/web/routes/settings/+page.svelte`                        | VisualizerSettings セクション追加         |
| `src/shared/i18n/*.json` (11 files)                           | ビジュアライザ i18n キー追加              |
| `e2e/edge-cases.test.ts`                                      | `audio-embed` → `media-embed` testid 変更 |
| `e2e/content-page.test.ts`                                    | `audio-embed` → `media-embed` testid 変更 |

### Deleted Files

| File                                                  | Reason                                    |
| ----------------------------------------------------- | ----------------------------------------- |
| `src/lib/components/AudioEmbed.svelte`                | MediaEmbed.svelte にリネーム              |
| `src/lib/components/audio-embed-view-model.svelte.ts` | media-embed-view-model にリネーム         |
| `src/lib/components/audio-embed-view-model.test.ts`   | media-embed-view-model.test.ts にリネーム |

---

### Task 1: Visualizer State Management

**Files:**

- Create: `src/shared/browser/visualizer.svelte.ts`
- Create: `src/shared/browser/visualizer.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/shared/browser/visualizer.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getVisualizerState, setVisualizerMode, reportFps, resetVisualizerState } =
  await import('./visualizer.svelte.js');

describe('visualizer state', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn()
    });
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }))
    );
    resetVisualizerState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to bar mode', () => {
    const state = getVisualizerState();
    expect(state.mode).toBe('bar');
    expect(state.effectiveMode).toBe('bar');
    expect(state.userExplicit).toBe(false);
  });

  it('persists mode to localStorage', () => {
    setVisualizerMode('milkdrop', true);
    const state = getVisualizerState();
    expect(state.mode).toBe('milkdrop');
    expect(state.userExplicit).toBe(true);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'resonote:visualizer',
      JSON.stringify({ mode: 'milkdrop', userExplicit: true })
    );
  });

  it('restores mode from localStorage', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({ mode: 'milkdrop', userExplicit: true })
    );
    resetVisualizerState();
    const state = getVisualizerState();
    expect(state.mode).toBe('milkdrop');
    expect(state.userExplicit).toBe(true);
  });

  it('auto-disables when FPS drops below 20 (non-explicit)', () => {
    setVisualizerMode('bar', false);
    reportFps(15);
    const state = getVisualizerState();
    expect(state.mode).toBe('bar');
    expect(state.effectiveMode).toBe('off');
    expect(state.fps).toBe(15);
  });

  it('does not auto-disable when user explicitly enabled', () => {
    setVisualizerMode('bar', true);
    reportFps(15);
    const state = getVisualizerState();
    expect(state.effectiveMode).toBe('bar');
  });

  it('respects prefers-reduced-motion', () => {
    (matchMedia as ReturnType<typeof vi.fn>).mockReturnValue({ matches: true });
    resetVisualizerState();
    setVisualizerMode('bar', false);
    const state = getVisualizerState();
    expect(state.effectiveMode).toBe('off');
  });

  it('forces off even with explicit when prefers-reduced-motion', () => {
    (matchMedia as ReturnType<typeof vi.fn>).mockReturnValue({ matches: true });
    resetVisualizerState();
    setVisualizerMode('milkdrop', true);
    const state = getVisualizerState();
    expect(state.effectiveMode).toBe('off');
  });

  it('handles off mode', () => {
    setVisualizerMode('off', true);
    const state = getVisualizerState();
    expect(state.mode).toBe('off');
    expect(state.effectiveMode).toBe('off');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/shared/browser/visualizer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement visualizer state**

```typescript
// src/shared/browser/visualizer.svelte.ts
export type VisualizerMode = 'off' | 'bar' | 'milkdrop';

interface VisualizerPersisted {
  mode: VisualizerMode;
  userExplicit: boolean;
}

const STORAGE_KEY = 'resonote:visualizer';

let mode = $state<VisualizerMode>('bar');
let userExplicit = $state(false);
let fps = $state(60);

function prefersReducedMotion(): boolean {
  if (typeof matchMedia === 'undefined') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as VisualizerPersisted;
    if (parsed.mode === 'off' || parsed.mode === 'bar' || parsed.mode === 'milkdrop') {
      mode = parsed.mode;
      userExplicit = parsed.userExplicit ?? false;
    }
  } catch {
    // ignore
  }
}

function saveToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, userExplicit }));
  } catch {
    // ignore
  }
}

function computeEffectiveMode(): VisualizerMode {
  if (mode === 'off') return 'off';
  if (prefersReducedMotion()) return 'off';
  if (!userExplicit && fps < 20) return 'off';
  return mode;
}

loadFromStorage();

export function getVisualizerState() {
  return {
    get mode() {
      return mode;
    },
    get effectiveMode() {
      return computeEffectiveMode();
    },
    get userExplicit() {
      return userExplicit;
    },
    get fps() {
      return fps;
    }
  };
}

export function setVisualizerMode(newMode: VisualizerMode, explicit: boolean): void {
  mode = newMode;
  userExplicit = explicit;
  saveToStorage();
}

export function reportFps(currentFps: number): void {
  fps = currentFps;
}

export function resetVisualizerState(): void {
  mode = 'bar';
  userExplicit = false;
  fps = 60;
  loadFromStorage();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/shared/browser/visualizer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/browser/visualizer.svelte.ts src/shared/browser/visualizer.test.ts
git commit -m "feat: add visualizer state management with FPS auto-detection"
```

---

### Task 2: MediaEmbed View Model (rename + video detection)

**Files:**

- Create: `src/lib/components/media-embed-view-model.svelte.ts`
- Create: `src/lib/components/media-embed-view-model.test.ts`
- Delete: `src/lib/components/audio-embed-view-model.svelte.ts`
- Delete: `src/lib/components/audio-embed-view-model.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/components/media-embed-view-model.test.ts` with tests from the existing `audio-embed-view-model.test.ts` plus new `hasVideo` detection tests:

```typescript
// src/lib/components/media-embed-view-model.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  setContentMock,
  updatePlaybackMock,
  fromBase64urlMock,
  onSeekMock,
  seekCleanupMock,
  seekState
} = vi.hoisted(() => ({
  setContentMock: vi.fn(),
  updatePlaybackMock: vi.fn(),
  fromBase64urlMock: vi.fn((value: string) => `decoded:${value}`),
  onSeekMock: vi.fn(),
  seekCleanupMock: vi.fn(),
  seekState: { callback: null as ((positionMs: number) => void) | null }
}));

vi.mock('$shared/content/url-utils.js', () => ({
  fromBase64url: fromBase64urlMock
}));

vi.mock('$shared/browser/player.js', () => ({
  setContent: setContentMock,
  updatePlayback: updatePlaybackMock
}));

vi.mock('$shared/browser/seek-bridge.js', () => ({
  onSeek: onSeekMock.mockImplementation((callback: (positionMs: number) => void) => {
    seekState.callback = callback;
    return seekCleanupMock;
  })
}));

import { createMediaEmbedViewModel } from './media-embed-view-model.svelte.js';

interface MutableMediaElement {
  paused: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  videoWidth: number;
  videoHeight: number;
  play: () => Promise<void>;
  pause: () => void;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
}

function createFakeMediaElement(initial?: Partial<MutableMediaElement>) {
  const listeners = new Map<string, EventListener[]>();
  const media: MutableMediaElement = {
    paused: true,
    currentTime: 0,
    duration: 0,
    volume: 1,
    videoWidth: 0,
    videoHeight: 0,
    play: vi.fn(async () => {
      media.paused = false;
    }),
    pause: vi.fn(() => {
      media.paused = true;
    }),
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      const current = listeners.get(type) ?? [];
      listeners.set(
        type,
        current.filter((candidate) => candidate !== listener)
      );
    }),
    ...initial
  };

  return {
    media,
    element: media as unknown as HTMLVideoElement,
    emit(type: string) {
      for (const listener of listeners.get(type) ?? []) {
        listener(new Event(type));
      }
    }
  };
}

describe('createMediaEmbedViewModel', () => {
  beforeEach(() => {
    setContentMock.mockReset();
    updatePlaybackMock.mockReset();
    fromBase64urlMock.mockClear();
    onSeekMock.mockClear();
    seekCleanupMock.mockReset();
    seekState.callback = null;
  });

  it('should derive media src from enclosure url or decoded content id', () => {
    const fromContentId = createMediaEmbedViewModel({
      getContentId: () => ({ platform: 'audio', type: 'track', id: 'abc' }),
      getEnclosureUrl: () => undefined
    });
    const fromEnclosure = createMediaEmbedViewModel({
      getContentId: () => ({ platform: 'audio', type: 'track', id: 'ignored' }),
      getEnclosureUrl: () => 'https://cdn.example.com/file.mp3'
    });

    expect(fromContentId.mediaSrc).toBe('decoded:abc');
    expect(fromEnclosure.mediaSrc).toBe('https://cdn.example.com/file.mp3');
  });

  it('should detect video when videoWidth > 0', () => {
    const contentId = { platform: 'podcast', type: 'episode', id: 'abc' };
    const vm = createMediaEmbedViewModel({
      getContentId: () => contentId,
      getEnclosureUrl: () => 'https://example.com/video.mp4'
    });
    const { media, element, emit } = createFakeMediaElement({
      duration: 120,
      videoWidth: 1920,
      videoHeight: 1080
    });

    vm.bindMediaElement(element);

    emit('loadedmetadata');
    expect(vm.hasVideo).toBe(true);
    expect(vm.duration).toBe(120);
  });

  it('should detect audio-only when videoWidth is 0', () => {
    const vm = createMediaEmbedViewModel({
      getContentId: () => ({ platform: 'podcast', type: 'episode', id: 'abc' }),
      getEnclosureUrl: () => 'https://example.com/audio.mp3'
    });
    const { element, emit } = createFakeMediaElement({
      duration: 60,
      videoWidth: 0,
      videoHeight: 0
    });

    vm.bindMediaElement(element);

    emit('loadedmetadata');
    expect(vm.hasVideo).toBe(false);
  });

  it('should sync playback state from media element events', () => {
    const contentId = { platform: 'audio', type: 'track', id: 'abc' };
    const vm = createMediaEmbedViewModel({
      getContentId: () => contentId,
      getEnclosureUrl: () => undefined
    });
    const { media, element, emit } = createFakeMediaElement({
      duration: 120,
      currentTime: 12,
      paused: true,
      volume: 0.25
    });

    vm.bindMediaElement(element);

    emit('loadedmetadata');
    expect(vm.duration).toBe(120);
    expect(vm.error).toBe(false);
    expect(setContentMock).toHaveBeenCalledWith(contentId);

    media.paused = false;
    emit('play');
    expect(vm.isPaused).toBe(false);
    expect(updatePlaybackMock).toHaveBeenLastCalledWith(12000, 120000, false);

    media.currentTime = 18;
    emit('timeupdate');
    expect(vm.currentTime).toBe(18);

    media.paused = true;
    emit('pause');
    expect(vm.isPaused).toBe(true);

    seekState.callback?.(3000);
    expect(media.currentTime).toBe(3);

    vm.bindMediaElement(element).destroy?.();
    expect(seekCleanupMock).toHaveBeenCalled();
  });

  it('should proxy play, pause, seek and volume inputs', () => {
    const vm = createMediaEmbedViewModel({
      getContentId: () => ({ platform: 'audio', type: 'track', id: 'abc' }),
      getEnclosureUrl: () => undefined
    });
    const { media, element } = createFakeMediaElement();

    vm.bindMediaElement(element);

    vm.togglePlayPause();
    expect(media.play).toHaveBeenCalledTimes(1);

    media.paused = false;
    vm.togglePlayPause();
    expect(media.pause).toHaveBeenCalledTimes(1);

    vm.handleSeekInput({ target: { value: '42.5' } } as unknown as Event);
    expect(media.currentTime).toBe(42.5);

    vm.handleVolumeInput({ target: { value: '0.6' } } as unknown as Event);
    expect(media.volume).toBe(0.6);
    expect(vm.volume).toBe(0.6);
  });

  it('should expose mediaElement for Web Audio API connection', () => {
    const vm = createMediaEmbedViewModel({
      getContentId: () => ({ platform: 'audio', type: 'track', id: 'abc' }),
      getEnclosureUrl: () => undefined
    });
    const { element } = createFakeMediaElement();

    expect(vm.mediaElement).toBeUndefined();
    vm.bindMediaElement(element);
    expect(vm.mediaElement).toBe(element);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/components/media-embed-view-model.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement media-embed-view-model**

```typescript
// src/lib/components/media-embed-view-model.svelte.ts
import type { Action } from 'svelte/action';

import { setContent, updatePlayback } from '$shared/browser/player.js';
import { onSeek } from '$shared/browser/seek-bridge.js';
import type { ContentId } from '$shared/content/types.js';
import { fromBase64url } from '$shared/content/url-utils.js';

interface MediaEmbedViewModelOptions {
  getContentId: () => ContentId;
  getEnclosureUrl: () => string | undefined;
}

export function createMediaEmbedViewModel(options: MediaEmbedViewModelOptions) {
  let mediaEl: HTMLVideoElement | undefined;
  let currentTime = $state(0);
  let duration = $state(0);
  let isPaused = $state(true);
  let volume = $state(1);
  let error = $state(false);
  let hasVideo = $state(false);

  let mediaSrc = $derived.by(() => {
    const enclosureUrl = options.getEnclosureUrl();
    if (enclosureUrl) return enclosureUrl;

    const contentId = options.getContentId();
    return contentId.platform === 'audio' ? fromBase64url(contentId.id) : null;
  });

  function togglePlayPause(): void {
    if (!mediaEl) return;
    if (mediaEl.paused) {
      void mediaEl.play();
    } else {
      mediaEl.pause();
    }
  }

  function handleSeekInput(event: Event): void {
    if (!mediaEl) return;
    const value = parseFloat((event.target as HTMLInputElement).value);
    mediaEl.currentTime = value;
  }

  function handleVolumeInput(event: Event): void {
    if (!mediaEl) return;
    const value = parseFloat((event.target as HTMLInputElement).value);
    mediaEl.volume = value;
    volume = value;
  }

  const bindMediaElement: Action<HTMLVideoElement> = (video) => {
    mediaEl = video;
    volume = video.volume;

    const cleanupSeek = onSeek((positionMs) => {
      video.currentTime = positionMs / 1000;
    });

    const onTimeUpdate = () => {
      currentTime = video.currentTime;
      updatePlayback(video.currentTime * 1000, video.duration * 1000, video.paused);
    };

    const onDurationChange = () => {
      duration = video.duration;
    };

    const onPlay = () => {
      isPaused = false;
      updatePlayback(video.currentTime * 1000, video.duration * 1000, false);
    };

    const onPause = () => {
      isPaused = true;
      updatePlayback(video.currentTime * 1000, video.duration * 1000, true);
    };

    const onLoadedMetadata = () => {
      duration = video.duration;
      hasVideo = video.videoWidth > 0;
      error = false;
      setContent(options.getContentId());
    };

    const onError = () => {
      error = true;
    };

    const onVolumeChange = () => {
      volume = video.volume;
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('error', onError);
    video.addEventListener('volumechange', onVolumeChange);

    return {
      destroy() {
        cleanupSeek();
        video.removeEventListener('timeupdate', onTimeUpdate);
        video.removeEventListener('durationchange', onDurationChange);
        video.removeEventListener('play', onPlay);
        video.removeEventListener('pause', onPause);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('error', onError);
        video.removeEventListener('volumechange', onVolumeChange);
        if (mediaEl === video) {
          mediaEl = undefined;
        }
      }
    };
  };

  return {
    get mediaSrc() {
      return mediaSrc;
    },
    get currentTime() {
      return currentTime;
    },
    get duration() {
      return duration;
    },
    get isPaused() {
      return isPaused;
    },
    get volume() {
      return volume;
    },
    get error() {
      return error;
    },
    get hasVideo() {
      return hasVideo;
    },
    get mediaElement() {
      return mediaEl;
    },
    bindMediaElement,
    togglePlayPause,
    handleSeekInput,
    handleVolumeInput
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/components/media-embed-view-model.test.ts`
Expected: PASS

- [ ] **Step 5: Delete old audio-embed view model files**

```bash
git rm src/lib/components/audio-embed-view-model.svelte.ts src/lib/components/audio-embed-view-model.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/media-embed-view-model.svelte.ts src/lib/components/media-embed-view-model.test.ts
git commit -m "feat: rename audio-embed to media-embed view model with video detection"
```

---

### Task 3: MediaEmbed Component (rename + video/audio UI)

**Files:**

- Create: `src/lib/components/MediaEmbed.svelte`
- Delete: `src/lib/components/AudioEmbed.svelte`
- Modify: `src/web/routes/[platform]/[type]/[id]/PlayerColumn.svelte`

- [ ] **Step 1: Create MediaEmbed.svelte**

This replaces `AudioEmbed.svelte` with video support, image fallback, and visualizer integration:

```svelte
<!-- src/lib/components/MediaEmbed.svelte -->
<script lang="ts">
  import { onTogglePlayback } from '$shared/browser/playback-bridge.js';
  import { getVisualizerState } from '$shared/browser/visualizer.svelte.js';
  import type { ContentId } from '$shared/content/types.js';
  import { t } from '$shared/i18n/t.js';
  import { formatDuration } from '$shared/utils/format.js';

  import { createMediaEmbedViewModel } from './media-embed-view-model.svelte.js';
  import VisualizerBar from './VisualizerBar.svelte';
  import VisualizerMilkdrop from './VisualizerMilkdrop.svelte';

  interface Props {
    contentId: ContentId;
    enclosureUrl?: string;
    title?: string;
    feedTitle?: string;
    image?: string;
    openUrl?: string;
  }

  let { contentId, enclosureUrl, title, feedTitle, image, openUrl }: Props = $props();

  let feedHref = $derived(
    contentId.platform === 'podcast' && contentId.type === 'episode'
      ? `/podcast/feed/${contentId.id.split(':')[0]}`
      : null
  );
  const vm = createMediaEmbedViewModel({
    getContentId: () => contentId,
    getEnclosureUrl: () => enclosureUrl
  });

  const vizState = getVisualizerState();

  /** Artwork to show when not a video: ID3 jacket > feed image > Resonote logo */
  let artworkSrc = $derived(image ?? '/icon-192.png');
  let isDefaultLogo = $derived(!image);

  $effect(() => {
    return onTogglePlayback(() => {
      vm.togglePlayPause();
    });
  });
</script>

<div
  data-testid="media-embed"
  class="animate-fade-in w-full overflow-hidden rounded-2xl border border-border-subtle bg-zinc-800 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
>
  <!-- Hidden video element (always present for audio source) -->
  <video
    use:vm.bindMediaElement
    src={vm.mediaSrc ?? undefined}
    preload="metadata"
    class={vm.hasVideo ? 'w-full rounded-t-2xl' : 'hidden'}
    controls={vm.hasVideo}
  ></video>

  {#if vm.error}
    <div class="flex flex-col items-center justify-center gap-3 px-4 py-6">
      <p class="text-sm text-zinc-400">{t('embed.load_failed')}</p>
      {#if openUrl}
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-accent underline transition-colors hover:text-accent-hover"
        >
          {t('embed.check_source')}
        </a>
      {/if}
    </div>
  {:else if !vm.hasVideo}
    <div class="flex gap-4 p-4">
      <!-- Artwork with visualizer overlay -->
      <button
        onclick={vm.togglePlayPause}
        aria-label={vm.isPaused ? 'Play' : 'Pause'}
        class="group relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl"
      >
        <img
          src={artworkSrc}
          alt={title ?? ''}
          class="h-full w-full object-cover {isDefaultLogo ? 'opacity-30' : ''}"
        />
        {#if vizState.effectiveMode === 'bar' && vm.mediaElement && !vm.isPaused}
          <div class="absolute inset-0">
            <VisualizerBar mediaElement={vm.mediaElement} />
          </div>
        {:else if vizState.effectiveMode === 'milkdrop' && vm.mediaElement && !vm.isPaused}
          <div class="absolute inset-0">
            <VisualizerMilkdrop mediaElement={vm.mediaElement} />
          </div>
        {/if}
        <div
          class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <svg
            aria-hidden="true"
            class="h-8 w-8 text-white"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            {#if vm.isPaused}
              <path d="M8 5v14l11-7z" />
            {:else}
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            {/if}
          </svg>
        </div>
      </button>

      <!-- Info + Controls -->
      <div class="flex min-w-0 flex-1 flex-col justify-between">
        {#if title || feedTitle}
          <div class="mb-2 min-w-0">
            {#if title}
              <p class="truncate text-sm font-medium text-zinc-100">{title}</p>
            {/if}
            {#if feedTitle}
              {#if feedHref}
                <a
                  href={feedHref}
                  class="truncate text-xs text-zinc-400 hover:text-accent hover:underline"
                  >{feedTitle}</a
                >
              {:else}
                <p class="truncate text-xs text-zinc-400">{feedTitle}</p>
              {/if}
            {/if}
          </div>
        {/if}

        <div class="flex flex-col gap-1">
          <input
            type="range"
            min="0"
            max={isFinite(vm.duration) && vm.duration > 0 ? vm.duration : 100}
            step="0.1"
            value={vm.currentTime}
            oninput={vm.handleSeekInput}
            class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-600 accent-amber-500"
            aria-label="Seek"
          />
          <div class="flex justify-between text-xs text-zinc-400">
            <span>{formatDuration(vm.currentTime)}</span>
            <span>{formatDuration(vm.duration)}</span>
          </div>
        </div>

        <div class="mt-1 flex items-center gap-3">
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <svg
              aria-hidden="true"
              class="h-4 w-4 flex-shrink-0 text-zinc-400"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path
                d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"
              />
            </svg>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={vm.volume}
              oninput={vm.handleVolumeInput}
              class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-600 accent-amber-500"
              aria-label="Volume"
            />
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Update PlayerColumn.svelte**

Change import from `AudioEmbed` to `MediaEmbed`:

In `src/web/routes/[platform]/[type]/[id]/PlayerColumn.svelte`:

- Replace `import AudioEmbed from '$lib/components/AudioEmbed.svelte';` with `import MediaEmbed from '$lib/components/MediaEmbed.svelte';`
- Replace `<AudioEmbed` with `<MediaEmbed`
- Replace closing reference if present

- [ ] **Step 3: Delete AudioEmbed.svelte**

```bash
git rm src/lib/components/AudioEmbed.svelte
```

- [ ] **Step 4: Update E2E test selectors**

In `e2e/edge-cases.test.ts` and `e2e/content-page.test.ts`:

- Replace `[data-testid="audio-embed"]` with `[data-testid="media-embed"]`

- [ ] **Step 5: Run lint and check**

Run: `pnpm lint && pnpm check`
Expected: No errors related to AudioEmbed imports

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/MediaEmbed.svelte src/web/routes/[platform]/[type]/[id]/PlayerColumn.svelte e2e/edge-cases.test.ts e2e/content-page.test.ts
git commit -m "feat: rename AudioEmbed to MediaEmbed with video detection and artwork fallback"
```

---

### Task 4: VisualizerBar Component (Canvas バーグラフ)

**Files:**

- Create: `src/lib/components/VisualizerBar.svelte`

- [ ] **Step 1: Create VisualizerBar.svelte**

```svelte
<!-- src/lib/components/VisualizerBar.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  import { reportFps } from '$shared/browser/visualizer.svelte.js';

  interface Props {
    mediaElement: HTMLVideoElement;
  }

  let { mediaElement }: Props = $props();

  let canvas: HTMLCanvasElement;
  let animationId: number | undefined;
  let analyser: AnalyserNode | undefined;
  let audioCtx: AudioContext | undefined;
  let sourceNode: MediaElementAudioSourceNode | undefined;

  const BAR_COUNT = 16;
  const FPS_SAMPLE_SIZE = 10;
  let frameTimes: number[] = [];

  function measureFps(timestamp: number): void {
    frameTimes.push(timestamp);
    if (frameTimes.length > FPS_SAMPLE_SIZE) {
      frameTimes.shift();
    }
    if (frameTimes.length >= 2) {
      const elapsed = frameTimes[frameTimes.length - 1] - frameTimes[0];
      const avgFps = ((frameTimes.length - 1) / elapsed) * 1000;
      reportFps(Math.round(avgFps));
    }
  }

  function connectAudio(): void {
    if (sourceNode) return;
    try {
      audioCtx = new AudioContext();
      sourceNode = audioCtx.createMediaElementSource(mediaElement);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      sourceNode.connect(analyser);
      analyser.connect(audioCtx.destination);
    } catch {
      // Web Audio connection failed — silently degrade
    }
  }

  function draw(timestamp: number): void {
    if (!canvas || !analyser) return;
    measureFps(timestamp);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, width, height);

    const barWidth = width / BAR_COUNT;
    const step = Math.floor(dataArray.length / BAR_COUNT);

    for (let i = 0; i < BAR_COUNT; i++) {
      const value = dataArray[i * step] / 255;
      const barHeight = value * height;
      const x = i * barWidth;
      const y = height - barHeight;

      ctx.fillStyle = `rgba(245, 158, 11, ${0.6 + value * 0.4})`;
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
    }

    animationId = requestAnimationFrame(draw);
  }

  onMount(() => {
    connectAudio();
    animationId = requestAnimationFrame(draw);

    return () => {
      if (animationId !== undefined) {
        cancelAnimationFrame(animationId);
      }
      // Note: MediaElementAudioSourceNode cannot be disconnected and reconnected
      // to a different AudioContext, so we leave sourceNode connected.
    };
  });
</script>

<canvas bind:this={canvas} class="h-full w-full" width="96" height="96"></canvas>
```

- [ ] **Step 2: Run lint and check**

Run: `pnpm lint && pnpm check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/VisualizerBar.svelte
git commit -m "feat: add bar graph visualizer using Web Audio API AnalyserNode"
```

---

### Task 5: VisualizerMilkdrop Component (butterchurn)

**Files:**

- Create: `src/lib/components/VisualizerMilkdrop.svelte`
- Modify: `package.json` (add dependencies)

- [ ] **Step 1: Install butterchurn dependencies**

```bash
pnpm add butterchurn butterchurn-presets
```

- [ ] **Step 2: Create VisualizerMilkdrop.svelte**

```svelte
<!-- src/lib/components/VisualizerMilkdrop.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  import { reportFps } from '$shared/browser/visualizer.svelte.js';

  interface Props {
    mediaElement: HTMLVideoElement;
  }

  let { mediaElement }: Props = $props();

  let canvas: HTMLCanvasElement;
  let animationId: number | undefined;

  const FPS_SAMPLE_SIZE = 10;
  let frameTimes: number[] = [];

  function measureFps(timestamp: number): void {
    frameTimes.push(timestamp);
    if (frameTimes.length > FPS_SAMPLE_SIZE) {
      frameTimes.shift();
    }
    if (frameTimes.length >= 2) {
      const elapsed = frameTimes[frameTimes.length - 1] - frameTimes[0];
      const avgFps = ((frameTimes.length - 1) / elapsed) * 1000;
      reportFps(Math.round(avgFps));
    }
  }

  onMount(() => {
    let visualizer:
      | ReturnType<(typeof import('butterchurn'))['default']['createVisualizer']>
      | undefined;
    let audioCtx: AudioContext | undefined;
    let sourceNode: MediaElementAudioSourceNode | undefined;

    async function init() {
      try {
        const [butterchurnModule, presetsModule] = await Promise.all([
          import('butterchurn'),
          import('butterchurn-presets')
        ]);

        const butterchurn = butterchurnModule.default;
        const presets = presetsModule.default;
        const presetKeys = Object.keys(presets);

        if (presetKeys.length === 0 || !canvas) return;

        audioCtx = new AudioContext();

        visualizer = butterchurn.createVisualizer(audioCtx, canvas, {
          width: canvas.width,
          height: canvas.height
        });

        const randomPreset = presets[presetKeys[Math.floor(Math.random() * presetKeys.length)]];
        visualizer.loadPreset(randomPreset, 0);

        sourceNode = audioCtx.createMediaElementSource(mediaElement);
        sourceNode.connect(audioCtx.destination);
        visualizer.connectAudio(sourceNode);

        function render(timestamp: number) {
          measureFps(timestamp);
          visualizer?.render();
          animationId = requestAnimationFrame(render);
        }

        animationId = requestAnimationFrame(render);
      } catch {
        // MilkDrop init failed — silently degrade
      }
    }

    void init();

    return () => {
      if (animationId !== undefined) {
        cancelAnimationFrame(animationId);
      }
    };
  });
</script>

<canvas bind:this={canvas} class="h-full w-full" width="96" height="96"></canvas>
```

- [ ] **Step 3: Run lint and check**

Run: `pnpm lint && pnpm check`
Expected: PASS (butterchurn types may need adjustment; if no types exist, add `// @ts-expect-error` for dynamic imports)

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/VisualizerMilkdrop.svelte package.json pnpm-lock.yaml
git commit -m "feat: add MilkDrop visualizer using butterchurn (dynamic import)"
```

---

### Task 6: Enclosure MIME Type in RSS Parser

**Files:**

- Modify: `functions/api/podcast/resolve.ts`
- Modify: `src/features/content-resolution/domain/resolution-result.ts`

- [ ] **Step 1: Add mimeType to EpisodeMetadata**

In `src/features/content-resolution/domain/resolution-result.ts`, add `mimeType` field to `EpisodeMetadata`:

```typescript
export interface EpisodeMetadata {
  title?: string;
  feedTitle?: string;
  image?: string;
  description?: string;
  enclosureUrl?: string;
  mimeType?: string;
}
```

- [ ] **Step 2: Extract enclosure type in RSS parser**

In `functions/api/podcast/resolve.ts`, update the episode parsing to extract `type` attribute from `<enclosure>`:

After `const enclosureUrl = extractAttr(itemXml, 'enclosure', 'url');` add:

```typescript
const enclosureType = extractAttr(itemXml, 'enclosure', 'type');
```

Add `enclosureType` to `ParsedEpisode` interface:

```typescript
export interface ParsedEpisode {
  title: string;
  guid: string;
  enclosureUrl: string;
  enclosureType: string;
  pubDate: string;
  duration: number;
  description: string;
}
```

And include it in the push:

```typescript
items.push({
  title: itemTitle,
  guid,
  enclosureUrl,
  enclosureType,
  pubDate,
  duration,
  description
});
```

- [ ] **Step 3: Run existing tests**

Run: `pnpm vitest run functions/api/podcast/resolve.test.ts`
Expected: PASS (or update test mocks to include `enclosureType`)

- [ ] **Step 4: Commit**

```bash
git add functions/api/podcast/resolve.ts src/features/content-resolution/domain/resolution-result.ts
git commit -m "feat: extract enclosure MIME type from RSS for future video detection"
```

---

### Task 7: Settings UI

**Files:**

- Create: `src/web/routes/settings/VisualizerSettings.svelte`
- Modify: `src/web/routes/settings/+page.svelte`
- Modify: `src/shared/i18n/*.json` (11 files)

- [ ] **Step 1: Add i18n keys to all 11 locale files**

Add the following keys to each locale file (after `"shortcuts.show_help"` and before the closing `}`):

**en.json:**

```json
"visualizer.title": "Visualization",
"visualizer.description": "Visual effects during playback",
"visualizer.off": "Off",
"visualizer.bar": "Bar",
"visualizer.milkdrop": "MilkDrop"
```

**ja.json:**

```json
"visualizer.title": "ビジュアライゼーション",
"visualizer.description": "再生中のビジュアルエフェクト",
"visualizer.off": "オフ",
"visualizer.bar": "バー",
"visualizer.milkdrop": "MilkDrop"
```

**de.json:**

```json
"visualizer.title": "Visualisierung",
"visualizer.description": "Visuelle Effekte während der Wiedergabe",
"visualizer.off": "Aus",
"visualizer.bar": "Balken",
"visualizer.milkdrop": "MilkDrop"
```

**es.json:**

```json
"visualizer.title": "Visualización",
"visualizer.description": "Efectos visuales durante la reproducción",
"visualizer.off": "Apagado",
"visualizer.bar": "Barras",
"visualizer.milkdrop": "MilkDrop"
```

**fr.json:**

```json
"visualizer.title": "Visualisation",
"visualizer.description": "Effets visuels pendant la lecture",
"visualizer.off": "Désactivé",
"visualizer.bar": "Barres",
"visualizer.milkdrop": "MilkDrop"
```

**ko.json:**

```json
"visualizer.title": "시각화",
"visualizer.description": "재생 중 시각 효과",
"visualizer.off": "끄기",
"visualizer.bar": "바",
"visualizer.milkdrop": "MilkDrop"
```

**pt_br.json:**

```json
"visualizer.title": "Visualização",
"visualizer.description": "Efeitos visuais durante a reprodução",
"visualizer.off": "Desligado",
"visualizer.bar": "Barras",
"visualizer.milkdrop": "MilkDrop"
```

**zh_cn.json:**

```json
"visualizer.title": "可视化",
"visualizer.description": "播放时的视觉效果",
"visualizer.off": "关闭",
"visualizer.bar": "柱状图",
"visualizer.milkdrop": "MilkDrop"
```

**ja_kyoto.json:**

```json
"visualizer.title": "ビジュアライゼーション",
"visualizer.description": "再生中のビジュアルエフェクトどすえ",
"visualizer.off": "オフ",
"visualizer.bar": "バー",
"visualizer.milkdrop": "MilkDrop"
```

**ja_osaka.json:**

```json
"visualizer.title": "ビジュアライゼーション",
"visualizer.description": "再生中のビジュアルエフェクトやで",
"visualizer.off": "オフ",
"visualizer.bar": "バー",
"visualizer.milkdrop": "MilkDrop"
```

**ja_villainess.json:**

```json
"visualizer.title": "ビジュアライゼーション",
"visualizer.description": "再生中のビジュアルエフェクトですわ",
"visualizer.off": "オフ",
"visualizer.bar": "バー",
"visualizer.milkdrop": "MilkDrop"
```

- [ ] **Step 2: Create VisualizerSettings.svelte**

```svelte
<!-- src/web/routes/settings/VisualizerSettings.svelte -->
<script lang="ts">
  import {
    getVisualizerState,
    setVisualizerMode,
    type VisualizerMode
  } from '$shared/browser/visualizer.svelte.js';
  import { t, type TranslationKey } from '$shared/i18n/t.js';

  const state = getVisualizerState();

  const modeOptions: { value: VisualizerMode; labelKey: TranslationKey }[] = [
    { value: 'off', labelKey: 'visualizer.off' },
    { value: 'bar', labelKey: 'visualizer.bar' },
    { value: 'milkdrop', labelKey: 'visualizer.milkdrop' }
  ];

  function handleModeChange(mode: VisualizerMode): void {
    setVisualizerMode(mode, true);
  }
</script>

<section class="rounded-2xl border border-border bg-surface-1 p-6 space-y-5">
  <h2 class="font-display text-lg font-semibold text-text-primary">
    {t('visualizer.title')}
  </h2>
  <p class="text-sm text-text-muted">
    {t('visualizer.description')}
  </p>
  <div class="flex items-center rounded-lg bg-surface-2 p-0.5 w-fit">
    {#each modeOptions as opt (opt.value)}
      <button
        type="button"
        onclick={() => handleModeChange(opt.value)}
        class="rounded-md px-3 py-1.5 text-sm font-medium transition-all
          {state.mode === opt.value
          ? 'bg-surface-0 text-text-primary shadow-sm'
          : 'text-text-muted hover:text-text-secondary'}"
      >
        {t(opt.labelKey)}
      </button>
    {/each}
  </div>
</section>
```

- [ ] **Step 3: Add VisualizerSettings to settings page**

In `src/web/routes/settings/+page.svelte`:

Add import: `import VisualizerSettings from './VisualizerSettings.svelte';`

Add component between `MuteSettings` and the notification filter section:

```svelte
<VisualizerSettings />
```

- [ ] **Step 4: Run lint, check, and tests**

Run: `pnpm lint && pnpm check && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/web/routes/settings/VisualizerSettings.svelte src/web/routes/settings/+page.svelte src/shared/i18n/*.json
git commit -m "feat: add visualizer settings UI with i18n support"
```

---

### Task 8: E2E Tests

**Files:**

- Modify: `e2e/settings-flow.test.ts`

- [ ] **Step 1: Add visualizer settings E2E test**

Add a test to the existing settings flow test file for the visualizer mode toggle:

```typescript
test('visualizer settings: can change mode', async ({ page }) => {
  // Navigate to settings
  await page.goto('/settings');

  // Verify visualizer section exists
  const section = page.getByText('Visualization');
  await expect(section).toBeVisible();

  // Default should be "Bar" (active)
  const barButton = page.getByRole('button', { name: 'Bar' });
  await expect(barButton).toBeVisible();

  // Click MilkDrop
  const milkdropButton = page.getByRole('button', { name: 'MilkDrop' });
  await milkdropButton.click();

  // Verify localStorage was updated
  const stored = await page.evaluate(() => localStorage.getItem('resonote:visualizer'));
  expect(JSON.parse(stored!)).toEqual({ mode: 'milkdrop', userExplicit: true });

  // Click Off
  const offButton = page.getByRole('button', { name: 'Off' });
  await offButton.click();

  const stored2 = await page.evaluate(() => localStorage.getItem('resonote:visualizer'));
  expect(JSON.parse(stored2!)).toEqual({ mode: 'off', userExplicit: true });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `pnpm test:e2e`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add e2e/settings-flow.test.ts
git commit -m "test: add E2E test for visualizer settings mode toggle"
```

---

### Task 9: Pre-commit Validation

- [ ] **Step 1: Run full validation suite**

```bash
pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e
```

Expected: All 5 checks PASS

- [ ] **Step 2: Fix any remaining issues**

If any check fails, fix the issue and re-run the full suite.

---

## Self-Review Checklist

### Spec Coverage

| Spec Requirement                       | Task                                            |
| -------------------------------------- | ----------------------------------------------- |
| 1. 動画判定 + フォールバック           | Task 2 (hasVideo), Task 3 (MediaEmbed UI)       |
| 2. バーグラフビジュアライザ            | Task 4 (VisualizerBar)                          |
| 3. MilkDrop ビジュアライザ             | Task 5 (VisualizerMilkdrop)                     |
| 4. FPS 自動判定                        | Task 1 (visualizer state), Task 4/5 (reportFps) |
| 5. 設定画面                            | Task 7 (VisualizerSettings)                     |
| enclosure MIME type                    | Task 6                                          |
| i18n                                   | Task 7                                          |
| E2E テスト                             | Task 8                                          |
| AudioEmbed → MediaEmbed リネーム       | Task 2, 3                                       |
| prefers-reduced-motion                 | Task 1                                          |
| localStorage 保存                      | Task 1                                          |
| 画像フォールバック (ID3 > feed > logo) | Task 3                                          |

### Notes

- `butterchurn` は型定義がない場合がある。TypeScript エラーが出た場合は `src/butterchurn.d.ts` に型宣言を追加する
- `MediaElementAudioSourceNode` は1つの `HTMLMediaElement` に対して1度しか作成できない。VisualizerBar と VisualizerMilkdrop が同時に存在しないことを前提とする（effectiveMode で排他制御）
- E2E テストで Web Audio API は実際の音声再生が必要なためビジュアライザの描画テストは難しい。設定 UI の操作テストに絞る
