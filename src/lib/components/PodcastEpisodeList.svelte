<script lang="ts">
  import { goto } from '$app/navigation';
  import type { ContentId } from '$lib/content/types.js';
  import { buildEpisodeContentId } from '$lib/content/podcast.js';
  import { fromBase64url } from '$lib/content/url-utils.js';
  import { resolveByApi } from '$lib/content/podcast-resolver.js';
  import { publishSignedEvents } from '$lib/nostr/publish-signed.js';

  interface Props {
    contentId: ContentId;
  }

  let { contentId }: Props = $props();

  type Status = 'loading' | 'loaded' | 'error';

  let status = $state<Status>('loading');
  let feedTitle = $state('');
  let feedImage = $state('');
  let episodes = $state<
    {
      guid: string;
      title: string;
      enclosureUrl: string;
      duration: number;
      publishedAt: number;
    }[]
  >([]);
  let errorMessage = $state('');

  function formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function formatDate(unix: number): string {
    if (!unix) return '';
    return new Date(unix * 1000).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function selectEpisode(ep: { guid: string }) {
    const feedUrl = fromBase64url(contentId.id);
    const episodeContentId = buildEpisodeContentId(feedUrl, ep.guid);
    goto(`/podcast/episode/${episodeContentId.id}`);
  }

  $effect(() => {
    const feedUrl = fromBase64url(contentId.id);
    load(feedUrl);
  });

  async function load(feedUrl: string) {
    status = 'loading';
    try {
      const data = await resolveByApi(feedUrl);

      if (data.error) {
        status = 'error';
        errorMessage = 'フィードの読み込みに失敗しました';
        return;
      }

      if (data.feed) {
        feedTitle = data.feed.title;
        feedImage = data.feed.imageUrl;
      }

      if (data.episodes) {
        episodes = data.episodes;
      }

      status = 'loaded';

      if (data.signedEvents && data.signedEvents.length > 0) {
        publishSignedEvents(data.signedEvents).catch(() => {
          // ignore publish errors silently
        });
      }
    } catch {
      status = 'error';
      errorMessage = 'フィードの読み込みに失敗しました';
    }
  }
</script>

<div class="rounded-2xl border border-border-subtle bg-surface-secondary">
  {#if status === 'loading'}
    <div class="flex min-h-[200px] items-center justify-center p-6">
      <div class="flex flex-col items-center gap-3" role="status">
        <div
          class="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent"
          aria-hidden="true"
        ></div>
        <p class="text-text-secondary">エピソード一覧を読み込み中...</p>
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
                {#if ep.publishedAt}
                  <span>{formatDate(ep.publishedAt)}</span>
                {/if}
                {#if ep.duration}
                  <span>·</span>
                  <span>{formatDuration(ep.duration)}</span>
                {/if}
              </div>
            </div>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
