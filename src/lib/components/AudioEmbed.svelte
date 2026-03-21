<script lang="ts">
  import { createAudioEmbedViewModel } from './audio-embed-view-model.svelte.js';
  import type { ContentId } from '$shared/content/types.js';
  import { formatDuration } from '$shared/utils/format.js';
  import { t } from '$shared/i18n/t.js';

  interface Props {
    contentId: ContentId;
    enclosureUrl?: string;
    title?: string;
    feedTitle?: string;
    image?: string;
    openUrl?: string;
  }

  let { contentId, enclosureUrl, title, feedTitle, image, openUrl }: Props = $props();
  const vm = createAudioEmbedViewModel({
    getContentId: () => contentId,
    getEnclosureUrl: () => enclosureUrl
  });
</script>

<div
  data-testid="audio-embed"
  class="animate-fade-in w-full overflow-hidden rounded-2xl border border-border-subtle bg-zinc-800 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
>
  <audio use:vm.bindAudioElement src={vm.audioSrc ?? undefined} preload="metadata" class="hidden"
  ></audio>

  {#if vm.error}
    <div class="flex flex-col items-center justify-center gap-3 px-4 py-6">
      <p class="text-sm text-zinc-400">{t('embed.load_failed')}</p>
      {#if openUrl}
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-accent underline transition-colors hover:text-accent-hover"
        >
          {t('embed.check_source')}
        </a>
      {/if}
    </div>
  {:else}
    <div class="flex gap-4 p-4">
      <!-- Artwork -->
      {#if image}
        <button
          onclick={vm.togglePlayPause}
          aria-label={vm.isPaused ? 'Play' : 'Pause'}
          class="group relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl"
        >
          <img src={image} alt={title ?? ''} class="h-full w-full object-cover" />
          <div
            class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <svg
              aria-hidden="true"
              class="h-8 w-8 text-white"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              {#if vm.isPaused}
                <path d="M8 5v14l11-7z" />
              {:else}
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              {/if}
            </svg>
          </div>
        </button>
      {/if}

      <!-- Info + Controls -->
      <div class="flex min-w-0 flex-1 flex-col justify-between">
        <!-- Metadata -->
        {#if title || feedTitle}
          <div class="mb-2 min-w-0">
            {#if title}
              <p class="truncate text-sm font-medium text-zinc-100">{title}</p>
            {/if}
            {#if feedTitle}
              <p class="truncate text-xs text-zinc-400">{feedTitle}</p>
            {/if}
          </div>
        {/if}

        <!-- Progress bar -->
        <div class="flex flex-col gap-1">
          <input
            type="range"
            min="0"
            max={isFinite(vm.duration) && vm.duration > 0 ? vm.duration : 100}
            step="0.1"
            value={vm.currentTime}
            oninput={vm.handleSeekInput}
            class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-600 accent-amber-500"
            aria-label="Seek"
          />
          <div class="flex justify-between text-xs text-zinc-400">
            <span>{formatDuration(vm.currentTime)}</span>
            <span>{formatDuration(vm.duration)}</span>
          </div>
        </div>

        <!-- Controls row -->
        <div class="mt-1 flex items-center gap-3">
          {#if !image}
            <!-- Play/Pause button (shown when no artwork) -->
            <button
              onclick={vm.togglePlayPause}
              class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-600 text-white hover:bg-amber-500 active:scale-95"
              aria-label={vm.isPaused ? 'Play' : 'Pause'}
            >
              {#if vm.isPaused}
                <svg
                  aria-hidden="true"
                  class="h-5 w-5 translate-x-0.5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              {:else}
                <svg aria-hidden="true" class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              {/if}
            </button>
          {/if}

          <!-- Volume slider -->
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <svg
              aria-hidden="true"
              class="h-4 w-4 flex-shrink-0 text-zinc-400"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path
                d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"
              />
            </svg>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={vm.volume}
              oninput={vm.handleVolumeInput}
              class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-600 accent-amber-500"
              aria-label="Volume"
            />
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
