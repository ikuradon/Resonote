<script lang="ts">
  import type { Comment, ReactionStats } from '$features/comments/domain/comment-model.js';
  import { parseCommentContent } from '$shared/auftakt/resonote.js';
  import type { ProfileDisplay } from '$shared/browser/profile.js';
  import { t } from '$shared/i18n/t.js';
  import { formatPosition } from '$shared/nostr/events.js';
  import { formatTimestamp } from '$shared/utils/format.js';

  import CommentActionMenu from './CommentActionMenu.svelte';
  import CommentCard from './CommentCard.svelte';
  import EmojiPickerPopover from './EmojiPickerPopover.svelte';
  import NoteInput from './NoteInput.svelte';
  import QuoteCard from './QuoteCard.svelte';
  import UserAvatar from './UserAvatar.svelte';

  interface Props {
    comment: Comment;
    author: ProfileDisplay;
    index: number;
    showPosition: boolean;
    compact?: boolean;
    nearCurrent?: boolean;
    mode?: 'flow' | 'shout';
    stats: ReactionStats;
    myReaction: boolean;
    isOwn: boolean;
    acting: boolean;
    loggedIn: boolean;
    revealedCW: boolean;
    canMute: boolean;
    popoverId: string;
    replyOpen: boolean;
    replyContent: string;
    replyEmojiTags: string[][];
    replySending: boolean;
    replies: Comment[];
    getAuthorDisplay: (pubkey: string) => ProfileDisplay;
    // Callbacks for nested replies — provide stats/state per reply
    getStats: (eventId: string) => ReactionStats;
    getMyReaction: (eventId: string) => boolean;
    isActing: (eventId: string) => boolean;
    isRevealed: (eventId: string) => boolean;
    getPopoverId: (commentId: string) => string;
    onReaction: (comment: Comment, reaction?: string, emojiUrl?: string) => void;
    onDelete: (comment: Comment) => void;
    onReply: (comment: Comment) => void;
    onCancelReply: () => void;
    onSubmitReply: () => void;
    onSeek: (positionMs: number) => void;
    onRevealCW: (id: string) => void;
    onHideCW: (id: string) => void;
    onMute: (pubkey: string) => void;
    onQuote?: (comment: Comment) => void;
    onReplyContentChange: (content: string) => void;
    onReplyEmojiTagsChange: (tags: string[][]) => void;
    getIsOwn?: (pubkey: string) => boolean;
    selected?: boolean;
  }

  let {
    comment,
    author,
    index,
    showPosition,
    compact = false,
    nearCurrent = false,
    mode = 'flow',
    stats,
    myReaction,
    isOwn,
    acting,
    loggedIn,
    revealedCW,
    canMute,
    popoverId,
    replyOpen,
    replyContent = $bindable(),
    replyEmojiTags = $bindable(),
    replySending,
    replies,
    getAuthorDisplay,
    getStats,
    getMyReaction,
    isActing,
    isRevealed,
    getPopoverId,
    onReaction,
    onDelete,
    onReply,
    onCancelReply,
    onSubmitReply,
    onSeek,
    onRevealCW,
    onHideCW,
    onMute,
    onQuote,
    onReplyContentChange,
    onReplyEmojiTagsChange,
    getIsOwn,
    selected = false
  }: Props = $props();

  const segments = $derived(parseCommentContent(comment.content, comment.emojiTags));
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

<div
  data-comment-id={comment.id}
  class="{compact
    ? 'rounded-lg border border-border-subtle bg-surface-1/50 p-3'
    : 'animate-slide-up rounded-xl border p-4 transition-all duration-300'} {nearCurrent
    ? 'border-accent/50 bg-accent/5 shadow-[0_0_12px_rgba(var(--color-accent-rgb,29,185,84),0.1)]'
    : compact
      ? ''
      : 'border-border-subtle bg-surface-1 hover:border-border'} {selected
    ? 'ring-2 ring-accent/50'
    : ''}"
  style={compact ? '' : `animation-delay: ${Math.min(index * 0.05, 0.5)}s`}
