<script lang="ts">
  import { onDestroy } from 'svelte';

  import { page } from '$app/state';
  import type { Comment, ReactionStats } from '$features/comments/domain/comment-model.js';
  import CommentList from '$lib/components/CommentList.svelte';
  import { setContent, updatePlayback } from '$shared/browser/player.js';
  import { testProvider } from '$shared/content/test-provider.js';
  import type { ContentId } from '$shared/content/types.js';

  const contentId: ContentId = { platform: 'test', type: 'test', id: 'test' };
  const DURATION_MS = 180_000; // 3 minutes

  // --- Playback Simulator ---
  let playing = $state(false);
  let position = $state(0);
  let playIntervalId: ReturnType<typeof setInterval> | undefined;

  setContent(contentId);

  function togglePlay() {
    playing = !playing;
    if (playing) {
      playIntervalId = setInterval(() => {
        position = Math.min(position + 250, DURATION_MS);
        updatePlayback(position, DURATION_MS, false);
        if (position >= DURATION_MS) {
          playing = false;
          clearInterval(playIntervalId);
        }
      }, 250);
    } else {
      clearInterval(playIntervalId);
      updatePlayback(position, DURATION_MS, true);
    }
  }

  function seek(e: Event) {
    const target = e.target as HTMLInputElement;
    position = Number(target.value);
    updatePlayback(position, DURATION_MS, !playing);
  }

  function formatMs(ms: number): string {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  // --- Test comment data ---
  const TEST_MESSAGES_FLOW = [
    'Great intro! 🎶',
    'Love this part',
    'The melody here is beautiful',
    'Bass drop! 🔥',
    'Nice transition',
    'Guitar solo!',
    'Chill vibes ✨',
    'This beat is sick',
    'Vocals are amazing here',
    'Best part of the track'
  ];

  const TEST_MESSAGES_SHOUT = [
    'First time hearing this!',
    'Discovered on Resonote',
    'Anyone know similar artists?',
    'This track is a masterpiece 🔥',
    'Added to my playlist',
    'Great recommendation!',
    'Been listening on repeat',
    'The production quality is insane',
    'Underrated track',
    'Who else found this from the comments?'
  ];

  // Generate deterministic fake pubkeys for test identities
  const TEST_PUBKEYS = [
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  ];

  // --- Comment state ---
  let comments = $state<Comment[]>([]);
  let reactionIndex = $state<Map<string, ReactionStats>>(new Map());
  let nextId = 0;

  function randomPick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function addFlowComment() {
    const id = `test-${++nextId}-${Date.now()}`;
    const posMs = Math.floor(Math.random() * DURATION_MS);
    comments = [
      ...comments,
      {
        id,
        pubkey: randomPick(TEST_PUBKEYS),
        content: randomPick(TEST_MESSAGES_FLOW),
        createdAt: Math.floor(Date.now() / 1000),
        positionMs: posMs,
        emojiTags: [],
        replyTo: null,
        contentWarning: null
      }
    ];
  }

  function addShoutComment() {
    const id = `test-${++nextId}-${Date.now()}`;
    comments = [
      ...comments,
      {
        id,
        pubkey: randomPick(TEST_PUBKEYS),
        content: randomPick(TEST_MESSAGES_SHOUT),
        createdAt: Math.floor(Date.now() / 1000),
        positionMs: null,
        emojiTags: [],
        replyTo: null,
        contentWarning: null
      }
    ];
  }

  function addReaction() {
    if (comments.length === 0) return;
    const target = randomPick(comments);
    const current = reactionIndex.get(target.id) ?? {
      likes: 0,
      emojis: [],
      reactors: new Set<string>()
    };
    const reactor = randomPick(TEST_PUBKEYS);
    const updatedReactors = new Set(current.reactors);
    updatedReactors.add(reactor);
    reactionIndex = new Map(reactionIndex).set(target.id, {
      ...current,
      likes: updatedReactors.size,
      reactors: updatedReactors
    });
  }

  function deleteRandom() {
    if (comments.length === 0) return;
    const idx = Math.floor(Math.random() * comments.length);
    comments = comments.filter((_, i) => i !== idx);
  }

  function clearAll() {
    comments = [];
    reactionIndex = new Map();
  }

  // --- Auto mode ---
  let autoMode = $state(false);
  let autoIntervalId: ReturnType<typeof setInterval> | undefined;

  function toggleAutoMode() {
    autoMode = !autoMode;
    if (autoMode) {
      const scheduleNext = () => {
        const delay = 2000 + Math.random() * 1000;
        autoIntervalId = setInterval(() => {
          const r = Math.random();
          if (r < 0.4) addFlowComment();
          else if (r < 0.7) addShoutComment();
          else if (r < 0.9) addReaction();
          else deleteRandom();
        }, delay);
      };
      scheduleNext();
    } else {
      clearInterval(autoIntervalId);
    }
  }

  // --- Highlight from URL hash ---
  const highlightCommentId = $derived(
    page.url.hash.startsWith('#comment-') ? page.url.hash.slice('#comment-'.length) : undefined
  );

  // --- Recent links ---
  const recentLinks = $derived(
    comments.slice(-3).map((c) => ({
      id: c.id,
      content: c.content.slice(0, 30),
      url: `/test/test/test#comment-${c.id}`
    }))
  );

  onDestroy(() => {
    clearInterval(playIntervalId);
    clearInterval(autoIntervalId);
  });
</script>

<svelte:head>
  <title>Test Page — Resonote (DEV)</title>
</svelte:head>

<div class="mx-auto max-w-5xl space-y-6 p-4">
  <div class="flex items-center gap-3">
    <h1 class="font-display text-xl font-bold text-text-primary">Test Page</h1>
    <span class="rounded bg-yellow-500/20 px-2 py-0.5 text-xs font-semibold text-yellow-500">
      DEV only
    </span>
    <span class="font-mono text-xs text-text-muted">platform:test / type:test / id:test</span>
  </div>

  <div class="flex flex-col gap-6 md:flex-row">
    <!-- Left: Controls -->
    <div class="space-y-4 md:w-80 md:shrink-0">
      <!-- Playback Simulator -->
      <div class="space-y-3 rounded-xl border border-border bg-surface-1 p-4">
        <div class="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Playback Simulator
        </div>
        <div class="flex items-center gap-3">
          <button
            type="button"
            onclick={togglePlay}
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-base text-white transition-opacity hover:opacity-80"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <div class="min-w-0 flex-1 space-y-1">
            <input
              type="range"
              min="0"
              max={DURATION_MS}
              value={position}
              oninput={seek}
              class="w-full accent-accent"
              aria-label="Seek"
            />
            <div class="flex justify-between font-mono text-xs text-text-muted">
              <span>{formatMs(position)}</span>
              <span>{formatMs(DURATION_MS)}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span
            class="rounded px-1.5 py-0.5 text-xs font-medium {playing
              ? 'bg-green-900/60 text-green-400'
              : 'bg-zinc-700 text-zinc-400'}"
          >
            {playing ? 'PLAYING' : 'PAUSED'}
          </span>
          <span class="font-mono text-xs text-text-muted">{formatMs(position)}</span>
        </div>
      </div>

      <!-- Event Generator -->
      <div
        class="space-y-3 rounded-xl border border-dashed border-yellow-600/40 bg-yellow-950/20 p-4"
      >
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-yellow-500">EVENT GENERATOR</span>
          <span class="font-mono text-xs text-text-muted">{comments.length} comments</span>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            onclick={addFlowComment}
            class="rounded bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/30"
          >
            + Flow Comment
          </button>
          <button
            type="button"
            onclick={addShoutComment}
            class="rounded bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/30"
          >
            + Shout
          </button>
          <button
            type="button"
            onclick={addReaction}
            class="rounded bg-pink-500/20 px-3 py-1.5 text-xs font-medium text-pink-400 transition-colors hover:bg-pink-500/30"
          >
            + Reaction
          </button>
          <button
            type="button"
            onclick={deleteRandom}
            class="rounded bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/30"
          >
            Delete Random
          </button>
          <button
            type="button"
            onclick={clearAll}
            class="rounded bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-600"
          >
            Clear All
          </button>
        </div>

        <button
          type="button"
          onclick={toggleAutoMode}
          class="rounded px-3 py-1.5 text-xs font-medium transition-colors {autoMode
            ? 'bg-yellow-500 text-black hover:bg-yellow-400'
            : 'bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30'}"
        >
          {autoMode ? '⏹ Stop Auto' : '▶ Auto Mode (2–3 s)'}
        </button>
      </div>

      <!-- Link test -->
      {#if recentLinks.length > 0}
        <div class="space-y-2 rounded-xl border border-border bg-surface-1 p-4">
          <div class="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Link Test (last 3)
          </div>
          {#each recentLinks as link (link.id)}
            <a
              href={link.url}
              class="block truncate rounded bg-surface-2 px-3 py-1.5 font-mono text-xs text-accent hover:underline"
            >
              {link.url}
            </a>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Right: Comment section -->
    <div class="min-w-0 flex-1">
      <!-- Debug state -->
      <div class="mb-2 rounded bg-zinc-800 px-3 py-1.5 font-mono text-xs text-zinc-400">
        comments: {comments.length} (flow: {comments.filter(
          (c) => c.positionMs !== null && c.replyTo === null
        ).length}, shout: {comments.filter((c) => c.positionMs === null && c.replyTo === null)
          .length})
      </div>
      <CommentList
        {comments}
        {reactionIndex}
        {contentId}
        provider={testProvider}
        loading={false}
        {highlightCommentId}
      />
    </div>
  </div>
</div>
