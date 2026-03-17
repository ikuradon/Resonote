<script lang="ts" module>
  import { createLogger } from '../utils/logger.js';

  const log = createLogger('YouTubeEmbed');

  let apiPromise: Promise<void> | undefined;

  function loadApi(): Promise<void> {
    if (apiPromise) return apiPromise;

    if (typeof YT !== 'undefined' && YT.Player) {
      apiPromise = Promise.resolve();
      return apiPromise;
    }

    log.info('Loading YouTube IFrame API...');
    apiPromise = new Promise((resolve, reject) => {
      window.onYouTubeIframeAPIReady = () => {
        resolve();
      };

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        apiPromise = undefined;
        reject(new Error('Failed to load YouTube API'));
      };
      document.head.appendChild(script);
    });

    return apiPromise;
  }
</script>

<script lang="ts">
  import type { ContentId } from '../content/types.js';
  import { t } from '../i18n/t.js';
  import { updatePlayback } from '../stores/player.svelte.js';

  const POLL_INTERVAL_MS = 250;

  interface Props {
    contentId: ContentId;
    openUrl?: string;
  }

  let { contentId, openUrl }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let player: YT.Player | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let ready = $state(false);
  let error = $state(false);

  function syncPlayback(p: YT.Player) {
    const isPaused = p.getPlayerState() !== YT.PlayerState.PLAYING;
    updatePlayback(p.getCurrentTime() * 1000, p.getDuration() * 1000, isPaused);
  }

  function startPolling(p: YT.Player) {
    stopPolling();
    pollTimer = setInterval(() => syncPlayback(p), POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer !== undefined) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  }

  async function initPlayer(el: HTMLDivElement, videoId: string) {
    log.info('Initializing YouTube player', { videoId });
    await loadApi();

    return new Promise<YT.Player>((resolve) => {
      const p = new YT.Player(el, {
        width: '100%',
        height: '100%',
        videoId,
        playerVars: {
          enablejsapi: 1,
          rel: 0
        },
        events: {
          onReady: () => {
            log.info('YouTube player ready');
            startPolling(p);
            resolve(p);
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              startPolling(p);
            } else {
              stopPolling();
            }
            syncPlayback(p);
          }
        }
      });
    });
  }

  function handleSeek(e: Event) {
    const detail = (e as CustomEvent<{ positionMs: number }>).detail;
    if (player && detail.positionMs >= 0) {
      log.debug('Seeking to position', { positionMs: detail.positionMs });
      player.seekTo(detail.positionMs / 1000, true);
      player.playVideo();
    }
  }

  $effect(() => {
    if (!containerEl) return;

    const videoId = contentId.id;

    window.addEventListener('resonote:seek', handleSeek);

    if (player) {
      player.loadVideoById(videoId);
      return () => {
        window.removeEventListener('resonote:seek', handleSeek);
      };
    }

    let cancelled = false;

    const readyTimeout = setTimeout(() => {
      if (!ready && !error) {
        log.error('Player initialization timed out');
        error = true;
      }
    }, 15000);

    initPlayer(containerEl, videoId)
      .then((p) => {
        if (cancelled) {
          p.destroy();
          return;
        }
        player = p;
        ready = true;
        clearTimeout(readyTimeout);
      })
      .catch((err) => {
        log.error('Failed to initialize YouTube player', err);
        error = true;
      });

    return () => {
      cancelled = true;
      clearTimeout(readyTimeout);
      window.removeEventListener('resonote:seek', handleSeek);
      stopPolling();
      player?.destroy();
      player = undefined;
      ready = false;
      error = false;
    };
  });
</script>

<div
  data-testid="youtube-embed"
  class="animate-fade-in relative aspect-video w-full overflow-hidden rounded-2xl border border-border-subtle shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
>
  <div bind:this={containerEl} class="h-full"></div>
  {#if error}
    <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface-1">
      <p class="text-sm text-text-muted">{t('embed.load_failed')}</p>
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
  {:else if !ready}
    <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-1">
      <div class="flex items-center gap-3">
        <svg
          aria-hidden="true"
          class="h-8 w-8 text-youtube"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
          />
        </svg>
        <span class="text-sm font-medium text-text-muted">{t('loading')}</span>
      </div>
      <div class="w-48">
        <div class="h-1 overflow-hidden rounded-full bg-surface-3">
          <div
            class="animate-shimmer h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-youtube/40 to-transparent"
            style="background-size: 400px 100%;"
          ></div>
        </div>
      </div>
    </div>
  {/if}
</div>