>
  <div class="{compact ? 'mb-1.5' : 'mb-2'} flex items-center justify-between">
    <div class="flex items-center gap-2 min-w-0 flex-1">
      <UserAvatar pubkey={comment.pubkey} picture={author.picture} size={compact ? 'xs' : 'sm'} />
      <a href={author.profileHref} class="text-xs font-medium text-accent hover:underline"
        >{author.displayName}</a
      >
      {#if author.formattedNip05}
        <span class="text-xs text-text-muted" title={author.nip05 ?? ''}>
          ✓{author.formattedNip05}
        </span>
      {/if}
      {#if showPosition && comment.positionMs !== null}
        <button
          type="button"
          onclick={() => onSeek(comment.positionMs!)}
          class="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 font-mono text-xs text-accent transition-colors hover:bg-accent/20"
          title={t('seek.title')}
        >
          {formatPosition(comment.positionMs)}
        </button>
      {/if}
      <span class="text-xs text-text-muted flex-shrink-0">{formatTimestamp(comment.createdAt)}</span
      >
    </div>
    {#if mode === 'flow'}
      <div class="flex items-center gap-1 flex-shrink-0 ml-2">
        {#if loggedIn}
          <button
            type="button"
            onclick={() => onReply(comment)}
            class="rounded p-1 text-text-muted transition-colors hover:text-text-secondary"
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
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        {/if}
        <button
          type="button"
          onclick={() => onReaction(comment)}
          disabled={acting || myReaction}
          class="flex items-center gap-1 rounded p-1 text-xs transition-colors
            {myReaction ? 'text-accent' : 'text-text-muted hover:text-text-secondary'}"
          title={myReaction ? t('liked.title') : t('like.title')}
        >
          {@render heartIcon(myReaction)}
          {#if stats.likes > 0}<span class="text-xs font-mono">{stats.likes}</span>{/if}
        </button>
        <CommentActionMenu
          eventId={comment.id}
          authorPubkey={comment.pubkey}
          {isOwn}
          {canMute}
          inlineActions={new Set(['reply', 'like'])}
          onQuote={onQuote ? () => onQuote(comment) : undefined}
          onMuteUser={() => onMute(comment.pubkey)}
          onDelete={() => onDelete(comment)}
        />
      </div>
    {/if}
  </div>

  <!-- CW / Content -->
  {#if comment.contentWarning !== null && !revealedCW}
    <div class="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-text-muted">
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
        onclick={() => onRevealCW(comment.id)}
        class="rounded px-2 py-0.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
      >
        {t('cw.show')}
      </button>
    </div>
  {:else}
    <div class="text-sm leading-relaxed text-text-primary whitespace-pre-wrap break-words">
      {#each segments as seg, segIdx (segIdx)}
        {#if seg.type === 'text'}{seg.value}{:else if seg.type === 'emoji'}<img
            src={seg.url}
            alt=":{seg.shortcode}:"
            class="inline h-5 w-5"
            loading="lazy"
          />{:else if seg.type === 'nostr-link'}{#if seg.decoded.type === 'note' || seg.decoded.type === 'nevent'}<QuoteCard
              eventId={seg.decoded.eventId}
              href={seg.href}
            />{:else}<a href={seg.href} class="text-accent hover:underline"
              >{#if seg.decoded.type === 'npub' || seg.decoded.type === 'nprofile'}{#if getAuthorDisplay(seg.decoded.pubkey).displayName !== seg.decoded.pubkey}@{getAuthorDisplay(
                    seg.decoded.pubkey
                  ).displayName}{:else}{seg.uri.slice(0, 8)}…{seg.uri.slice(
                    -4
                  )}{/if}{:else}{seg.uri.slice(0, 8)}…{seg.uri.slice(-4)}{/if}</a
            >{/if}{:else if seg.type === 'content-link'}<a
            href={seg.href}
            class="inline-flex items-center gap-1 text-accent hover:underline">{seg.displayLabel}</a
          >{:else if seg.type === 'url'}<a
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            class="text-accent hover:underline"
            >{seg.href.length > 50 ? `${seg.href.slice(0, 50)}…` : seg.href}</a
          >{:else if seg.type === 'hashtag'}<span class="text-accent">#{seg.tag}</span>{/if}
      {/each}
    </div>
    {#if comment.contentWarning !== null}
      <button
        type="button"
        onclick={() => onHideCW(comment.id)}
        class="mt-1 text-xs text-text-muted transition-colors hover:text-text-secondary"
      >
        {t('cw.hide')}
      </button>
    {/if}
  {/if}

  {#if mode === 'shout'}
    <!-- Emoji reaction pills -->
    {#if stats.emojis.length > 0}
      <div class="mt-1.5 flex flex-wrap gap-1 {compact ? '' : 'ml-9'}">
        {#each stats.emojis as emoji (emoji.content)}
          <span
            class="rounded-full border border-border-subtle bg-surface-2 px-2 py-0.5 text-xs text-text-muted inline-flex items-center gap-1"
          >
            {#if emoji.url}<img
                src={emoji.url}
                alt={emoji.content}
                class="h-3.5 w-3.5"
                loading="lazy"
              />{:else}{emoji.content}{/if}
            {#if emoji.count > 1}<span class="font-mono">{emoji.count}</span>{/if}
          </span>
        {/each}
      </div>
    {/if}
    <!-- Action row -->
    <div class="mt-1.5 flex flex-wrap gap-1 {compact ? '' : 'ml-9'}">
      {#if loggedIn}
        <button
          type="button"
          onclick={() => onReply(comment)}
          class="flex items-center gap-1 rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-muted transition-colors hover:text-text-secondary"
          title={t('reply.title')}
        >
          <svg
            aria-hidden="true"
            class="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="9 17 4 12 9 7" />
            <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
          </svg>
        </button>
        <button
          type="button"
          disabled
          aria-label="ReNote"
          class="flex items-center gap-1 rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-muted opacity-50"
        >
          <svg
            aria-hidden="true"
            class="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"
            />
            <path
              d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"
            />
          </svg>
        </button>
      {/if}
      <button
        type="button"
        onclick={() => onReaction(comment)}
        disabled={acting || myReaction}
        class="flex items-center gap-1 rounded-md border border-border-subtle px-2.5 py-1 text-xs transition-colors
          {myReaction
          ? 'border-accent/30 text-accent'
          : 'text-text-muted hover:text-text-secondary'}"
        title={myReaction ? t('liked.title') : t('like.title')}
      >
        {@render heartIcon(myReaction)}
        {#if stats.likes > 0}{stats.likes}{/if}
      </button>
      {#if loggedIn}
        <EmojiPickerPopover
          id={popoverId}
          onSelect={(reaction, emojiUrl) => onReaction(comment, reaction, emojiUrl)}
        />
      {/if}
      <CommentActionMenu
        eventId={comment.id}
        authorPubkey={comment.pubkey}
        {isOwn}
        {canMute}
        inlineActions={new Set(['reply', 'like', 'renote', 'emoji'])}
        onQuote={onQuote ? () => onQuote(comment) : undefined}
        onMuteUser={() => onMute(comment.pubkey)}
        onDelete={() => onDelete(comment)}
      />
    </div>
  {/if}

  {#if !compact}
    <!-- Inline reply form -->
    {#if replyOpen}
      <div class="mt-3 border-t border-border-subtle pt-3">
        <form
          onsubmit={(e) => {
            e.preventDefault();
            onSubmitReply();
          }}
        >
          <NoteInput
            bind:content={replyContent}
            bind:emojiTags={replyEmojiTags}
            disabled={replySending}
            placeholder={t('comment.reply.placeholder')}
            rows={1}
            onsubmit={onSubmitReply}
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
              onclick={onCancelReply}
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
    {#if replies.length > 0}
      <div class="mt-3 space-y-2 border-l-2 border-border-subtle pl-4">
        {#each replies as reply (reply.id)}
          <CommentCard
            comment={reply}
            author={getAuthorDisplay(reply.pubkey)}
            index={0}
            showPosition={false}
            compact={true}
            stats={getStats(reply.id)}
            myReaction={getMyReaction(reply.id)}
            isOwn={getIsOwn?.(reply.pubkey) ?? false}
            acting={isActing(reply.id)}
            {loggedIn}
            revealedCW={isRevealed(reply.id)}
            {canMute}
            popoverId={getPopoverId(reply.id)}
            replyOpen={false}
            bind:replyContent
            bind:replyEmojiTags
            {replySending}
            replies={[]}
            {getAuthorDisplay}
            {getStats}
            {getMyReaction}
            {isActing}
            {isRevealed}
            {getPopoverId}
            onReaction={(c: Comment, r?: string, u?: string) => onReaction(c, r, u)}
            onDelete={(c: Comment) => onDelete(c)}
            onReply={() => onReply(comment)}
            {onCancelReply}
            {onSubmitReply}
            {onSeek}
            {onRevealCW}
            {onHideCW}
            {onMute}
            {onQuote}
            {onReplyContentChange}
            {onReplyEmojiTagsChange}
          />
        {/each}
      </div>
    {/if}
  {/if}
</div>
