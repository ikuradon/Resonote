# Keyboard Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** コンテンツページにキーボードショートカットを実装し、コメント操作・タブ切替・再生制御・ナビゲーションをキーボードから行えるようにする。

**Architecture:** `keyboard-shortcuts.svelte.ts` でグローバル keydown リスナーを管理し、アクションを callback map にディスパッチする。再生制御は seek-bridge と同じカスタムイベントパターンで `playback-bridge.ts` を新設する。j/k コメント選択は CommentList 内で `selectedIndex` state として管理する。

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, Custom DOM Events

---

## File Structure

### New Files

| File                                              | Responsibility                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/shared/browser/playback-bridge.ts`           | `resonote:toggle-playback` カスタムイベント (seek-bridge と同パターン) |
| `src/shared/browser/keyboard-shortcuts.svelte.ts` | ショートカットマネージャー — keydown 登録、入力ガード、アクション map  |
| `src/shared/browser/keyboard-shortcuts.test.ts`   | ショートカットマネージャーのユニットテスト                             |
| `src/lib/components/ShortcutHelpDialog.svelte`    | ショートカット一覧モーダル                                             |

### Modified Files

| File                                                 | Change                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `src/lib/components/CommentList.svelte`              | j/k 選択状態、r/l ハンドラ、選択ハイライト、ショートカット接続 |
| `src/lib/components/CommentCard.svelte`              | `selected` prop + ハイライトリング                             |
| `src/lib/components/SpotifyEmbed.svelte`             | `onTogglePlayback` subscriber 追加                             |
| `src/lib/components/YouTubeEmbed.svelte`             | `onTogglePlayback` subscriber 追加                             |
| `src/lib/components/AudioEmbed.svelte`               | `onTogglePlayback` subscriber 追加                             |
| `src/lib/components/SoundCloudEmbed.svelte`          | `onTogglePlayback` subscriber (トースト)                       |
| `src/lib/components/VimeoEmbed.svelte`               | `onTogglePlayback` subscriber (トースト)                       |
| `src/lib/components/NiconicoEmbed.svelte`            | `onTogglePlayback` subscriber (トースト)                       |
| `src/lib/components/MixcloudEmbed.svelte`            | `onTogglePlayback` subscriber (トースト)                       |
| `src/lib/components/SpreakerEmbed.svelte`            | `onTogglePlayback` subscriber (トースト)                       |
| `src/lib/components/PodbeanEmbed.svelte`             | `onTogglePlayback` subscriber (トースト)                       |
| `src/web/routes/[platform]/[type]/[id]/+page.svelte` | ショートカットマネージャー初期化                               |
| `src/shared/i18n/*.json`                             | ショートカット用 i18n キー追加                                 |

---

### Task 1: playback-bridge — 再生トグルイベント

**Files:**

- Create: `src/shared/browser/playback-bridge.ts`

- [ ] **Step 1: Create playback-bridge (same pattern as seek-bridge)**

```typescript
// src/shared/browser/playback-bridge.ts

// @public — Stable API for route/component/feature consumers
/**
 * Typed playback toggle bridge — centralizes the resonote:toggle-playback custom event.
 * Components import from here instead of using raw window.addEventListener/dispatchEvent.
 */

export const TOGGLE_PLAYBACK_EVENT = 'resonote:toggle-playback' as const;

/** Dispatch a toggle-playback event. */
export function dispatchTogglePlayback(): void {
  window.dispatchEvent(new CustomEvent(TOGGLE_PLAYBACK_EVENT));
}

