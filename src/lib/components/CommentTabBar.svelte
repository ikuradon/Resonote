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
  }

  const { activeTab, followFilter, timedCount, shoutCount, onTabChange, onFilterChange }: Props =
    $props();
</script>

<!-- Heading row with filter -->
<div class="flex items-center gap-2">
  <span class="text-sm font-semibold text-text-primary">{t('comment.heading')}</span>
  <div class="h-px flex-1 bg-border-subtle"></div>
  <CommentFilterBar {followFilter} {onFilterChange} />
</div>

<!-- Tab bar -->
<div class="flex border-b border-border-subtle">
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
</div>
