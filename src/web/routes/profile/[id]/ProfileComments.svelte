<script lang="ts">
  import type { ProfileComment } from '$features/profiles/application/profile-queries.js';
  import { t } from '$shared/i18n/t.js';
  import { iTagToContentPath } from '$shared/nostr/helpers.js';
  import { formatTimestamp } from '$shared/utils/format.js';

  interface Props {
    comments: ProfileComment[];
    loading: boolean;
    hasMore: boolean;
    onLoadMore: () => void;
  }

  let { comments, loading, hasMore, onLoadMore }: Props = $props();
</script>

<div class="space-y-4">
  <div class="flex items-center gap-3">
    <h2 class="font-display text-lg font-semibold text-text-primary">
      {t('profile.comments')}
    </h2>
    <div class="h-px flex-1 bg-border-subtle"></div>
  </div>

  {#if comments.length === 0 && !loading}
    <p class="py-8 text-center text-sm text-text-muted">
      {t('profile.no_comments')}
    </p>
  {:else}
    <div class="space-y-3">
      {#each comments as comment (comment.id)}
        <div
          class="rounded-xl border border-border-subtle bg-surface-1 p-4 transition-all hover:border-border"
        >
          <p class="text-sm leading-relaxed text-text-primary whitespace-pre-wrap break-words">
            {comment.content}
          </p>
          <div class="mt-2 flex items-center justify-between">
            <span class="text-xs text-text-muted">{formatTimestamp(comment.createdAt)}</span>
            {#if comment.iTag}
              {@const link = iTagToContentPath(comment.iTag)}
              {#if link}
                <a
                  href={link}
                  class="text-xs text-accent transition-colors hover:text-accent-hover hover:underline"
                >
                  {comment.iTag}
                </a>
              {/if}
            {/if}
          </div>
        </div>
      {/each}
    </div>

    {#if hasMore}
      <button
        type="button"
        disabled={loading}
        onclick={onLoadMore}
        class="w-full rounded-lg bg-surface-2 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary disabled:opacity-50"
      >
        {#if loading}
          {t('loading')}
        {:else}
          {t('profile.load_more')}
        {/if}
      </button>
    {/if}
  {/if}

  {#if loading && comments.length === 0}
    <p class="py-8 text-center text-sm text-text-muted">
      {t('loading')}
    </p>
  {/if}
</div>