/** Subscribe to toggle-playback events. Returns cleanup function. */
export function onTogglePlayback(callback: () => void): () => void {
  function handler() {
    callback();
  }
  window.addEventListener(TOGGLE_PLAYBACK_EVENT, handler);
  return () => window.removeEventListener(TOGGLE_PLAYBACK_EVENT, handler);
}
```

- [ ] **Step 2: Verify type check passes**

Run: `pnpm check`
Expected: 0 ERRORS

- [ ] **Step 3: Commit**

```bash
git add src/shared/browser/playback-bridge.ts
git commit -m "feat: add playback-bridge for toggle-playback custom event"
```

---

### Task 2: Embed play/pause 対応 — Spotify/YouTube/Audio

**Files:**

- Modify: `src/lib/components/SpotifyEmbed.svelte`
- Modify: `src/lib/components/YouTubeEmbed.svelte`
- Modify: `src/lib/components/AudioEmbed.svelte`

- [ ] **Step 1: Add toggle-playback to SpotifyEmbed**

In `SpotifyEmbed.svelte`, add import and subscriber:

```typescript
import { onTogglePlayback } from '$shared/browser/playback-bridge.js';
```

Inside the `$effect` where the Spotify controller is set up, add a subscriber after the `onSeek` subscriber:

```typescript
const cleanupToggle = onTogglePlayback(() => {
  if (!controller) return;
  controller.togglePlay();
});
```

Add `cleanupToggle()` to the effect cleanup.

Note: Check the Spotify IFrame API — `controller.togglePlay()` or `controller.resume()` / `controller.pause()`. Use whichever is available. If `togglePlay()` doesn't exist, use:

```typescript
const cleanupToggle = onTogglePlayback(() => {
  if (!controller) return;
  controller
    .getVolume()
    .then(() => {
      // If we can query, player is ready
      controller.resume();
    })
    .catch(() => {});
});
```

Actually, Spotify's EmbedController API has `togglePlay()`. Verify in the component.

- [ ] **Step 2: Add toggle-playback to YouTubeEmbed**

In `YouTubeEmbed.svelte`, add import and subscriber:

```typescript
import { onTogglePlayback } from '$shared/browser/playback-bridge.js';
```

Inside the `$effect` where the YT player is set up, add:

```typescript
const cleanupToggle = onTogglePlayback(() => {
  if (!player) return;
  const state = player.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
});
```

Add `cleanupToggle()` to the effect cleanup.

- [ ] **Step 3: Add toggle-playback to AudioEmbed**

In `AudioEmbed.svelte` (or its view model `audio-embed-view-model.svelte.ts`), add import and subscriber.

Best approach: add to the view model since `togglePlayPause()` is already there.

In `audio-embed-view-model.svelte.ts`, add:

```typescript
import { onTogglePlayback } from '$shared/browser/playback-bridge.js';
```

In the factory function, add cleanup:

```typescript
const cleanupToggle = onTogglePlayback(() => {
  togglePlayPause();
});
```

Return cleanup in a dispose method or handle in `$effect` in the component.

Since the VM doesn't have a cleanup mechanism, add the subscriber in the `AudioEmbed.svelte` component's `$effect` instead:

```typescript
import { onTogglePlayback } from '$shared/browser/playback-bridge.js';

$effect(() => {
  return onTogglePlayback(() => {
    vm.togglePlayPause();
  });
});
```

- [ ] **Step 4: Verify type check passes**

Run: `pnpm check`
Expected: 0 ERRORS

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/SpotifyEmbed.svelte src/lib/components/YouTubeEmbed.svelte src/lib/components/AudioEmbed.svelte src/lib/components/audio-embed-view-model.svelte.ts
git commit -m "feat: add toggle-playback support to Spotify/YouTube/Audio embeds"
```

---

### Task 3: Embed play/pause 対応 — 非対応プラットフォーム (トースト)

**Files:**

- Modify: `src/lib/components/SoundCloudEmbed.svelte`
- Modify: `src/lib/components/VimeoEmbed.svelte`
- Modify: `src/lib/components/NiconicoEmbed.svelte`
- Modify: `src/lib/components/MixcloudEmbed.svelte`
- Modify: `src/lib/components/SpreakerEmbed.svelte`
- Modify: `src/lib/components/PodbeanEmbed.svelte`

