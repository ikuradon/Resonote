<script lang="ts">
  import { emptyStats, type Comment, type ReactionStats } from '../stores/comments.svelte.js';
  import { formatPosition, buildReaction, buildDeletion } from '../nostr/events.js';
  import { castSigned } from '../nostr/client.js';
  import { getProfile, getDisplayName, fetchProfiles } from '../stores/profile.svelte.js';
  import { untrack } from 'svelte';
  import { getPlayer } from '../stores/player.svelte.js';
  import { getAuth } from '../stores/auth.svelte.js';
  import {
    getFollows,
    matchesFilter,
    refreshFollows,
    type FollowFilter
  } from '../stores/follows.svelte.js';
  import type { ContentId, ContentProvider } from '../content/types.js';
  import { createLogger, shortHex } from '../utils/logger.js';
  import { parseEmojiContent } from '../utils/emoji.js';
  import EmojiPickerPopover, { allocatePopoverId } from './EmojiPickerPopover.svelte';

  const log = createLogger('CommentList');

  interface Props {
    comments: Comment[];
    reactionIndex: Map<string, ReactionStats>;
    contentId: ContentId;
    provider: ContentProvider;
  }

  let { comments, reactionIndex, contentId, provider }: Props = $props();

  const player = getPlayer();
  const auth = getAuth();
  const follows = getFollows();

  // --- Filter state ---
  let showAllTimed = $state(false);
  let followFilter = $state<FollowFilter>('all');

  const NEARBY_THRESHOLD_MS = 30_000;
  const HIGHLIGHT_THRESHOLD_MS = 5_000;
  /** Minimum number of comments to show when nearby filter yields few results */
  const MIN_NEARBY_COUNT = 3;

  // --- Pagination ---
  const PAGE_SIZE = 30;
  let timedLimit = $state(PAGE_SIZE);
  let generalLimit = $state(PAGE_SIZE);

  // --- Filtered comments ---
  let filteredComments = $derived(
    comments.filter((c) => matchesFilter(c.pubkey, followFilter, auth.pubkey))
  );

  let timedComments = $derived(
    filteredComments
      .filter((c) => c.positionMs !== null)
      .sort((a, b) => a.positionMs! - b.positionMs!)
  );

  let nearbyTimedComments = $derived.by(() => {
    if (showAllTimed || player.position <= 0) return timedComments;

    const nearby = timedComments.filter(
      (c) => Math.abs(player.position - c.positionMs!) <= NEARBY_THRESHOLD_MS
    );

    if (nearby.length >= MIN_NEARBY_COUNT || timedComments.length <= MIN_NEARBY_COUNT) {
      return nearby;
    }

    // Not enough nearby — pick the closest N by distance
    return [...timedComments]
      .sort(
        (a, b) =>
          Math.abs(player.position - a.positionMs!) - Math.abs(player.position - b.positionMs!)
      )
      .slice(0, MIN_NEARBY_COUNT)
      .sort((a, b) => a.positionMs! - b.positionMs!);
  });

  let paginatedTimedComments = $derived(nearbyTimedComments.slice(0, timedLimit));
  let remainingTimed = $derived(Math.max(0, nearbyTimedComments.length - timedLimit));

  let generalComments = $derived(
    filteredComments.filter((c) => c.positionMs === null).sort((a, b) => b.createdAt - a.createdAt)
  );

  let paginatedGeneralComments = $derived(generalComments.slice(0, generalLimit));
  let remainingGeneral = $derived(Math.max(0, generalComments.length - generalLimit));

  function statsFor(eventId: string): ReactionStats {
    return reactionIndex.get(eventId) ?? emptyStats();
  }

  function myReactionFor(eventId: string): boolean {
    if (!auth.pubkey) return false;
    return statsFor(eventId).reactors.has(auth.pubkey);
  }

  function isNearCurrentPosition(positionMs: number): boolean {
    if (player.position <= 0) return false;
    return Math.abs(player.position - positionMs) < HIGHLIGHT_THRESHOLD_MS;
  }

  $effect(() => {
    const pubkeys = [...new Set(comments.map((c) => c.pubkey))];
    untrack(() => fetchProfiles(pubkeys));
  });

  function formatTime(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
  }

  function handleSeek(positionMs: number) {
    window.dispatchEvent(new CustomEvent('resonote:seek', { detail: { positionMs } }));
  }

  let acting = $state<string | null>(null);

  const popoverIds = new Map<string, string>();
  function getPopoverId(commentId: string): string {
    let pid = popoverIds.get(commentId);
    if (!pid) {
      pid = allocatePopoverId();
      popoverIds.set(commentId, pid);
    }
    return pid;
  }

  async function sendReaction(comment: Comment, reaction = '+', emojiUrl?: string) {
    if (!auth.loggedIn || acting) return;
    acting = comment.id;
    try {
      const params = buildReaction(
        comment.id,
        comment.pubkey,
        contentId,
        provider,
        reaction,
        emojiUrl
      );
      await castSigned(params);
      log.info('Reaction sent', { targetId: shortHex(comment.id) });
    } catch (err) {
      log.error('Failed to send reaction', err);
    } finally {
      acting = null;
    }
  }

  async function deleteComment(comment: Comment) {
    if (!auth.loggedIn || auth.pubkey !== comment.pubkey || acting) return;
    acting = comment.id;
    try {
      const params = buildDeletion([comment.id]);
      await castSigned(params);
      log.info('Comment deleted', { commentId: shortHex(comment.id) });
    } catch (err) {
      log.error('Failed to delete comment', err);
    } finally {
      acting = null;
    }
  }

  const filterOptions: { value: FollowFilter; label: string; title?: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'follows', label: 'Follows' },
    { value: 'wot', label: 'WoT', title: 'Follows + follows of follows' }
  ];
