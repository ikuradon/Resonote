<script lang="ts">
  import type { ContentId } from '$lib/content/types.js';
  import { fromBase64url } from '$lib/content/url-utils.js';
  import { setContent, updatePlayback } from '$lib/stores/player.svelte.js';
  import { t } from '$lib/i18n/t.js';

  interface Props {
    contentId: ContentId;
    enclosureUrl?: string;
    title?: string;
    feedTitle?: string;
    image?: string;
  }

  let { contentId, enclosureUrl, title, feedTitle, image }: Props = $props();

  let audioEl: HTMLAudioElement | undefined = $state();
  let currentTime = $state(0);
  let duration = $state(0);
  let isPaused = $state(true);
  let volume = $state(1);
  let error = $state(false);

  let audioSrc = $derived(
    enclosureUrl ?? (contentId.platform === 'audio' ? fromBase64url(contentId.id) : null)
  );

  function formatTime(seconds: number): string {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function togglePlayPause() {
    if (!audioEl) return;
    if (audioEl.paused) {
      audioEl.play();
    } else {
      audioEl.pause();
    }
  }

  function handleSeekInput(e: Event) {
    if (!audioEl) return;
    const value = parseFloat((e.target as HTMLInputElement).value);
    audioEl.currentTime = value;
  }

  function handleVolumeInput(e: Event) {
    if (!audioEl) return;
    const value = parseFloat((e.target as HTMLInputElement).value);
    audioEl.volume = value;
    volume = value;
  }

  function handleSeekEvent(e: Event) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detail = (e as CustomEvent).detail as any;
    const posMs: number = detail.positionMs ?? detail.position ?? -1;
    if (audioEl && posMs >= 0) {
      audioEl.currentTime = posMs / 1000;
    }
  }

  $effect(() => {
    const audio = audioEl;
    if (!audio) return;

    window.addEventListener('resonote:seek', handleSeekEvent);

    const onTimeUpdate = () => {
      currentTime = audio.currentTime;
      updatePlayback(audio.currentTime * 1000, audio.duration * 1000, audio.paused);
    };

    const onDurationChange = () => {
      duration = audio.duration;
    };

    const onPlay = () => {
      isPaused = false;
      updatePlayback(audio.currentTime * 1000, audio.duration * 1000, false);
    };

    const onPause = () => {
      isPaused = true;
      updatePlayback(audio.currentTime * 1000, audio.duration * 1000, true);
    };

    const onLoadedMetadata = () => {
      duration = audio.duration;
      error = false;
      setContent(contentId);
    };

    const onError = () => {
      error = true;
    };

    const onVolumeChange = () => {
      volume = audio.volume;
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('error', onError);
    audio.addEventListener('volumechange', onVolumeChange);

    return () => {
      window.removeEventListener('resonote:seek', handleSeekEvent);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('volumechange', onVolumeChange);
    };
  });
</script>

<div
  data-testid="audio-embed"
  class="animate-fade-in w-full overflow-hidden rounded-2xl border border-border-subtle bg-zinc-800 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
>
  <audio bind:this={audioEl} src={audioSrc ?? undefined} preload="metadata" class="hidden"></audio>

  {#if error}
    <div class="flex items-center justify-center px-4 py-6">
      <p class="text-sm text-zinc-400">{t('embed.load_failed')}</p>
    </div>
  {:else}
    <div class="flex gap-4 p-4">
      <!-- Artwork -->
      {#if image}
        <button
          onclick={togglePlayPause}
          class="group relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl"
        >
          <img src={image} alt={title ?? ''} class="h-full w-full object-cover" />
          <div
            class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <svg class="h-8 w-8 text-white" viewBox="0 0 24 24" fill="currentColor">
              {#if isPaused}
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
            max={isFinite(duration) && duration > 0 ? duration : 100}
            step="0.1"
            value={currentTime}
            oninput={handleSeekInput}
            class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-600 accent-amber-500"
            aria-label="Seek"
          />
          <div class="flex justify-between text-xs text-zinc-400">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <!-- Controls row -->
        <div class="mt-1 flex items-center gap-3">
          {#if !image}
            <!-- Play/Pause button (shown when no artwork) -->
            <button
              onclick={togglePlayPause}
              class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-600 text-white hover:bg-amber-500 active:scale-95"
              aria-label={isPaused ? 'Play' : 'Pause'}
            >
              {#if isPaused}
                <svg class="h-5 w-5 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              {:else}
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              {/if}
            </button>
          {/if}

          <!-- Volume slider -->
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <svg
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
              value={volume}
              oninput={handleVolumeInput}
              class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-600 accent-amber-500"
              aria-label="Volume"
            />
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