- [ ] **Step 1: Add toast i18n key to en.json**

Add to `src/shared/i18n/en.json`:

```json
"playback.shortcut_unsupported": "Play/pause shortcut is not supported for this player"
```

Add corresponding translations to all other locale files.

- [ ] **Step 2: Add toggle-playback toast to each embed**

For each of the 6 components above, add the same pattern:

```typescript
import { onTogglePlayback } from '$shared/browser/playback-bridge.js';
import { toastInfo } from '$shared/browser/toast.js';
import { t } from '$shared/i18n/t.js';
```

In the component's `$effect` (same one that sets up the seek listener):

```typescript
const cleanupToggle = onTogglePlayback(() => {
  toastInfo(t('playback.shortcut_unsupported'));
});
```

Add `cleanupToggle()` to the effect cleanup.

- [ ] **Step 3: Verify type check and lint pass**

Run: `pnpm lint && pnpm check`
Expected: 0 ERRORS

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/SoundCloudEmbed.svelte src/lib/components/VimeoEmbed.svelte src/lib/components/NiconicoEmbed.svelte src/lib/components/MixcloudEmbed.svelte src/lib/components/SpreakerEmbed.svelte src/lib/components/PodbeanEmbed.svelte src/shared/i18n/
git commit -m "feat: add toggle-playback toast for unsupported embeds"
```

---

### Task 4: keyboard-shortcuts マネージャー

**Files:**

- Create: `src/shared/browser/keyboard-shortcuts.svelte.ts`
- Create: `src/shared/browser/keyboard-shortcuts.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/shared/browser/keyboard-shortcuts.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createKeyboardShortcuts } from './keyboard-shortcuts.svelte.js';

