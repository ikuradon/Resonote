<script lang="ts">
  import { getAuth } from '$shared/browser/auth.js';
  import { getBookmarks, removeBookmark } from '$shared/browser/bookmarks.js';
  import { parseContentId } from '$shared/content/types.js';
  import { t } from '$shared/i18n/t.js';
  import { iTagToContentPath } from '$shared/nostr/helpers.js';
  import { truncateString } from '$shared/utils/format.js';

  const auth = getAuth();
  const bookmarks = getBookmarks();

  async function handleRemove(value: string) {
    const contentId = parseContentId(value);
    if (!contentId) return;
    removing = value;
    try {
      await removeBookmark(contentId);
    } finally {
      removing = null;
    }
  }

  let removing = $state<string | null>(null);
</script>

<svelte:head>
  <title>{t('bookmark.title')} - Resonote</title>
</svelte:head>

{#if !auth.loggedIn}
  <div class="py-16 text-center">
    <p class="text-sm text-text-muted">{t('comment.login_prompt')}</p>
  </div>
{:else}
  <div class="mx-auto max-w-3xl space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="font-display text-lg font-semibold text-text-primary">
        {t('bookmark.title')}
      </h1>
    </div>

    {#if bookmarks.loading || !bookmarks.loaded}
      <div class="py-16 text-center">
        <p class="text-sm text-text-muted">{t('loading')}</p>
      </div>
    {:else if bookmarks.entries.length === 0}
      <div class="py-16 text-center">
        <p class="text-sm text-text-muted">{t('bookmark.empty')}</p>
      </div>
    {:else}
      <div class="space-y-2">
        {#each bookmarks.entries as entry (`${entry.type}:${entry.value}`)}
          <div
            class="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-1 p-4 transition-all hover:border-border"
          >
            {#if entry.type === 'content'}
              {@const path = iTagToContentPath(entry.value)}
              <span class="shrink-0 text-base text-accent">&#9733;</span>
              <div class="min-w-0 flex-1">
                {#if path}
                  <a
                    href={path}
                    class="text-sm font-medium text-text-primary hover:text-accent hover:underline"
                  >
                    {entry.value}
                  </a>
                {:else}
                  <span class="text-sm text-text-primary">{entry.value}</span>
                {/if}
                {#if entry.hint}
                  <p class="mt-0.5 truncate text-xs text-text-muted">{entry.hint}</p>
                {/if}
              </div>
              <span class="shrink-0 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-text-muted">
                {t('bookmark.content')}
              </span>
            {:else}
              <span class="shrink-0 text-base text-text-muted">&#9993;</span>
              <div class="min-w-0 flex-1">
                <span class="truncate text-sm font-mono text-text-primary" title={entry.value}>
                  {truncateString(entry.value, 24)}
                </span>
                {#if entry.hint}
                  <p class="mt-0.5 truncate text-xs text-text-muted">{entry.hint}</p>
                {/if}
              </div>
              <span class="shrink-0 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-text-muted">
                {t('bookmark.comment')}
              </span>
            {/if}

            {#if entry.type === 'content'}
              <button
                type="button"
                onclick={() => handleRemove(entry.value)}
                disabled={removing === entry.value}
                class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-2 hover:text-error disabled:opacity-50"
                aria-label={t('bookmark.remove')}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                  <path d="M10 11v6"></path>
                  <path d="M14 11v6"></path>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
                </svg>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