</script>

{#snippet commentCard(comment: Comment, i: number, showPosition: boolean)}
  {@const picture = getProfile(comment.pubkey)?.picture}
  {@const nearCurrent =
    showPosition && comment.positionMs !== null && isNearCurrentPosition(comment.positionMs)}
  {@const stats = statsFor(comment.id)}
  {@const myReaction = myReactionFor(comment.id)}
  {@const isOwn = auth.pubkey === comment.pubkey}
  {@const segments = parseEmojiContent(comment.content, comment.emojiTags)}
  <div
    class="animate-slide-up rounded-xl border p-4 transition-all duration-300 {nearCurrent
      ? 'border-accent/50 bg-accent/5 shadow-[0_0_12px_rgba(var(--color-accent-rgb,29,185,84),0.1)]'
      : 'border-border-subtle bg-surface-1 hover:border-border'}"
    style="animation-delay: {Math.min(i * 0.05, 0.5)}s"
  >
    <div class="mb-2 flex items-center justify-between">
      <div class="flex items-center gap-2">
        {#if picture}
          <img src={picture} alt="" class="h-6 w-6 rounded-full object-cover ring-1 ring-border" />
        {:else}
          <div
            class="flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-xs text-text-muted"
          >
            ?
          </div>
        {/if}
        <span class="text-xs font-medium text-accent">{getDisplayName(comment.pubkey)}</span>
        {#if showPosition && comment.positionMs !== null}
          <button
            type="button"
            onclick={() => handleSeek(comment.positionMs!)}
            class="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 font-mono text-xs text-accent transition-colors hover:bg-accent/20"
            title="Seek to this position"
          >
            {formatPosition(comment.positionMs)}
          </button>
        {/if}
      </div>
      <span class="text-xs text-text-muted">{formatTime(comment.createdAt)}</span>
    </div>
    <p class="text-sm leading-relaxed text-text-primary whitespace-pre-wrap break-words">
      {#each segments as seg, segIdx (segIdx)}
        {#if seg.type === 'text'}{seg.value}{:else}<img
            src={seg.url}
            alt=":{seg.shortcode}:"
            class="inline h-5 w-5"
            loading="lazy"
          />{/if}
      {/each}
    </p>
    <div class="mt-2 flex items-center gap-3">
      {#if auth.loggedIn}
        <button
          type="button"
          disabled={acting === comment.id || myReaction}
          onclick={() => sendReaction(comment)}
          class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors
            {myReaction ? 'text-accent' : 'text-text-muted hover:text-accent'}"
          title={myReaction ? 'Liked' : 'Like'}
        >
          +
          {#if stats.likes > 0}
            <span class="font-mono">{stats.likes}</span>
          {/if}
        </button>
      {:else if stats.likes > 0}
        <span class="inline-flex items-center gap-1 text-xs text-text-muted">
          +
          <span class="font-mono">{stats.likes}</span>
        </span>
      {/if}
      {#if auth.loggedIn}
        <EmojiPickerPopover
          id={getPopoverId(comment.id)}
          onSelect={(reaction, emojiUrl) => sendReaction(comment, reaction, emojiUrl)}
        />
      {/if}
      {#each stats.emojis as emoji (emoji.content)}
        <span class="inline-flex items-center gap-1 text-xs text-text-muted">
          {#if emoji.url}
            <img src={emoji.url} alt={emoji.content} class="h-4 w-4" loading="lazy" />
          {:else}
            {emoji.content}
          {/if}
          {#if emoji.count > 1}
            <span class="font-mono">{emoji.count}</span>
          {/if}
        </span>
      {/each}
      {#if isOwn}
        <button
          type="button"
          disabled={acting === comment.id}
          onclick={() => deleteComment(comment)}
          class="ml-auto rounded-lg px-2 py-1 text-xs text-text-muted transition-colors hover:text-red-400"
          title="Delete"
        >
          {acting === comment.id ? '...' : 'Delete'}
        </button>
      {/if}
    </div>
  </div>
{/snippet}

<!-- Filter bar -->
<div class="flex flex-wrap items-center gap-2 text-xs">
  {#if auth.loggedIn}
    <div class="flex items-center rounded-lg bg-surface-2 p-0.5">
      {#each filterOptions as opt (opt.value)}
        <button
          type="button"
          onclick={() => (followFilter = opt.value)}
          title={opt.title}
          class="rounded-md px-2.5 py-1 font-medium transition-all
            {followFilter === opt.value
            ? 'bg-surface-0 text-text-primary shadow-sm'
            : 'text-text-muted hover:text-text-secondary'}"
        >
          {opt.label}
        </button>
      {/each}
    </div>
    {#if follows.loading}
      <span class="text-text-muted"
        >Building WoT... <span class="font-mono">{follows.discoveredCount}</span> users</span
      >
    {:else if follows.cachedAt}
      <span class="text-text-muted">
        <span class="font-mono">{follows.wot.size}</span> users
        <span class="mx-1">|</span>
        {new Date(follows.cachedAt).toLocaleDateString()}
      </span>
      <button
        type="button"
        onclick={() => auth.pubkey && refreshFollows(auth.pubkey)}
        class="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
      >
        Update
      </button>
    {/if}
  {/if}
</div>

<div class="space-y-6">
  {#if filteredComments.length === 0}
    <p class="py-8 text-center text-sm text-text-muted">
      {#if followFilter !== 'all'}
        No comments from {followFilter === 'follows' ? 'follows' : 'your network'}
      {:else}
        No comments yet
      {/if}
    </p>
  {:else}
    {#if timedComments.length > 0}
      <section class="space-y-3">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold tracking-wide text-text-secondary uppercase"
            >Time Comments</span
          >
          <span class="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-mono text-accent"
            >{nearbyTimedComments.length}{#if !showAllTimed && nearbyTimedComments.length !== timedComments.length}/{timedComments.length}{/if}</span
          >
          <div class="h-px flex-1 bg-border-subtle"></div>
          {#if timedComments.length > 0}
            <div class="flex items-center rounded-lg bg-surface-2 p-0.5">
              <button
                type="button"
                onclick={() => (showAllTimed = false)}
                class="rounded-md px-2 py-0.5 text-xs font-medium transition-all
                  {!showAllTimed
                  ? 'bg-surface-0 text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'}"
              >
                Nearby
              </button>
              <button
                type="button"
                onclick={() => (showAllTimed = true)}
                class="rounded-md px-2 py-0.5 text-xs font-medium transition-all
                  {showAllTimed
                  ? 'bg-surface-0 text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'}"
              >
                All
              </button>
            </div>
          {/if}
        </div>
        {#each paginatedTimedComments as comment, i (comment.id)}
          {@render commentCard(comment, i, true)}
        {/each}
        {#if remainingTimed > 0}
          <button
            type="button"
            onclick={() => (timedLimit += PAGE_SIZE)}
            class="w-full rounded-lg bg-surface-2 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
          >
            Load more ({remainingTimed} remaining)
          </button>
        {/if}
      </section>
    {/if}

    {#if generalComments.length > 0}
      <section class="space-y-3">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold tracking-wide text-text-secondary uppercase"
            >General</span
          >
          <span class="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-mono text-text-muted"
            >{generalComments.length}</span
          >
          <div class="h-px flex-1 bg-border-subtle"></div>
        </div>
        {#each paginatedGeneralComments as comment, i (comment.id)}
          {@render commentCard(comment, i, false)}
        {/each}
        {#if remainingGeneral > 0}
          <button
            type="button"
            onclick={() => (generalLimit += PAGE_SIZE)}
            class="w-full rounded-lg bg-surface-2 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
          >
            Load more ({remainingGeneral} remaining)
          </button>
        {/if}
      </section>
    {/if}
  {/if}
</div>
