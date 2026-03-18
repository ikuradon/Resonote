<script lang="ts">
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import VirtualScrollList from '$lib/components/VirtualScrollList.svelte';
  import { onMount, onDestroy } from 'svelte';

  // --- Toggle states ---
  let sending = $state(false);
  let liked = $state(false);
  let confirmOpen = $state(false);
  let spotifyReady = $state(false);
  let youtubeReady = $state(false);

  function simulateSend() {
    sending = true;
    setTimeout(() => (sending = false), 2000);
  }

  // --- Virtual Scroll Demo ---
  interface DemoComment {
    id: string;
    author: string;
    content: string;
    positionMs: number;
    createdAt: number;
    arrivedAt: number;
    hasCW?: boolean;
    hasEmoji?: boolean;
  }

  const ADJECTIVES = ['Great', 'Amazing', 'Love this', 'Nice', 'Cool', 'Interesting', 'Wow'];
  const SUFFIXES = [
    'part!',
    'moment here',
    'beat drop',
    'section',
    'transition',
    'melody',
    'vibe',
    'solo',
    'hook',
    'chorus'
  ];
  const AUTHORS = ['alice', 'bob', 'carol', 'dave', 'eve', 'frank', 'grace', 'heidi'];
  const LONG_TEXTS = [
    'This is a much longer comment that spans multiple lines to test dynamic height handling in the virtual scroll component. The comment card should expand to fit this content naturally.',
    'Short',
    'Another extended comment with lots of detail about the track. I really enjoyed the way the bass line interacts with the melody at this point. The producer did an excellent job here.',
    'Medium length comment with some extra words to make it a bit taller than the short ones but not as tall as the really long ones.',
    "Five lines worth of content to really push the dynamic height. This comment discusses the intricate layering of instruments in the bridge section. The synthesizer pad creates an ethereal atmosphere while the drums maintain a steady groove. I particularly love how the vocals soar over the top. It's moments like these that make music so special and worth discussing."
  ];
  const CW_REASONS = ['spoiler', 'loud section', 'controversial opinion'];
  const CUSTOM_EMOJIS = [
    {
      shortcode: 'fire',
      url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f525.svg'
    },
    {
      shortcode: 'heart_eyes',
      url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f60d.svg'
    },
    {
      shortcode: 'musical_note',
      url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f3b5.svg'
    },
    {
      shortcode: 'star',
      url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/2b50.svg'
    },
    {
      shortcode: 'thumbsup',
      url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f44d.svg'
    }
  ];

  let nextId = $state(0);

  function randomComment(positionMs?: number, isNew = false): DemoComment {
    const id = `demo-${nextId++}`;
    const roll = Math.random();
    let content: string;
    if (roll < 0.2) {
      content = LONG_TEXTS[Math.floor(Math.random() * LONG_TEXTS.length)];
    } else {
      content = `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]} ${SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)]}`;
    }
    return {
      id,
      author: AUTHORS[Math.floor(Math.random() * AUTHORS.length)],
      content,
      positionMs: positionMs ?? Math.floor(Math.random() * 300_000),
      createdAt: Date.now(),
      arrivedAt: isNew ? Date.now() : 0,
      hasCW: Math.random() < 0.08,
      hasEmoji: Math.random() < 0.15
    };
  }

  // --- FPS counter ---
  let fps = $state(0);
  let fpsFrames = 0;
  let fpsLastTime = 0;
  let fpsRafId: number | undefined;

  function fpsLoop(now: number) {
    fpsFrames++;
    if (now - fpsLastTime >= 1000) {
      fps = fpsFrames;
      fpsFrames = 0;
      fpsLastTime = now;
    }
    fpsRafId = requestAnimationFrame(fpsLoop);
  }

  // --- Auto-add mode ---
  let autoAddEnabled = $state(false);
  let autoAddTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleAutoAdd() {
    if (!autoAddEnabled) return;
    const delay = 500 + Math.random() * 2500;
    autoAddTimer = setTimeout(() => {
      addRandomComment(true);
      scheduleAutoAdd();
    }, delay);
  }

  function toggleAutoAdd() {
    autoAddEnabled = !autoAddEnabled;
    if (autoAddEnabled) {
      scheduleAutoAdd();
    } else if (autoAddTimer) {
      clearTimeout(autoAddTimer);
      autoAddTimer = undefined;
    }
  }

  // --- New comment highlight ---
  const NEW_HIGHLIGHT_MS = 3_000;
  // Periodically expire highlights (every 500ms)
  let highlightTick = $state(0);
  let highlightInterval: ReturnType<typeof setInterval> | undefined;

  // Generate initial sorted comments
  function generateInitial(count: number): DemoComment[] {
    const arr: DemoComment[] = [];
    for (let i = 0; i < count; i++) {
      arr.push(randomComment());
    }
    return arr.sort((a, b) => a.positionMs - b.positionMs);
  }

  let demoComments = $state<DemoComment[]>(generateInitial(200));

  // Playback emulation
  let playbackMs = $state(0);
  let playbackPlaying = $state(false);
  let playbackInterval: ReturnType<typeof setInterval> | undefined;
  const PLAYBACK_DURATION = 300_000; // 5 min track

  function formatMs(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  function togglePlayback() {
    if (playbackPlaying) {
      clearInterval(playbackInterval);
      playbackInterval = undefined;
      playbackPlaying = false;
    } else {
      playbackPlaying = true;
      playbackInterval = setInterval(() => {
        playbackMs += 1000;
        if (playbackMs >= PLAYBACK_DURATION) {
          playbackMs = 0;
        }
      }, 1000);
    }
  }

  function seekTo(ms: number) {
    playbackMs = Math.max(0, Math.min(ms, PLAYBACK_DURATION));
  }

  // Auto-scroll: find the index of the comment closest to current position
  let virtualList: VirtualScrollList<DemoComment> | undefined;
  let autoScrollEnabled = $state(true);
  let userScrolledAway = $state(false);

  // Find index of nearest comment at or before current position
  function findNearestIndex(posMs: number): number {
    let lo = 0;
    let hi = demoComments.length - 1;
    let result = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (demoComments[mid].positionMs <= posMs) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  }

  $effect(() => {
    if (autoScrollEnabled && !userScrolledAway && demoComments.length > 0 && virtualList) {
      const idx = findNearestIndex(playbackMs);
      virtualList.scrollToIndex(idx);
    }
  });

  // Track visible range for scroll-away detection
  let visibleStart = $state(0);
  let visibleEnd = $state(0);

  function handleRangeChange(start: number, end: number) {
    visibleStart = start;
    visibleEnd = end;
    // Only detect user-scroll-away when NOT in a programmatic scroll
    if (autoScrollEnabled && virtualList && !virtualList.isAutoScrolling()) {
      const target = findNearestIndex(playbackMs);
      if (target < start || target > end) {
        userScrolledAway = true;
      }
    }
  }

  function jumpToNow() {
    userScrolledAway = false;
    if (virtualList) {
      virtualList.scrollToIndex(findNearestIndex(playbackMs));
    }
  }

  // Insert random comment near current position
  function addRandomComment(isNew = false) {
    const jitter = (Math.random() - 0.5) * 10_000;
    const pos = Math.max(0, Math.min(playbackMs + jitter, PLAYBACK_DURATION));
    const comment = randomComment(pos, isNew);
    // Binary insert
    let lo = 0;
    let hi = demoComments.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (demoComments[mid].positionMs <= pos) lo = mid + 1;
      else hi = mid;
    }
    demoComments = [...demoComments.slice(0, lo), comment, ...demoComments.slice(lo)];
  }

  // Delete a random visible comment
  function deleteRandomComment() {
    if (demoComments.length === 0) return;
    const idx = visibleStart + Math.floor(Math.random() * (visibleEnd - visibleStart + 1));
    const safeIdx = Math.min(Math.max(0, idx), demoComments.length - 1);
    demoComments = [...demoComments.slice(0, safeIdx), ...demoComments.slice(safeIdx + 1)];
  }

  // Bulk add
  function addBulk(count: number) {
    const newComments = [];
    for (let i = 0; i < count; i++) {
      newComments.push(randomComment());
    }
    demoComments = [...demoComments, ...newComments].sort((a, b) => a.positionMs - b.positionMs);
  }

  // Highlight threshold
  const HIGHLIGHT_MS = 5_000;

  onMount(() => {
    fpsLastTime = performance.now();
    fpsRafId = requestAnimationFrame(fpsLoop);
    highlightInterval = setInterval(() => {
      highlightTick++;
    }, 500);
  });

  onDestroy(() => {
    if (fpsRafId) cancelAnimationFrame(fpsRafId);
    if (highlightInterval) clearInterval(highlightInterval);
    if (autoAddTimer) clearTimeout(autoAddTimer);
    if (playbackInterval) clearInterval(playbackInterval);
  });

  // CW reveal state for demo
  let revealedCW = $state(new Set<string>());
