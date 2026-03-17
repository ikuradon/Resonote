<script lang="ts">
  import { emptyStats, type Comment, type ReactionStats } from '../stores/comments.svelte.js';
  import {
    formatPosition,
    buildComment,
    buildReaction,
    buildDeletion,
    COMMENT_KIND
  } from '../nostr/events.js';
  import { castSigned } from '../nostr/client.js';
  import { getProfile, getDisplayName, fetchProfiles } from '../stores/profile.svelte.js';
  import { formatNip05 } from '../stores/profile-utils.js';
  import { npubEncode } from 'nostr-tools/nip19';
  import { untrack } from 'svelte';
  import { getPlayer } from '../stores/player.svelte.js';
  import { getAuth } from '../stores/auth.svelte.js';
  import {
    getFollows,
    matchesFilter,
    refreshFollows,
    type FollowFilter
  } from '../stores/follows.svelte.js';
  import {
    isMuted,
    isWordMuted,
    muteUser,
    hasNip44Support,
    getMuteList
  } from '../stores/mute.svelte.js';
  import type { ContentId, ContentProvider } from '../content/types.js';
  import { createLogger, shortHex } from '../utils/logger.js';
  import { parseEmojiContent } from '../utils/emoji.js';
  import { t, type TranslationKey } from '../i18n/t.js';
  import EmojiPickerPopover, { allocatePopoverId } from './EmojiPickerPopover.svelte';
  import NoteInput from './NoteInput.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import VirtualScrollList from './VirtualScrollList.svelte';

  const log = createLogger('CommentList');

  interface Props {
    comments: Comment[];
    reactionIndex: Map<string, ReactionStats>;
    contentId: ContentId;
    provider: ContentProvider;
    loading?: boolean;
  }

  let { comments, reactionIndex, contentId, provider, loading = false }: Props = $props();

  const player = getPlayer();
  const auth = getAuth();
  const follows = getFollows();

  // --- Filter state ---
  let followFilter = $state<FollowFilter>('all');

  const HIGHLIGHT_THRESHOLD_MS = 5_000;

  // --- Filtered comments ---
  let filteredComments = $derived(
    comments
      .filter((c) => matchesFilter(c.pubkey, followFilter, auth.pubkey))
      .filter((c) => !isMuted(c.pubkey) && !isWordMuted(c.content))
  );

  /** Top-level comments only (exclude replies) */
  let topLevelComments = $derived(filteredComments.filter((c) => c.replyTo === null));

  let timedComments = $derived(
    topLevelComments
      .filter((c) => c.positionMs !== null)
      .sort((a, b) => a.positionMs! - b.positionMs!)
  );

  let generalComments = $derived(
    topLevelComments.filter((c) => c.positionMs === null).sort((a, b) => b.createdAt - a.createdAt)
  );

  // --- Virtual scroll auto-scroll ---
  let timedVirtualList = $state<VirtualScrollList<Comment> | undefined>();
  let userScrolledAway = $state(false);

  function findNearestTimedIndex(posMs: number): number {
    let lo = 0;
    let hi = timedComments.length - 1;
    let result = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (timedComments[mid].positionMs! <= posMs) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  }

  let lastScrolledIndex = -1;

  $effect(() => {
    if (!userScrolledAway && timedComments.length > 0 && timedVirtualList && player.position > 0) {
      const idx = findNearestTimedIndex(player.position);
      if (idx !== lastScrolledIndex) {
        lastScrolledIndex = idx;
        timedVirtualList.scrollToIndex(idx);
      }
    }
  });

  function handleTimedRangeChange(start: number, end: number) {
    if (timedVirtualList && !timedVirtualList.isAutoScrolling() && player.position > 0) {
      const target = findNearestTimedIndex(player.position);
      if (target < start || target > end) {
        userScrolledAway = true;
      }
    }
  }

  function jumpToNow() {
    userScrolledAway = false;
    if (timedVirtualList && timedComments.length > 0) {
      timedVirtualList.scrollToIndex(findNearestTimedIndex(player.position));
    }
  }

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

  const muteList = getMuteList();

  let acting = $state<string | null>(null);
  let deleteTarget = $state<Comment | null>(null);
  let muteTarget = $state<{ pubkey: string } | null>(null);

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

  function requestDelete(comment: Comment) {
    deleteTarget = comment;
  }

  async function confirmDelete() {
    if (!deleteTarget || !auth.loggedIn || auth.pubkey !== deleteTarget.pubkey || acting) return;
    const comment = deleteTarget;
    acting = comment.id;
    deleteTarget = null;
    try {
      const params = buildDeletion([comment.id], contentId, provider, COMMENT_KIND);
      await castSigned(params);
      log.info('Comment deleted', { commentId: shortHex(comment.id) });
    } catch (err) {
      log.error('Failed to delete comment', err);
    } finally {
      acting = null;
    }
  }

  // --- CW reveal state ---
  let revealedCW = $state(new Set<string>());

  function revealCW(id: string) {
    revealedCW = new Set([...revealedCW, id]);
  }

  function hideCW(id: string) {
    const next = new Set(revealedCW);
    next.delete(id);
    revealedCW = next;
  }

  // --- Reply state ---
  let replyTarget = $state<Comment | null>(null);
  let replyContent = $state('');
  let replyEmojiTags = $state<string[][]>([]);
  let replySending = $state(false);

  function startReply(comment: Comment) {
    replyTarget = comment;
    replyContent = '';
    replyEmojiTags = [];
  }

  function cancelReply() {
    replyTarget = null;
    replyContent = '';
    replyEmojiTags = [];
  }

  async function submitReply() {
    if (!replyTarget || !auth.loggedIn) return;
    const trimmed = replyContent.trim();
    if (!trimmed) return;

    replySending = true;
    try {
      const tags = replyEmojiTags.length > 0 ? replyEmojiTags : undefined;
      const params = buildComment(trimmed, contentId, provider, {
        emojiTags: tags,
        parentEvent: { id: replyTarget.id, pubkey: replyTarget.pubkey }
      });
      log.info('Sending reply', { parentId: shortHex(replyTarget.id) });
      await castSigned(params);
      log.info('Reply sent successfully');
      cancelReply();
    } catch (err) {
      log.error('Failed to send reply', err);
    } finally {
      replySending = false;
    }
  }

  /** Pre-computed reply index: parent comment ID → sorted replies */
  let replyMap = $derived.by(() => {
    const map = new Map<string, Comment[]>();
    for (const c of filteredComments) {
      if (c.replyTo !== null) {
        let arr = map.get(c.replyTo);
        if (!arr) {
          arr = [];
          map.set(c.replyTo, arr);
        }
        arr.push(c);
      }
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.createdAt - b.createdAt);
    }
    return map;
  });

  const filterOptions: {
    value: FollowFilter;
    labelKey: TranslationKey;
    titleKey?: TranslationKey;
  }[] = [
    { value: 'all', labelKey: 'filter.all' },
    { value: 'follows', labelKey: 'filter.follows' },
    { value: 'wot', labelKey: 'filter.wot', titleKey: 'filter.wot.description' }
  ];
