<script lang="ts">
  import { goto } from '$app/navigation';
  import type { ContentId } from '$shared/content/types.js';
  import { formatDateOnly } from '$shared/utils/format.js';
  import WaveformLoader from './WaveformLoader.svelte';
  import { t } from '$shared/i18n/t.js';
  import {
    resolveYouTubeFeed,
    type YouTubeFeedVideo
  } from '$features/content-resolution/application/resolve-youtube-feed.js';

  interface Props {
    contentId: ContentId;
  }

  let { contentId }: Props = $props();

  type Status = 'loading' | 'loaded' | 'error';

  let status = $state<Status>('loading');
  let feedTitle = $state('');
  let videos = $state<YouTubeFeedVideo[]>([]);

  function selectVideo(videoId: string) {
    goto(`/youtube/video/${videoId}`);
  }

  $effect(() => {
    const type = contentId.type as 'playlist' | 'channel';
    const id = contentId.id;

    status = 'loading';
    resolveYouTubeFeed(type, id).then((result) => {
      if (result.error) {
        status = 'error';
        return;
      }
      feedTitle = result.title;
      videos = result.videos;
      status = 'loaded';
    });
  });
</script>

<div class="flex flex-col gap-3">
  {#if status === 'loading'}
    <div class="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-1 p-4">
      <WaveformLoader />
      <span class="text-sm text-text-muted">{t('youtube.feed.loading')}</span>
    </div>
  {:else if status === 'error'}
    <div class="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
      {t('youtube.feed.error')}
    </div>
  {:else}
    {#if feedTitle}
      <div class="flex items-center gap-2">
        <svg
          aria-hidden="true"
          class="h-5 w-5 text-red-500"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.8 31.8 0 0 0 0 12a31.8 31.8 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.8 31.8 0 0 0 24 12a31.8 31.8 0 0 0-.5-5.81Z"
          />
          <path d="m9.6 15.6 6.2-3.6-6.2-3.6v7.2Z" fill="white" />
        </svg>
        <h2 class="text-sm font-medium text-text-primary">{feedTitle}</h2>
      </div>
    {/if}

    {#if videos.length > 0}
      <p class="text-xs text-text-muted">
        {t('youtube.feed.max_items', { count: String(videos.length) })}
      </p>
    {/if}

    <div class="max-h-[480px] space-y-1 overflow-y-auto">
      {#each videos as video (video.videoId)}
        <button
          type="button"
          onclick={() => selectVideo(video.videoId)}
          class="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-surface-2"
        >
          <img
            src={video.thumbnail}
            alt=""
            class="h-12 w-[68px] shrink-0 rounded object-cover"
            loading="lazy"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-text-primary">{video.title}</p>
            {#if video.published > 0}
              <p class="text-xs text-text-muted">{formatDateOnly(video.published)}</p>
            {/if}
          </div>
          <svg
            aria-hidden="true"
            class="h-4 w-4 shrink-0 text-accent"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </button>
      {/each}
    </div>
  {/if}
</div>
