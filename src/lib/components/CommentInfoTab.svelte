<script lang="ts">
  import type { ContentId, ContentProvider } from '$shared/content/types.js';
  import { t } from '$shared/i18n/t.js';

  import ShareButton from './ShareButton.svelte';

  interface Props {
    contentId: ContentId;
    provider: ContentProvider;
    loggedIn: boolean;
    bookmarked: boolean;
    bookmarkBusy: boolean;
    onToggleBookmark?: () => void;
    openUrl?: string;
  }

  const {
    contentId,
    provider,
    loggedIn,
    bookmarked,
    bookmarkBusy,
    onToggleBookmark,
    openUrl
  }: Props = $props();
</script>

<div class="space-y-3 py-6">
  {#if onToggleBookmark && loggedIn}
    <button
      type="button"
      onclick={onToggleBookmark}
      disabled={bookmarkBusy}
      class="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 disabled:opacity-50
        {bookmarked
        ? 'bg-accent/10 text-accent hover:bg-accent/20'
        : 'bg-surface-2 text-text-secondary hover:bg-surface-3 hover:text-text-primary'}"
    >
      {bookmarked ? '\u2605' : '\u2606'}
      {bookmarked ? t('bookmark.remove') : t('bookmark.add')}
    </button>
  {/if}
  <ShareButton {contentId} {provider} />
  {#if openUrl}
    <a
      href={openUrl}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 text-sm text-accent hover:underline"
    >
      {t('content.open_and_comment')} &#8599;
    </a>
  {/if}
</div>
