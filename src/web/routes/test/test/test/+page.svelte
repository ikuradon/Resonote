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

  // --- Long text variants ---
  const LONG_MESSAGES = [
    'This is an absolutely incredible track that I have been listening to on repeat for the past week. The production quality is outstanding and every single element comes together perfectly. I cannot recommend this enough to anyone who enjoys this genre of music. Truly a masterpiece!',
    "I first discovered this artist through a friend's recommendation and I have to say, this particular track exceeded all my expectations. The way the melody builds and the harmonies layer on top of each other creates such a rich and immersive listening experience.",
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa (testing long unbreakable text)'
  ];

  // --- CW reasons ---
  const CW_REASONS = ['Spoiler', 'NSFW', 'Sensitive content', ''];

  // --- Custom emoji sets ---
  const CUSTOM_EMOJI_SETS: string[][][] = [
    [['emoji', 'catjam', 'https://cdn.betterttv.net/emote/5f1b0186cf6d2144653d2970/3x.webp']],
    [
      ['emoji', 'pepeJAM', 'https://cdn.betterttv.net/emote/5b77ac3af7571e42e6ccc5a1/3x.webp'],
      ['emoji', 'monkaS', 'https://cdn.betterttv.net/emote/56e9f494fff3cc5c35e5287e/3x.webp']
    ],
    []
  ];

  function makeComment(overrides: Partial<Comment> = {}): Comment {
    const id = `test-${++nextId}-${Date.now()}`;
    return {
      id,
      pubkey: randomPick(TEST_PUBKEYS),
      content: '',
      createdAt: Math.floor(Date.now() / 1000),
      positionMs: null,
      emojiTags: [],
      replyTo: null,
      contentWarning: null,
      ...overrides
    };
  }

  function addFlowComment() {
    comments = [
      ...comments,
      makeComment({
        content: randomPick(TEST_MESSAGES_FLOW),
        positionMs: Math.floor(Math.random() * DURATION_MS)
      })
    ];
  }

  function addShoutComment() {
    comments = [...comments, makeComment({ content: randomPick(TEST_MESSAGES_SHOUT) })];
  }

  function addLongComment() {
    const isTimed = Math.random() > 0.5;
    comments = [
      ...comments,
      makeComment({
        content: randomPick(LONG_MESSAGES),
        positionMs: isTimed ? Math.floor(Math.random() * DURATION_MS) : null
      })
    ];
  }

  function addCWComment() {
    const isTimed = Math.random() > 0.5;
    comments = [
      ...comments,
      makeComment({
        content: randomPick([...TEST_MESSAGES_FLOW, ...TEST_MESSAGES_SHOUT]),
        positionMs: isTimed ? Math.floor(Math.random() * DURATION_MS) : null,
        contentWarning: randomPick(CW_REASONS)
      })
    ];
  }

  function addEmojiComment() {
    const emojiTags = randomPick(CUSTOM_EMOJI_SETS);
    const shortcodes = emojiTags.map((t) => `:${t[1]}:`).join(' ');
    const isTimed = Math.random() > 0.5;
    comments = [
      ...comments,
      makeComment({
        content: `Check this out ${shortcodes} so cool!`,
        positionMs: isTimed ? Math.floor(Math.random() * DURATION_MS) : null,
        emojiTags
      })
    ];
  }

  function addReply() {
    const topLevel = comments.filter((c) => c.replyTo === null);
    if (topLevel.length === 0) return;
    const parent = randomPick(topLevel);
    comments = [
      ...comments,
      makeComment({
        content: `Replying to "${parent.content.slice(0, 30)}..." — totally agree!`,
        replyTo: parent.id,
        positionMs: parent.positionMs
      })
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

    // Occasionally add custom emoji reaction
    const emojis = [...current.emojis];
    if (Math.random() > 0.7) {
      const emojiSet = randomPick(CUSTOM_EMOJI_SETS);
      if (emojiSet.length > 0) {
        const tag = emojiSet[0];
        const existing = emojis.find((e) => e.content === `:${tag[1]}:`);
        if (existing) {
          existing.count++;
        } else {
          emojis.push({ content: `:${tag[1]}:`, url: tag[2], count: 1 });
        }
      }
    }

    reactionIndex = new Map(reactionIndex).set(target.id, {
      likes: updatedReactors.size,
      emojis,
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
          if (r < 0.2) addFlowComment();
          else if (r < 0.35) addShoutComment();
          else if (r < 0.45) addLongComment();
          else if (r < 0.55) addCWComment();
          else if (r < 0.63) addEmojiComment();
          else if (r < 0.73) addReply();
          else if (r < 0.88) addReaction();
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

        <div class="flex flex-wrap gap-1.5">
          <button
            type="button"
            onclick={addFlowComment}
            class="rounded bg-accent/20 px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/30"
          >
            + Flow
          </button>
          <button
            type="button"
            onclick={addShoutComment}
            class="rounded bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/30"
          >
            + Shout
          </button>
          <button
            type="button"
            onclick={addLongComment}
            class="rounded bg-blue-500/20 px-2.5 py-1 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/30"
          >
            + Long
          </button>
          <button
            type="button"
            onclick={addCWComment}
            class="rounded bg-orange-500/20 px-2.5 py-1 text-xs font-medium text-orange-400 transition-colors hover:bg-orange-500/30"
          >
            + CW
          </button>
          <button
            type="button"
            onclick={addEmojiComment}
            class="rounded bg-purple-500/20 px-2.5 py-1 text-xs font-medium text-purple-400 transition-colors hover:bg-purple-500/30"
          >
            + Emoji
          </button>
          <button
            type="button"
            onclick={addReply}
            class="rounded bg-cyan-500/20 px-2.5 py-1 text-xs font-medium text-cyan-400 transition-colors hover:bg-cyan-500/30"
          >
            + Reply
          </button>
          <button
            type="button"
            onclick={addReaction}
            class="rounded bg-pink-500/20 px-2.5 py-1 text-xs font-medium text-pink-400 transition-colors hover:bg-pink-500/30"
          >
            + Reaction
          </button>
          <button
            type="button"
            onclick={deleteRandom}
            class="rounded bg-red-500/20 px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/30"
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
