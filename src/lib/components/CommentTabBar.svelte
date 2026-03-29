<script lang="ts">
  import type { CommentTab } from '$features/comments/ui/comment-list-view-model.svelte.js';
  import type { FollowFilter } from '$shared/browser/follows.js';
  import { t } from '$shared/i18n/t.js';

  import CommentFilterBar from './CommentFilterBar.svelte';

  interface Props {
    activeTab: CommentTab;
    followFilter: FollowFilter;
    timedCount: number;
    shoutCount: number;
    onTabChange: (tab: CommentTab) => void;
    onFilterChange: (filter: FollowFilter) => void;
    loggedIn: boolean;
    bookmarked: boolean;
    bookmarkBusy: boolean;
    onBookmarkClick: () => void;
    onShareClick: () => void;
    contentReactionCount: number;
    contentReactionMine: boolean;
    contentReactionBusy: boolean;
    onContentReactionClick: () => void;
  }

  const {
    activeTab,
    followFilter,
    timedCount,
    shoutCount,
    onTabChange,
    onFilterChange,
    loggedIn,
    bookmarked,
    bookmarkBusy,
    onBookmarkClick,
    onShareClick,
    contentReactionCount,
    contentReactionMine,
    contentReactionBusy,
    onContentReactionClick
  }: Props = $props();
</script>

<!-- Heading row with filter -->
<div class="flex items-center gap-2">
  <span class="text-sm font-semibold text-text-primary">{t('comment.heading')}</span>
  <div class="h-px flex-1 bg-border-subtle"></div>
  <CommentFilterBar {followFilter} {onFilterChange} />
</div>

<!-- Tab bar -->
<div class="flex items-center border-b border-border-subtle">
  <button
    type="button"
    onclick={() => onTabChange('flow')}
    class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors
      {activeTab === 'flow'
      ? 'border-b-2 border-accent text-accent -mb-px'
      : 'text-text-muted hover:text-text-secondary'}"
  >
    🎶 <span class="hidden sm:inline">{t('tab.flow')}</span>
    {#if timedCount > 0}
      <span class="text-xs opacity-70">({timedCount})</span>
    {/if}
  </button>
  <button
    type="button"
    onclick={() => onTabChange('shout')}
    class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors
      {activeTab === 'shout'
      ? 'border-b-2 border-amber-500 text-amber-500 -mb-px'
      : 'text-text-muted hover:text-text-secondary'}"
  >
    📢 <span class="hidden sm:inline">{t('tab.shout')}</span>
    {#if shoutCount > 0}
      <span class="text-xs opacity-70">({shoutCount})</span>
    {/if}
  </button>
  <button
    type="button"
    onclick={() => onTabChange('info')}
    class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors
      {activeTab === 'info'
      ? 'border-b-2 border-text-secondary text-text-secondary -mb-px'
      : 'text-text-muted hover:text-text-secondary'}"
  >
    ℹ️ <span class="hidden sm:inline">{t('tab.info')}</span>
  </button>

  <!-- Spacer -->
  <div class="flex-1"></div>

  <!-- Content reaction (like) button -->
  {#if loggedIn}
    <button
      type="button"
      onclick={onContentReactionClick}
      disabled={contentReactionBusy}
      class="flex items-center gap-1 rounded-lg px-2 py-1 text-sm transition-colors disabled:opacity-50
        {contentReactionMine
        ? 'text-accent hover:bg-accent/10'
        : 'text-text-muted hover:bg-surface-1 hover:text-text-secondary'}"
      aria-label={contentReactionMine ? t('reaction.content.unlike') : t('reaction.content.like')}
    >
      {contentReactionMine ? '\u2665' : '\u2661'}
      {#if contentReactionCount > 0}
        <span class="text-xs">{contentReactionCount}</span>
      {/if}
    </button>
  {/if}

  <!-- Bookmark button -->
  {#if loggedIn}
    <button
      type="button"
      onclick={onBookmarkClick}
      disabled={bookmarkBusy}
      class="flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors disabled:opacity-50
        {bookmarked
        ? 'text-accent hover:bg-accent/10'
        : 'text-text-muted hover:bg-surface-1 hover:text-text-secondary'}"
      aria-label={t('bookmark.button.label')}
    >
      {bookmarked ? '\u2605' : '\u2606'}
    </button>
  {/if}

  <!-- Share button -->
  <button
    type="button"
    onclick={onShareClick}
    class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary"
    aria-label={t('share.button.label')}
  >
    <svg
      class="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  </button>
</div>
