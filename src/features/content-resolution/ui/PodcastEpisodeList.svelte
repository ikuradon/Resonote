<script lang="ts">
  import { goto } from '$app/navigation';
  import WaveformLoader from '$lib/components/WaveformLoader.svelte';
  import { buildEpisodeContentId } from '$shared/content/resolution.js';
  import type { ContentId } from '$shared/content/types.js';
  import { fromBase64url } from '$shared/content/url-utils.js';
  import { t } from '$shared/i18n/t.js';
  import { formatCompactDuration, formatDateOnly } from '$shared/utils/format.js';

  import type { FeedEpisode } from '../application/resolve-feed.js';
  import { resolvePodcastFeed } from '../application/resolve-feed.js';

  interface Props {
    contentId: ContentId;
    onFeedLoaded?: (info: { title: string; imageUrl: string; description: string }) => void;
  }

  let { contentId, onFeedLoaded }: Props = $props();

  type Status = 'loading' | 'loaded' | 'error';

  let status = $state<Status>('loading');
  let feedTitle = $state('');
  let feedImage = $state('');
  let feedDescription = $state('');
  let episodes = $state<FeedEpisode[]>([]);
  let errorMessage = $state('');

  function selectEpisode(ep: { guid: string }) {
    const feedUrl = fromBase64url(contentId.id);
    if (!feedUrl) return;
    const episodeContentId = buildEpisodeContentId(feedUrl, ep.guid);
    goto(`/podcast/episode/${episodeContentId.id}`);
  }

  $effect(() => {
    const feedUrl = fromBase64url(contentId.id);
    if (!feedUrl) {
      status = 'error';
      errorMessage = t('resolve.error.parse_failed');
      return;
    }
    load(feedUrl);
  });

  async function load(feedUrl: string) {
    status = 'loading';
    try {
      const result = await resolvePodcastFeed(feedUrl);

      if (result.error) {
        status = 'error';
        errorMessage = t('podcast.error');
        return;
      }

      feedTitle = result.title;
      feedImage = result.imageUrl;
      feedDescription = result.description;
      episodes = result.episodes;
      status = 'loaded';
      onFeedLoaded?.({ title: feedTitle, imageUrl: feedImage, description: feedDescription });
    } catch {
      status = 'error';
      errorMessage = t('podcast.error');
    }
  }

  function formatPubDate(pubDate: string): string {
    const timestamp = Date.parse(pubDate);
    if (!Number.isFinite(timestamp)) return '';
    return formatDateOnly(Math.floor(timestamp / 1000));
  }
</script>

<div class="rounded-2xl border border-border-subtle bg-surface-secondary">
  {#if status === 'loading'}
    <div class="flex min-h-[200px] items-center justify-center p-6">
      <div class="flex flex-col items-center gap-4" role="status">
        <div class="flex items-center gap-3">
          <svg
            aria-hidden="true"
            class="h-8 w-8 text-accent"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path
              d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4zm0 18a7 7 0 0 0 7-7h-2a5 5 0 0 1-10 0H5a7 7 0 0 0 7 7zm-1 2v2h2v-2h-2z"
            />
          </svg>
          <span class="text-sm font-medium text-text-muted">{t('podcast.loading')}</span>
        </div>
        <WaveformLoader bars={16} />
      </div>
    </div>
  {:else if status === 'error'}
    <div class="p-6 text-center">
      <p class="text-text-secondary">{errorMessage}</p>
    </div>
  {:else}
    <!-- Feed header -->
    {#if feedTitle || feedImage}
      <div class="flex items-center gap-3 border-b border-border-subtle p-4">
        {#if feedImage}
          <img
            src={feedImage}
            alt={feedTitle}
            class="h-14 w-14 flex-shrink-0 rounded-lg object-cover"
          />
        {/if}
        {#if feedTitle}
          <h2 class="text-base font-semibold text-text-primary">{feedTitle}</h2>
        {/if}
      </div>
    {/if}

    <!-- Episode list -->
    <ul class="max-h-[480px] overflow-y-auto divide-y divide-border-subtle">
      {#each episodes as ep (ep.guid)}
        {@const episodeDate = formatPubDate(ep.pubDate)}
        {@const episodeDuration = formatCompactDuration(ep.duration)}
        <li>
          <button
            class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-primary transition-colors"
            onclick={() => selectEpisode(ep)}
          >
            <!-- Play icon -->
            <div
              class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-600 text-white"
            >
              <svg
                class="h-4 w-4 translate-x-0.5"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>

            <!-- Episode info -->
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-text-primary">{ep.title}</p>
              <div class="mt-0.5 flex items-center gap-2 text-xs text-text-secondary">
                {#if episodeDate}
                  <span>{episodeDate}</span>
                {/if}
                {#if episodeDate && episodeDuration}
                  <span>·</span>
                {/if}
                {#if episodeDuration}
                  <span>{episodeDuration}</span>
                {/if}
              </div>
            </div>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