</script>

{#snippet heartIcon(filled: boolean)}
  <svg
    aria-hidden="true"
    class="h-4 w-4"
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    stroke-width="2"
  >
    <path
      d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
    />
  </svg>
{/snippet}

{#snippet commentCard(comment: Comment, i: number, showPosition: boolean, replyToComment?: Comment)}
  {@const compact = replyToComment !== undefined}
  {@const picture = getProfile(comment.pubkey)?.picture}
  {@const nearCurrent =
    !compact &&
    showPosition &&
    comment.positionMs !== null &&
    isNearCurrentPosition(comment.positionMs)}
  {@const stats = statsFor(comment.id)}
  {@const myReaction = myReactionFor(comment.id)}
  {@const isOwn = auth.pubkey === comment.pubkey}
  {@const segments = parseEmojiContent(comment.content, comment.emojiTags)}
  {@const avatarSize = compact ? 'h-5 w-5' : 'h-6 w-6'}
  <div
    class="{compact
      ? 'rounded-lg border border-border-subtle bg-surface-1/50 p-3'
      : 'animate-slide-up rounded-xl border p-4 transition-all duration-300'} {nearCurrent
      ? 'border-accent/50 bg-accent/5 shadow-[0_0_12px_rgba(var(--color-accent-rgb,29,185,84),0.1)]'
      : compact
        ? ''
        : 'border-border-subtle bg-surface-1 hover:border-border'}"
    style={compact ? '' : `animation-delay: ${Math.min(i * 0.05, 0.5)}s`}
  >
    <div class="{compact ? 'mb-1.5' : 'mb-2'} flex items-center justify-between">
      <div class="flex items-center gap-2">
        {#if picture}
          <img
            src={picture}
            alt=""
            class="{avatarSize} rounded-full object-cover ring-1 ring-border"
          />
        {:else}
          <div
            class="flex {avatarSize} items-center justify-center rounded-full bg-surface-3 text-xs text-text-muted"
          >
            ?
          </div>
        {/if}
        <a
          href="/profile/{npubEncode(comment.pubkey)}"
          class="text-xs font-medium text-accent hover:underline"
          >{getDisplayName(comment.pubkey)}</a
        >
        {#if getProfile(comment.pubkey)?.nip05valid === true}
          <span class="text-xs text-text-muted" title={getProfile(comment.pubkey)?.nip05 ?? ''}>
            ✓{formatNip05(getProfile(comment.pubkey)?.nip05 ?? '', true)}
          </span>
        {/if}
        {#if showPosition && comment.positionMs !== null}
          <button
            type="button"
            onclick={() => handleSeek(comment.positionMs!)}
            class="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 font-mono text-xs text-accent transition-colors hover:bg-accent/20"
            title={t('seek.title')}
          >
            {formatPosition(comment.positionMs)}
          </button>
        {/if}
      </div>
      <span class="text-xs text-text-muted">{formatTime(comment.createdAt)}</span>
    </div>
    {#if comment.contentWarning !== null && !revealedCW.has(comment.id)}
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
        <span class="flex-1">
          {comment.contentWarning
            ? t('cw.warning_with_reason', { reason: comment.contentWarning })
            : t('cw.warning')}
        </span>
        <button
          type="button"
          onclick={() => revealCW(comment.id)}
          class="rounded px-2 py-0.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
        >
          {t('cw.show')}
        </button>
      </div>
    {:else}
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
      {#if comment.contentWarning !== null}
        <button
          type="button"
          onclick={() => hideCW(comment.id)}
          class="mt-1 text-xs text-text-muted transition-colors hover:text-text-secondary"
        >
          {t('cw.hide')}
        </button>
      {/if}
    {/if}
    <div class="{compact ? 'mt-1.5' : 'mt-2'} flex items-center gap-1">
      {#if auth.loggedIn}
        <button
          type="button"
          disabled={acting === comment.id || myReaction}
          onclick={() => sendReaction(comment)}
          class="inline-flex items-center gap-1 min-h-11 rounded-lg p-1.5 transition-colors
            {myReaction ? 'text-accent' : 'text-text-muted hover:text-accent'}"
          title={myReaction ? t('liked.title') : t('like.title')}
        >
          {@render heartIcon(myReaction)}
          {#if stats.likes > 0}
            <span class="text-xs font-mono">{stats.likes}</span>
          {/if}
        </button>
      {:else if stats.likes > 0}
        <span class="inline-flex items-center gap-1 p-1.5 text-text-muted">
          {@render heartIcon(false)}
          <span class="text-xs font-mono">{stats.likes}</span>
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
      {#if auth.loggedIn}
        <button
          type="button"
          onclick={() => startReply(replyToComment ?? comment)}
          class="inline-flex items-center min-h-11 rounded-lg p-1.5 text-text-muted transition-colors hover:text-accent"
          title={t('reply.title')}
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
      {/if}
      {#if auth.loggedIn && !isOwn && hasNip44Support()}
        <button
          type="button"
          disabled={acting === comment.id}
          onclick={() => (muteTarget = { pubkey: comment.pubkey })}
          class="inline-flex items-center min-h-11 rounded-lg p-1.5 text-text-muted transition-colors hover:text-red-400"
          title={t('mute.user')}
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
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        </button>
      {/if}
      {#if isOwn}
        <button
          type="button"
          disabled={acting === comment.id}
          onclick={() => requestDelete(comment)}
          class="ml-auto inline-flex items-center min-h-11 rounded-lg p-1.5 text-text-muted transition-colors hover:text-red-400"
          title={t('delete.title')}
        >
          {#if acting === comment.id}
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
          {:else}
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
          {/if}
        </button>
      {/if}
    </div>

    {#if !compact}
      <!-- Inline reply form -->
      {#if replyTarget?.id === comment.id}
        <div class="mt-3 border-t border-border-subtle pt-3">
          <form
            onsubmit={(e) => {
              e.preventDefault();
              submitReply();
            }}
          >
            <NoteInput
              bind:content={replyContent}
              bind:emojiTags={replyEmojiTags}
              disabled={replySending}
              placeholder={t('comment.reply.placeholder')}
              rows={1}
              onsubmit={submitReply}
            >
              <button
                type="submit"
                disabled={replySending || !replyContent.trim()}
                class="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-surface-0 transition-all duration-200 hover:bg-accent-hover disabled:opacity-30"
              >
                {#if replySending}
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
                  {t('send.sending')}
                {:else}
                  {t('send.reply')}
                {/if}
              </button>
              <button
                type="button"
                onclick={cancelReply}
                disabled={replySending}
                class="rounded-lg px-3 py-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary disabled:opacity-30"
              >
                {t('send.cancel')}
              </button>
            </NoteInput>
          </form>
        </div>
      {/if}

      <!-- Replies thread -->
      {@const replies = replyMap.get(comment.id)}
      {#if replies && replies.length > 0}
        <div class="mt-3 space-y-2 border-l-2 border-border-subtle pl-4">
          {#each replies as reply (reply.id)}
            {@render commentCard(reply, 0, false, comment)}
          {/each}
        </div>
      {/if}
    {/if}
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
          title={opt.titleKey ? t(opt.titleKey) : undefined}
          class="rounded-md px-2.5 py-1 font-medium transition-all
            {followFilter === opt.value
            ? 'bg-surface-0 text-text-primary shadow-sm'
            : 'text-text-muted hover:text-text-secondary'}"
        >
          {t(opt.labelKey)}
        </button>
      {/each}
    </div>
    {#if follows.loading}
      <span class="text-text-muted"
        >{t('wot.building')}
        <span class="font-mono">{t('wot.users', { count: follows.discoveredCount })}</span></span
      >
    {:else if follows.cachedAt}
      <span class="text-text-muted">
        {t('wot.users', { count: follows.wot.size })}
        <span class="mx-1">|</span>
        {new Date(follows.cachedAt).toLocaleDateString()}
      </span>
      <button
        type="button"
        onclick={() => auth.pubkey && refreshFollows(auth.pubkey)}
        class="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
      >
        {t('wot.update')}
      </button>
    {/if}
  {/if}
</div>

<div class="space-y-6">
  {#if loading}
    <div class="flex items-center justify-center gap-2 py-8" role="status" aria-live="polite">
      <div
        class="h-4 w-4 animate-spin rounded-full border-2 border-text-muted border-t-accent"
      ></div>
      <span class="text-sm text-text-muted">{t('loading')}</span>
    </div>
  {:else if filteredComments.length === 0}
    <p class="py-8 text-center text-sm text-text-muted">
      {#if followFilter !== 'all'}
        {followFilter === 'follows' ? t('comment.none.follows') : t('comment.none.wot')}
      {:else}
        {t('comment.none')}
      {/if}
    </p>
  {:else}
    {#if timedComments.length > 0}
      <section class="space-y-3">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold tracking-wide text-text-secondary uppercase"
            >{t('comment.section.timed')}</span
          >
          <span class="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-mono text-accent"
            >{timedComments.length}</span
          >
          <div class="h-px flex-1 bg-border-subtle"></div>
          {#if userScrolledAway}
            <button
              type="button"
              onclick={jumpToNow}
              class="rounded-lg bg-accent/20 px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/30"
            >
              {t('comment.jump_to_now')}
            </button>
          {/if}
        </div>
        <div class="max-h-[400px] overflow-hidden rounded-xl border border-border-subtle">
          <VirtualScrollList
            bind:this={timedVirtualList}
            items={timedComments}
            keyFn={(c) => c.id}
            estimateHeight={120}
            overscan={3}
            onRangeChange={handleTimedRangeChange}
          >
            {#snippet children({ item: comment, index: i })}
              {@render commentCard(comment, i, true)}
            {/snippet}
          </VirtualScrollList>
        </div>
      </section>
    {/if}

    {#if generalComments.length > 0}
      <section class="space-y-3">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold tracking-wide text-text-secondary uppercase"
            >{t('comment.section.general')}</span
          >
          <span class="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-mono text-text-muted"
            >{generalComments.length}</span
          >
          <div class="h-px flex-1 bg-border-subtle"></div>
        </div>
        <div class="max-h-[400px] overflow-hidden rounded-xl border border-border-subtle">
          <VirtualScrollList
            items={generalComments}
            keyFn={(c) => c.id}
            estimateHeight={120}
            overscan={3}
          >
            {#snippet children({ item: comment, index: i })}
              {@render commentCard(comment, i, false)}
            {/snippet}
          </VirtualScrollList>
        </div>
      </section>
    {/if}
  {/if}
</div>

<ConfirmDialog
  open={deleteTarget !== null}
  title={t('comment.delete.title')}
  message={t('comment.delete.message')}
  confirmLabel={t('comment.delete.confirm')}
  cancelLabel={t('comment.delete.cancel')}
  onConfirm={confirmDelete}
  onCancel={() => (deleteTarget = null)}
/>

<ConfirmDialog
  open={muteTarget !== null}
  title={t('confirm.mute')}
  message={t('confirm.mute.detail', {
    before: muteList.mutedPubkeys.size,
    after: muteList.mutedPubkeys.size + 1
  })}
  confirmLabel={t('confirm.ok')}
  cancelLabel={t('confirm.cancel')}
  onConfirm={async () => {
    const pk = muteTarget?.pubkey;
    muteTarget = null;
    if (pk) await muteUser(pk);
  }}
  onCancel={() => (muteTarget = null)}
/>