describe('createKeyboardShortcuts', () => {
  let actions: Record<string, ReturnType<typeof vi.fn>>;
  let shortcuts: ReturnType<typeof createKeyboardShortcuts>;

  beforeEach(() => {
    actions = {
      focusForm: vi.fn(),
      switchToFlow: vi.fn(),
      switchToShout: vi.fn(),
      switchToInfo: vi.fn(),
      nextComment: vi.fn(),
      prevComment: vi.fn(),
      replyToSelected: vi.fn(),
      likeSelected: vi.fn(),
      clearSelection: vi.fn(),
      toggleBookmark: vi.fn(),
      openShare: vi.fn(),
      togglePlayback: vi.fn(),
      seekBackward: vi.fn(),
      seekForward: vi.fn(),
      showHelp: vi.fn()
    };
    shortcuts = createKeyboardShortcuts(actions);
  });

  afterEach(() => {
    shortcuts.destroy();
  });

  function fireKey(key: string, opts: Partial<KeyboardEvent> = {}): boolean {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...opts
    });
    return shortcuts.handleKeyDown(event);
  }

  it('dispatches f to switchToFlow', () => {
    fireKey('f');
    expect(actions.switchToFlow).toHaveBeenCalledOnce();
  });

  it('dispatches s to switchToShout', () => {
    fireKey('s');
    expect(actions.switchToShout).toHaveBeenCalledOnce();
  });

  it('dispatches i to switchToInfo', () => {
    fireKey('i');
    expect(actions.switchToInfo).toHaveBeenCalledOnce();
  });

  it('dispatches n to focusForm', () => {
    fireKey('n');
    expect(actions.focusForm).toHaveBeenCalledOnce();
  });

  it('dispatches j to nextComment', () => {
    fireKey('j');
    expect(actions.nextComment).toHaveBeenCalledOnce();
  });

  it('dispatches k to prevComment', () => {
    fireKey('k');
    expect(actions.prevComment).toHaveBeenCalledOnce();
  });

  it('dispatches r to replyToSelected', () => {
    fireKey('r');
    expect(actions.replyToSelected).toHaveBeenCalledOnce();
  });

  it('dispatches l to likeSelected', () => {
    fireKey('l');
    expect(actions.likeSelected).toHaveBeenCalledOnce();
  });

  it('dispatches Escape to clearSelection', () => {
    fireKey('Escape');
    expect(actions.clearSelection).toHaveBeenCalledOnce();
  });

  it('dispatches b to toggleBookmark', () => {
    fireKey('b');
    expect(actions.toggleBookmark).toHaveBeenCalledOnce();
  });

  it('dispatches Shift+S to openShare', () => {
    fireKey('S', { shiftKey: true });
    expect(actions.openShare).toHaveBeenCalledOnce();
  });

  it('dispatches p to togglePlayback', () => {
    fireKey('p');
    expect(actions.togglePlayback).toHaveBeenCalledOnce();
  });

  it('dispatches ArrowLeft to seekBackward', () => {
    fireKey('ArrowLeft');
    expect(actions.seekBackward).toHaveBeenCalledOnce();
  });

  it('dispatches ArrowRight to seekForward', () => {
    fireKey('ArrowRight');
    expect(actions.seekForward).toHaveBeenCalledOnce();
  });

  it('dispatches ? to showHelp', () => {
    fireKey('?', { shiftKey: true });
    expect(actions.showHelp).toHaveBeenCalledOnce();
  });

  it('ignores single keys when input is focused', () => {
    shortcuts.setInputFocused(true);
    fireKey('f');
    expect(actions.switchToFlow).not.toHaveBeenCalled();
  });

  it('allows Escape when input is focused', () => {
    shortcuts.setInputFocused(true);
    fireKey('Escape');
    expect(actions.clearSelection).toHaveBeenCalledOnce();
  });

  it('does not dispatch s when Shift+S is pressed (openShare wins)', () => {
    fireKey('S', { shiftKey: true });
    expect(actions.switchToShout).not.toHaveBeenCalled();
    expect(actions.openShare).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/shared/browser/keyboard-shortcuts.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement keyboard-shortcuts**

```typescript
// src/shared/browser/keyboard-shortcuts.svelte.ts

export interface ShortcutActions {
  focusForm: () => void;
  switchToFlow: () => void;
  switchToShout: () => void;
  switchToInfo: () => void;
  nextComment: () => void;
  prevComment: () => void;
  replyToSelected: () => void;
  likeSelected: () => void;
  clearSelection: () => void;
  toggleBookmark: () => void;
  openShare: () => void;
  togglePlayback: () => void;
  seekBackward: () => void;
  seekForward: () => void;
  showHelp: () => void;
}

export function createKeyboardShortcuts(actions: ShortcutActions) {
  let inputFocused = false;

  function setInputFocused(focused: boolean): void {
    inputFocused = focused;
  }

  function handleKeyDown(e: KeyboardEvent): boolean {
    // Always allow Escape
    if (e.key === 'Escape') {
      actions.clearSelection();
      return true;
    }

    // Skip single-key shortcuts when typing in input/textarea
    if (inputFocused) return false;

    // Shift+S → openShare (must check before 's')
    if (e.key === 'S' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      actions.openShare();
      return true;
    }

    // ? → showHelp (Shift+/ on most keyboards)
    if (e.key === '?') {
      e.preventDefault();
      actions.showHelp();
      return true;
    }

    // Skip if any modifier (except shift for ?) is held
    if (e.ctrlKey || e.metaKey || e.altKey) return false;

    // Single-key shortcuts
    switch (e.key) {
      case 'f':
        e.preventDefault();
        actions.switchToFlow();
        return true;
      case 's':
        e.preventDefault();
        actions.switchToShout();
        return true;
      case 'i':
        e.preventDefault();
        actions.switchToInfo();
        return true;
      case 'n':
        e.preventDefault();
        actions.focusForm();
        return true;
      case 'j':
        e.preventDefault();
        actions.nextComment();
        return true;
      case 'k':
        e.preventDefault();
        actions.prevComment();
        return true;
      case 'r':
        e.preventDefault();
        actions.replyToSelected();
        return true;
      case 'l':
        e.preventDefault();
        actions.likeSelected();
        return true;
      case 'b':
        e.preventDefault();
        actions.toggleBookmark();
        return true;
      case 'p':
        e.preventDefault();
        actions.togglePlayback();
        return true;
      case 'ArrowLeft':
        e.preventDefault();
        actions.seekBackward();
        return true;
      case 'ArrowRight':
        e.preventDefault();
        actions.seekForward();
        return true;
      default:
        return false;
    }
  }

  function handler(e: KeyboardEvent): void {
    handleKeyDown(e);
  }

  window.addEventListener('keydown', handler);

  function destroy(): void {
    window.removeEventListener('keydown', handler);
  }

  return {
    handleKeyDown,
    setInputFocused,
    destroy
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/shared/browser/keyboard-shortcuts.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/browser/keyboard-shortcuts.svelte.ts src/shared/browser/keyboard-shortcuts.test.ts
git commit -m "feat: add keyboard shortcuts manager with input guard"
```

---

### Task 5: ShortcutHelpDialog コンポーネント

**Files:**

- Create: `src/lib/components/ShortcutHelpDialog.svelte`
- Modify: `src/shared/i18n/*.json` (add shortcut i18n keys)

- [ ] **Step 1: Add i18n keys to en.json**

Add to `src/shared/i18n/en.json`:

```json
"shortcuts.title": "Keyboard Shortcuts",
"shortcuts.comment": "Comments",
"shortcuts.tab": "Tabs",
"shortcuts.playback": "Playback",
"shortcuts.other": "Other",
"shortcuts.focus_form": "Focus comment form",
"shortcuts.submit": "Submit comment",
"shortcuts.next_comment": "Next comment",
"shortcuts.prev_comment": "Previous comment",
"shortcuts.reply": "Reply to selected",
"shortcuts.like": "Like selected",
"shortcuts.clear_selection": "Clear selection / Close",
"shortcuts.flow_tab": "Switch to Flow",
"shortcuts.shout_tab": "Switch to Shout",
"shortcuts.info_tab": "Switch to Info",
"shortcuts.play_pause": "Play / Pause",
"shortcuts.seek_back": "Seek back 5s",
"shortcuts.seek_forward": "Seek forward 5s",
"shortcuts.bookmark": "Bookmark",
"shortcuts.share": "Share",
"shortcuts.show_help": "Show shortcuts"
```

Add corresponding translations to all other locale files.

- [ ] **Step 2: Create ShortcutHelpDialog**

```svelte
<!-- src/lib/components/ShortcutHelpDialog.svelte -->
<script lang="ts">
  import { t } from '$shared/i18n/t.js';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  const { open, onClose }: Props = $props();

  const sections = [
    {
      label: () => t('shortcuts.comment'),
      items: [
        { keys: ['n'], desc: () => t('shortcuts.focus_form') },
        { keys: ['Ctrl', 'Enter'], desc: () => t('shortcuts.submit') },
        { keys: ['j'], desc: () => t('shortcuts.next_comment') },
        { keys: ['k'], desc: () => t('shortcuts.prev_comment') },
        { keys: ['r'], desc: () => t('shortcuts.reply') },
        { keys: ['l'], desc: () => t('shortcuts.like') },
        { keys: ['Esc'], desc: () => t('shortcuts.clear_selection') }
      ]
    },
    {
      label: () => t('shortcuts.tab'),
      items: [
        { keys: ['f'], desc: () => t('shortcuts.flow_tab') },
        { keys: ['s'], desc: () => t('shortcuts.shout_tab') },
        { keys: ['i'], desc: () => t('shortcuts.info_tab') }
      ]
    },
    {
      label: () => t('shortcuts.playback'),
      items: [
        { keys: ['p'], desc: () => t('shortcuts.play_pause') },
        { keys: ['\u2190'], desc: () => t('shortcuts.seek_back') },
        { keys: ['\u2192'], desc: () => t('shortcuts.seek_forward') }
      ]
    },
    {
      label: () => t('shortcuts.other'),
      items: [
        { keys: ['b'], desc: () => t('shortcuts.bookmark') },
        { keys: ['Shift', 'S'], desc: () => t('shortcuts.share') },
        { keys: ['?'], desc: () => t('shortcuts.show_help') }
      ]
    }
  ];

  function handleBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-label={t('shortcuts.title')}
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
  >
    <div
      class="mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface-0 p-6 shadow-xl"
    >
      <h2 class="mb-4 font-display text-lg font-semibold text-text-primary">
        {t('shortcuts.title')}
      </h2>

      {#each sections as section}
        <div class="mb-4">
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
            {section.label()}
          </h3>
          <div class="space-y-1.5">
            {#each section.items as item}
              <div class="flex items-center justify-between py-1">
                <span class="text-sm text-text-secondary">{item.desc()}</span>
                <div class="flex items-center gap-1">
                  {#each item.keys as key}
                    <kbd
                      class="inline-flex min-w-[1.75rem] items-center justify-center rounded-md border border-border-subtle bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-text-primary"
                    >
                      {key}
                    </kbd>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}

      <div class="mt-4 flex justify-end">
        <button
          type="button"
          onclick={onClose}
          class="rounded-lg bg-surface-2 px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-3"
        >
          {t('confirm.ok')}
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 3: Verify type check passes**

Run: `pnpm format && pnpm check`
Expected: 0 ERRORS

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/ShortcutHelpDialog.svelte src/shared/i18n/
git commit -m "feat: add ShortcutHelpDialog component with i18n"
```

---

### Task 6: CommentCard に selected prop 追加

**Files:**

- Modify: `src/lib/components/CommentCard.svelte`

- [ ] **Step 1: Add selected prop and highlight ring**

In `CommentCard.svelte`, add `selected` prop:

```typescript
  selected?: boolean;
```

Destructure with default:

```typescript
  selected = false,
```

Update the root `<div>` to include highlight ring when selected:

Change the root div's class to include:

```
{selected ? 'ring-2 ring-accent/50' : ''}
```

- [ ] **Step 2: Verify type check passes**

Run: `pnpm check`
Expected: 0 ERRORS

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/CommentCard.svelte
git commit -m "feat: add selected highlight ring to CommentCard"
```

---

### Task 7: CommentList — j/k 選択状態 + r/l ハンドラ

**Files:**

- Modify: `src/lib/components/CommentList.svelte`

- [ ] **Step 1: Add selectedIndex state and selection methods**

In CommentList.svelte `<script>` section, add:

```typescript
import { createKeyboardShortcuts } from '$shared/browser/keyboard-shortcuts.svelte.js';
import { dispatchTogglePlayback } from '$shared/browser/playback-bridge.js';
import { dispatchSeek } from '$shared/browser/seek-bridge.js';
import { getPlayer } from '$shared/browser/player.js';
import ShortcutHelpDialog from './ShortcutHelpDialog.svelte';
```

Add state:

```typescript
let selectedIndex = $state(-1);
let shortcutHelpOpen = $state(false);
```

Add derived for currently visible comments:

```typescript
let visibleComments = $derived(
  vm.activeTab === 'flow' ? vm.timedComments : vm.activeTab === 'shout' ? vm.shoutComments : []
);
```

Add derived for selected comment:

```typescript
let selectedComment = $derived(
  selectedIndex >= 0 && selectedIndex < visibleComments.length
    ? visibleComments[selectedIndex]
    : null
);
```

Add helper to get the active VirtualScrollList:

```typescript
let activeVirtualList = $derived(
  vm.activeTab === 'flow'
    ? timedVirtualList
    : vm.activeTab === 'shout'
      ? shoutVirtualList
      : undefined
);
```

Reset selection on tab change:

```typescript
$effect(() => {
  vm.activeTab; // track
  selectedIndex = -1;
});
```

- [ ] **Step 2: Create keyboard shortcut actions and initialize**

```typescript
const SEEK_STEP = 5000; // 5 seconds

let shortcuts: ReturnType<typeof createKeyboardShortcuts> | undefined;

$effect(() => {
  shortcuts = createKeyboardShortcuts({
    focusForm: () => {
      if (vm.activeTab === 'info' || !vm.canWrite) return;
      const textarea = commentFormRef?.formEl?.querySelector('textarea');
      if (textarea instanceof HTMLTextAreaElement) textarea.focus();
    },
    switchToFlow: () => vm.setActiveTab('flow'),
    switchToShout: () => vm.setActiveTab('shout'),
    switchToInfo: () => vm.setActiveTab('info'),
    nextComment: () => {
      if (vm.activeTab === 'info') return;
      if (selectedIndex < visibleComments.length - 1) {
        selectedIndex += 1;
        activeVirtualList?.scrollToIndex(selectedIndex);
      }
    },
    prevComment: () => {
      if (vm.activeTab === 'info') return;
      if (selectedIndex > 0) {
        selectedIndex -= 1;
        activeVirtualList?.scrollToIndex(selectedIndex);
      } else if (selectedIndex === -1 && visibleComments.length > 0) {
        selectedIndex = 0;
        activeVirtualList?.scrollToIndex(0);
      }
    },
    replyToSelected: () => {
      if (!selectedComment || !vm.canWrite) return;
      vm.startReply(selectedComment);
    },
    likeSelected: () => {
      if (!selectedComment || !vm.canWrite) return;
      vm.sendReaction(selectedComment);
    },
    clearSelection: () => {
      selectedIndex = -1;
    },
    toggleBookmark: () => {
      if (!vm.canWrite) return;
      handleBookmarkClick();
    },
    openShare: () => {
      handleShareClick();
    },
    togglePlayback: () => {
      dispatchTogglePlayback();
    },
    seekBackward: () => {
      const player = getPlayer();
      const newPos = Math.max(0, player.position - SEEK_STEP);
      dispatchSeek(newPos);
    },
    seekForward: () => {
      const player = getPlayer();
      const newPos = Math.min(player.duration, player.position + SEEK_STEP);
      dispatchSeek(newPos);
    },
    showHelp: () => {
      shortcutHelpOpen = true;
    }
  });

  return () => shortcuts?.destroy();
});
```

- [ ] **Step 3: Track input focus for shortcut guard**

Add focus/blur handlers to detect when user is typing:

```typescript
function handleFocusIn(e: FocusEvent): void {
  const target = e.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    shortcuts?.setInputFocused(true);
  }
}

function handleFocusOut(e: FocusEvent): void {
  const target = e.relatedTarget;
  if (
    !(target instanceof HTMLInputElement) &&
    !(target instanceof HTMLTextAreaElement) &&
    !(target instanceof HTMLElement && target.isContentEditable)
  ) {
    shortcuts?.setInputFocused(false);
  }
}
```

Add `onfocusin={handleFocusIn} onfocusout={handleFocusOut}` to the root `<div>` of the component.

Actually, since shortcuts are global (window-level), the focus tracking should also be global. Better to use `$effect` with document listeners:

```typescript
$effect(() => {
  function onFocusIn(e: FocusEvent) {
    const t = e.target;
    if (
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      (t instanceof HTMLElement && t.isContentEditable)
    ) {
      shortcuts?.setInputFocused(true);
    }
  }
  function onFocusOut(e: FocusEvent) {
    const rt = e.relatedTarget;
    if (
      !(rt instanceof HTMLInputElement) &&
      !(rt instanceof HTMLTextAreaElement) &&
      !(rt instanceof HTMLElement && rt.isContentEditable)
    ) {
      shortcuts?.setInputFocused(false);
    }
  }
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  return () => {
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
  };
});
```

- [ ] **Step 4: Pass selected prop to CommentCard**

In the VirtualScrollList snippets where CommentCard is rendered, add the `selected` prop:

For timed (flow) tab:

```svelte
<CommentCard
  {comment}
  ...existing
  props...
  selected={selectedIndex === vm.timedComments.indexOf(comment)}
/>
```

For shout tab:

```svelte
<CommentCard
  {comment}
  ...existing
  props...
  selected={selectedIndex === vm.shoutComments.indexOf(comment)}
/>
```

Note: The VirtualScrollList renders items via a snippet that receives `item` and `index`. Use the `index` parameter instead of `indexOf`:

```svelte
{#snippet renderItem(comment, index)}
  <CommentCard {comment} ...existing props... selected={selectedIndex === index} />
{/snippet}
```

Check the actual snippet signature in CommentList.svelte and use the index parameter.

- [ ] **Step 5: Add ShortcutHelpDialog at bottom of component**

```svelte
<ShortcutHelpDialog open={shortcutHelpOpen} onClose={() => (shortcutHelpOpen = false)} />
```

- [ ] **Step 6: Verify format, lint, and type check**

Run: `pnpm format && pnpm lint && pnpm check`
Expected: 0 ERRORS

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/CommentList.svelte
git commit -m "feat: integrate keyboard shortcuts with comment selection in CommentList"
```

---

### Task 8: ユニットテスト + 全体検証

**Files:** All modified files

- [ ] **Step 1: Run full unit test suite**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 2: Run full validation**

Run: `pnpm format:check && pnpm lint && pnpm check && pnpm test`
Expected: ALL PASS

- [ ] **Step 3: Commit any test fixes**

```bash
git add -A
git commit -m "test: fix tests for keyboard shortcuts"
```

---

### Task 9: E2E テスト

**Files:**

- Create or modify: `e2e/keyboard-shortcuts.test.ts`

- [ ] **Step 1: Create E2E test for keyboard shortcuts**

```typescript
// e2e/keyboard-shortcuts.test.ts
import { expect, test } from '@playwright/test';

import { injectMockNostr, loginViaEvent, navigateToContent } from './helpers/test-auth.js';

test.describe('Keyboard shortcuts', () => {
  test('? opens shortcut help dialog', async ({ page }) => {
    await navigateToContent(page);
    await page.keyboard.press('?');
    await expect(page.getByText('Keyboard Shortcuts')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Keyboard Shortcuts')).not.toBeVisible();
  });

  test('f/s/i switches tabs', async ({ page }) => {
    await navigateToContent(page);

    // Default is flow
    await page.keyboard.press('s');
    await expect(page.locator('[class*="border-amber"]')).toBeVisible();

    await page.keyboard.press('i');
    // Info tab content visible
    await expect(page.getByText(/Open and comment|開いてコメント/i)).toBeVisible();

    await page.keyboard.press('f');
    await expect(page.locator('[class*="border-accent"]')).toBeVisible();
  });

  test('n focuses comment form when logged in', async ({ page }) => {
    await injectMockNostr(page);
    await navigateToContent(page);
    await loginViaEvent(page);

    await page.keyboard.press('n');
    const textarea = page.locator('textarea');
    await expect(textarea).toBeFocused();
  });
});
```

Note: Adjust imports and helpers based on existing E2E test patterns. Check `e2e/helpers/` for available helpers.

- [ ] **Step 2: Run E2E tests**

Run: `pnpm test:e2e`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add e2e/
git commit -m "test: add E2E tests for keyboard shortcuts"
```