</script>

<div class="mx-auto max-w-4xl space-y-12">
  <div>
    <h1 class="font-display text-2xl font-bold text-text-primary">Component Playbook</h1>
    <p class="mt-1 text-sm text-text-muted">各コンポーネントの状態を切り替えて動作確認できます</p>
  </div>

  <!-- ========== Section: Action Buttons ========== -->
  <section class="space-y-4">
    <h2 class="font-display text-lg font-semibold text-text-primary">Action Buttons</h2>
    <div class="h-px bg-border-subtle"></div>

    <!-- Send Button -->
    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h3 class="mb-3 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        Send Button
      </h3>
      <div class="flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={sending}
          onclick={simulateSend}
          class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-surface-0 transition-all duration-200 hover:bg-accent-hover disabled:opacity-30"
        >
          {#if sending}
            <svg
              aria-hidden="true"
              class="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Sending
          {:else}
            <svg
              aria-hidden="true"
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Send
          {/if}
        </button>
        <button
          type="button"
          disabled
          class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-surface-0 transition-all duration-200 hover:bg-accent-hover disabled:opacity-30"
        >
          <svg
            aria-hidden="true"
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          Send
        </button>
        <span class="text-xs text-text-muted">← disabled</span>
      </div>
      <p class="mt-2 text-xs text-text-muted">クリックで2秒間送信中状態をシミュレーション</p>
    </div>

    <!-- Reply Button -->
    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h3 class="mb-3 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        Reply Submit Button
      </h3>
      <div class="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onclick={simulateSend}
          disabled={sending}
          class="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-surface-0 transition-all duration-200 hover:bg-accent-hover disabled:opacity-30"
        >
          {#if sending}
            <svg
              aria-hidden="true"
              class="h-3.5 w-3.5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Sending
          {:else}
            Reply
          {/if}
        </button>
        <button
          type="button"
          disabled={sending}
          class="rounded-lg px-3 py-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary disabled:opacity-30"
        >
          Cancel
        </button>
      </div>
    </div>

    <!-- Share Button -->
    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h3 class="mb-3 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        Share / Post Button
      </h3>
      <div class="flex flex-wrap items-center gap-4">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-text-secondary transition-all duration-200 hover:bg-surface-3 hover:text-text-primary"
        >
          <svg
            aria-hidden="true"
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          Share
        </button>
        <button
          type="button"
          onclick={simulateSend}
          disabled={sending}
          class="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-surface-0 transition-all duration-200 hover:bg-accent-hover disabled:opacity-30"
        >
          {#if sending}
            <svg
              aria-hidden="true"
              class="h-3.5 w-3.5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Sending
          {:else}
            Post
          {/if}
        </button>
      </div>
    </div>

    <!-- Logout Button -->
    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h3 class="mb-3 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        Logout Button
      </h3>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-secondary transition-all duration-200 hover:bg-surface-3 hover:text-text-primary"
      >
        <svg
          aria-hidden="true"
          class="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Logout
      </button>
    </div>
  </section>

  <!-- ========== Section: Comment Action Icons ========== -->
  <section class="space-y-4">
    <h2 class="font-display text-lg font-semibold text-text-primary">Comment Action Icons</h2>
    <div class="h-px bg-border-subtle"></div>

    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h3 class="mb-3 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        Interactive States
      </h3>
      <div class="flex items-center gap-1">
        <!-- Like -->
        <button
          type="button"
          onclick={() => (liked = !liked)}
          class="inline-flex items-center gap-1 rounded-lg p-1.5 transition-colors
            {liked ? 'text-accent' : 'text-text-muted hover:text-accent'}"
          title={liked ? 'Liked' : 'Like'}
        >
          <svg
            aria-hidden="true"
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill={liked ? 'currentColor' : 'none'}
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            />
          </svg>
          <span class="text-xs font-mono">3</span>
        </button>

        <!-- Emoji -->
        <button
          type="button"
          class="rounded-lg p-1.5 text-text-muted transition-colors hover:text-text-secondary"
          title="Emoji"
        >
          <svg
            aria-hidden="true"
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </button>

        <!-- Reply -->
        <button
          type="button"
          class="rounded-lg p-1.5 text-text-muted transition-colors hover:text-accent"
          title="Reply"
        >
          <svg
            aria-hidden="true"
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="9 17 4 12 9 7" />
            <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
          </svg>
        </button>

        <!-- Delete -->
        <button
          type="button"
          onclick={() => (confirmOpen = true)}
          class="ml-auto rounded-lg p-1.5 text-text-muted transition-colors hover:text-red-400"
          title="Delete"
        >
          <svg
            aria-hidden="true"
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="3 6 5 6 21 6" />
            <path
              d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
            />
          </svg>
        </button>
      </div>
      <p class="mt-3 text-xs text-text-muted">
        ハートをクリックでlike切替、ゴミ箱で削除確認ダイアログを表示
      </p>
    </div>

    <!-- All icons reference -->
    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h3 class="mb-3 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        Icon Reference
      </h3>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {#each [{ name: 'Like', icon: 'heart' }, { name: 'Emoji', icon: 'smile' }, { name: 'Reply', icon: 'reply' }, { name: 'Delete', icon: 'trash' }, { name: 'Send', icon: 'send' }, { name: 'Share', icon: 'share' }, { name: 'Logout', icon: 'logout' }, { name: 'Close', icon: 'close' }] as item (item.name)}
          <div class="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
            <div class="rounded-lg bg-surface-3 p-2 text-text-secondary">
              {#if item.icon === 'heart'}
                <svg
                  aria-hidden="true"
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                  />
                </svg>
              {:else if item.icon === 'smile'}
                <svg
                  aria-hidden="true"
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" />
                  <line x1="15" y1="9" x2="15.01" y2="9" />
                </svg>
              {:else if item.icon === 'reply'}
                <svg
                  aria-hidden="true"
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="9 17 4 12 9 7" />
                  <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                </svg>
              {:else if item.icon === 'trash'}
                <svg
                  aria-hidden="true"
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                </svg>
              {:else if item.icon === 'send'}
                <svg
                  aria-hidden="true"
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              {:else if item.icon === 'share'}
                <svg
                  aria-hidden="true"
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              {:else if item.icon === 'logout'}
                <svg
                  aria-hidden="true"
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              {:else if item.icon === 'close'}
                <svg
                  aria-hidden="true"
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              {/if}
            </div>
            <span class="text-xs font-medium text-text-secondary">{item.name}</span>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- ========== Section: Loading Overlays ========== -->
  <section class="space-y-4">
    <h2 class="font-display text-lg font-semibold text-text-primary">Embed Loading Overlays</h2>
    <div class="h-px bg-border-subtle"></div>

    <!-- Spotify Loading -->
    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-xs font-semibold tracking-wide text-text-secondary uppercase">
          Spotify Embed
        </h3>
        <button
          type="button"
          onclick={() => (spotifyReady = !spotifyReady)}
          class="rounded-lg bg-surface-2 px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-3"
        >
          {spotifyReady ? 'Show Loading' : 'Show Ready'}
        </button>
      </div>
      <div
        class="relative w-full overflow-hidden rounded-2xl border border-border-subtle shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
      >
        <div class="h-[352px] bg-surface-0"></div>
        {#if !spotifyReady}
          <div
            class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-1"
          >
            <div class="flex items-center gap-3">
              <svg
                aria-hidden="true"
                class="h-8 w-8 text-spotify"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"
                />
              </svg>
              <span class="text-sm font-medium text-text-muted">Loading...</span>
            </div>
            <div class="w-48">
              <div class="h-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  class="animate-shimmer h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-spotify/40 to-transparent"
                  style="background-size: 400px 100%;"
                ></div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- YouTube Loading -->
    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-xs font-semibold tracking-wide text-text-secondary uppercase">
          YouTube Embed
        </h3>
        <button
          type="button"
          onclick={() => (youtubeReady = !youtubeReady)}
          class="rounded-lg bg-surface-2 px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-3"
        >
          {youtubeReady ? 'Show Loading' : 'Show Ready'}
        </button>
      </div>
      <div
        class="relative aspect-video w-full overflow-hidden rounded-2xl border border-border-subtle shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
      >
        <div class="h-full bg-surface-0"></div>
        {#if !youtubeReady}
          <div
            class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-1"
          >
            <div class="flex items-center gap-3">
              <svg
                aria-hidden="true"
                class="h-8 w-8 text-youtube"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
                />
              </svg>
              <span class="text-sm font-medium text-text-muted">Loading...</span>
            </div>
            <div class="w-48">
              <div class="h-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  class="animate-shimmer h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-youtube/40 to-transparent"
                  style="background-size: 400px 100%;"
                ></div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </section>

  <!-- ========== Section: Confirm Dialog ========== -->
  <section class="space-y-4">
    <h2 class="font-display text-lg font-semibold text-text-primary">Confirm Dialog</h2>
    <div class="h-px bg-border-subtle"></div>

    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h3 class="mb-3 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        Delete Confirmation
      </h3>
      <button
        type="button"
        onclick={() => (confirmOpen = true)}
        class="rounded-lg bg-error px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110"
      >
        Open Dialog
      </button>
      <p class="mt-2 text-xs text-text-muted">Escapeキーまたはバックドロップクリックでも閉じます</p>
    </div>
  </section>

  <!-- ========== Section: Form States ========== -->
  <section class="space-y-4">
    <h2 class="font-display text-lg font-semibold text-text-primary">Form States</h2>
    <div class="h-px bg-border-subtle"></div>

    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <h3 class="mb-3 text-xs font-semibold tracking-wide text-text-secondary uppercase">
        Comment Form (Sending State)
      </h3>
      <div class="space-y-2">
        <div class="flex items-center gap-2 text-xs">
          <button
            type="button"
            disabled={sending}
            class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-all duration-200
              {!sending
              ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
              : 'cursor-not-allowed bg-surface-3 text-text-muted/40'}"
          >
            <span class="font-mono">1:23</span>
            <span>時間コメント</span>
          </button>
          <button
            type="button"
            disabled={sending}
            class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-all duration-200 bg-surface-3 text-text-muted hover:text-text-secondary disabled:cursor-not-allowed disabled:opacity-40"
          >
            全体コメント
          </button>
        </div>

        <div class="flex items-center gap-3">
          <textarea
            disabled={sending}
            placeholder={sending ? '' : 'この瞬間にコメント...'}
            rows="1"
            class="flex-1 resize-none rounded-xl border border-border bg-surface-1 px-4 py-2.5 text-sm text-text-primary placeholder-text-muted transition-all duration-200 focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none disabled:opacity-40"
          ></textarea>
          <button
            type="button"
            onclick={simulateSend}
            disabled={sending}
            class="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-surface-0 transition-all duration-200 hover:bg-accent-hover disabled:opacity-30"
          >
            {#if sending}
              <svg
                aria-hidden="true"
                class="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Sending
            {:else}
              <svg
                aria-hidden="true"
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              Send
            {/if}
          </button>
        </div>
      </div>
      <p class="mt-2 text-xs text-text-muted">
        Sendクリックで送信中状態: textarea、位置切替ボタン、Sendボタンすべてが無効化
      </p>
    </div>
  </section>

  <!-- ========== Section: Spinner ========== -->
  <section class="space-y-4">
    <h2 class="font-display text-lg font-semibold text-text-primary">Spinner</h2>
    <div class="h-px bg-border-subtle"></div>

    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <div class="flex items-center gap-6">
        <div class="flex flex-col items-center gap-2">
          <svg
            aria-hidden="true"
            class="h-4 w-4 animate-spin text-accent"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span class="text-xs text-text-muted">h-4 w-4</span>
        </div>
        <div class="flex flex-col items-center gap-2">
          <svg
            aria-hidden="true"
            class="h-3.5 w-3.5 animate-spin text-accent"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span class="text-xs text-text-muted">h-3.5 w-3.5</span>
        </div>
        <div class="flex flex-col items-center gap-2">
          <svg
            aria-hidden="true"
            class="h-6 w-6 animate-spin text-accent"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span class="text-xs text-text-muted">h-6 w-6</span>
        </div>
      </div>
    </div>
  </section>

  <!-- ========== Section: Virtual Scroll Demo ========== -->
  <section class="space-y-4">
    <h2 class="font-display text-lg font-semibold text-text-primary">
      Virtual Scroll Comment List
    </h2>
    <div class="h-px bg-border-subtle"></div>

    <div class="rounded-xl border border-border-subtle bg-surface-1 p-5">
      <!-- Playback Controls -->
      <div class="mb-4 space-y-3">
        <h3 class="text-xs font-semibold tracking-wide text-text-secondary uppercase">
          Playback Emulation
        </h3>
        <div class="flex items-center gap-3">
          <button
            type="button"
            onclick={togglePlayback}
            class="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-surface-0 transition-colors hover:bg-accent-hover"
          >
            {playbackPlaying ? 'Pause' : 'Play'}
          </button>
          <span class="font-mono text-sm text-text-primary">{formatMs(playbackMs)}</span>
          <span class="text-xs text-text-muted">/ {formatMs(PLAYBACK_DURATION)}</span>
          <input
            type="range"
            min="0"
            max={PLAYBACK_DURATION}
            bind:value={playbackMs}
            class="flex-1"
          />
        </div>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-1.5 text-xs text-text-muted">
            <input type="checkbox" bind:checked={autoScrollEnabled} />
            Auto-scroll
          </label>
          {#if userScrolledAway}
            <button
              type="button"
              onclick={jumpToNow}
              class="rounded-lg bg-accent/20 px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/30"
            >
              Jump to now
            </button>
          {/if}
        </div>
      </div>

      <!-- Comment Actions -->
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onclick={() => addRandomComment(true)}
          class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-3"
        >
          + Add
        </button>
        <button
          type="button"
          onclick={deleteRandomComment}
          class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-3"
        >
          - Delete
        </button>
        <button
          type="button"
          onclick={() => addBulk(50)}
          class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-3"
        >
          +50
        </button>
        <button
          type="button"
          onclick={() => addBulk(500)}
          class="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-3"
        >
          +500
        </button>
        <button
          type="button"
          onclick={toggleAutoAdd}
          class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors
            {autoAddEnabled
            ? 'bg-accent text-surface-0'
            : 'bg-surface-2 text-text-secondary hover:bg-surface-3'}"
        >
          {autoAddEnabled ? 'Auto: ON' : 'Auto: OFF'}
        </button>
        <div class="ml-auto flex items-center gap-3 text-xs text-text-muted">
          <span>{demoComments.length} comments</span>
          <span>visible: {visibleStart}-{visibleEnd}</span>
          <span
            class="font-mono {fps < 30
              ? 'text-error'
              : fps < 55
                ? 'text-amber-400'
                : 'text-emerald-400'}">{fps} fps</span
          >
        </div>
      </div>

      <!-- Virtual Scroll List -->
      <div class="h-[500px] overflow-hidden rounded-lg border border-border-subtle">
        <VirtualScrollList
          bind:this={virtualList}
          items={demoComments}
          keyFn={(c) => c.id}
          estimateHeight={80}
          overscan={5}
          onRangeChange={handleRangeChange}
        >
          {#snippet children({ item, index })}
            {@const nearCurrent = Math.abs(item.positionMs - playbackMs) < HIGHLIGHT_MS}
            {@const isNew =
              highlightTick >= 0 &&
              item.arrivedAt > 0 &&
              Date.now() - item.arrivedAt < NEW_HIGHLIGHT_MS}
            <div
              class="border-b border-border-subtle px-4 py-3 transition-colors duration-500
                {isNew
                ? 'bg-accent/20'
                : nearCurrent
                  ? 'bg-accent/10'
                  : 'bg-surface-1 hover:bg-surface-2'}"
            >
              <div class="mb-1 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div
                    class="flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-xs text-text-muted"
                  >
                    {item.author[0].toUpperCase()}
                  </div>
                  <span class="text-xs font-medium text-accent">{item.author}</span>
                  <button
                    type="button"
                    onclick={() => seekTo(item.positionMs)}
                    class="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-xs text-accent transition-colors hover:bg-accent/20"
                  >
                    {formatMs(item.positionMs)}
                  </button>
                  {#if isNew}
                    <span class="text-xs font-semibold text-accent">NEW</span>
                  {/if}
                </div>
                <span class="text-xs text-text-muted">#{index}</span>
              </div>
              {#if item.hasCW && !revealedCW.has(item.id)}
                <div
                  class="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-text-muted"
                >
                  <svg
                    aria-hidden="true"
                    class="h-4 w-4 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <span class="flex-1">CW: {CW_REASONS[index % CW_REASONS.length]}</span>
                  <button
                    type="button"
                    onclick={() => (revealedCW = new Set([...revealedCW, item.id]))}
                    class="rounded px-2 py-0.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
                  >
                    Show
                  </button>
                </div>
              {:else}
                <p class="text-sm leading-relaxed text-text-primary">
                  {item.content}
                  {#if item.hasEmoji}
                    {@const emoji = CUSTOM_EMOJIS[index % CUSTOM_EMOJIS.length]}
                    <img
                      src={emoji.url}
                      alt=":{emoji.shortcode}:"
                      class="ml-1 inline h-5 w-5"
                      loading="lazy"
                    />
                  {/if}
                </p>
              {/if}
            </div>
          {/snippet}
        </VirtualScrollList>
      </div>

      <p class="mt-3 text-xs text-text-muted">
        VirtualScrollList (自前コンポーネント, ResizeObserver + 高さキャッシュ)
        による仮想スクロール。再生位置に連動してスクロール、付近のコメントをハイライト。手動スクロールで離脱すると「Jump
        to now」ボタン表示。
      </p>
    </div>
  </section>

  <!-- ========== Section: Color Palette ========== -->
  <section class="space-y-4 pb-12">
    <h2 class="font-display text-lg font-semibold text-text-primary">Color Palette</h2>
    <div class="h-px bg-border-subtle"></div>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {#each [{ name: 'Accent', color: 'bg-accent', text: '#c9a256' }, { name: 'Accent Hover', color: 'bg-accent-hover', text: '#ddb668' }, { name: 'Nostr', color: 'bg-nostr', text: '#9b7ddb' }, { name: 'Spotify', color: 'bg-spotify', text: '#1db954' }, { name: 'YouTube', color: 'bg-youtube', text: '#ff0000' }, { name: 'Error', color: 'bg-error', text: '#e5534b' }, { name: 'Surface 0', color: 'bg-surface-0', text: '#06060a' }, { name: 'Surface 1', color: 'bg-surface-1', text: '#0f0f14' }, { name: 'Surface 2', color: 'bg-surface-2', text: '#1a1a22' }, { name: 'Surface 3', color: 'bg-surface-3', text: '#24242e' }, { name: 'Text Primary', color: 'bg-text-primary', text: '#e8e6e3' }, { name: 'Text Muted', color: 'bg-text-muted', text: '#5a584f' }] as swatch (swatch.name)}
        <div class="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
          <div class="h-8 w-8 rounded-lg border border-border {swatch.color}"></div>
          <div>
            <p class="text-xs font-medium text-text-secondary">{swatch.name}</p>
            <p class="font-mono text-xs text-text-muted">{swatch.text}</p>
          </div>
        </div>
      {/each}
    </div>
  </section>
</div>

<ConfirmDialog
  open={confirmOpen}
  title="コメントを削除"
  message="このコメントを削除しますか？この操作は取り消せません。"
  confirmLabel="削除"
  cancelLabel="キャンセル"
  onConfirm={() => (confirmOpen = false)}
  onCancel={() => (confirmOpen = false)}
/>
