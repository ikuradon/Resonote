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
    apiPromise = new Promise((resolve) => {
      window.onYouTubeIframeAPIReady = () => {
        resolve();
      };

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    });

    return apiPromise;
  }
</script>

<script lang="ts">
  import type { ContentId } from '../content/types.js';
  import { updatePlayback } from '../stores/player.svelte.js';

  const POLL_INTERVAL_MS = 250;

  interface Props {
    contentId: ContentId;
  }

  let { contentId }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let player: YT.Player | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  function startPolling(p: YT.Player) {
    stopPolling();
    pollTimer = setInterval(() => {
      const state = p.getPlayerState();
      const isPaused = state !== YT.PlayerState.PLAYING;
      const position = p.getCurrentTime() * 1000;
      const duration = p.getDuration() * 1000;
      updatePlayback(position, duration, isPaused);
    }, POLL_INTERVAL_MS);
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
            const isPaused = event.data !== YT.PlayerState.PLAYING;
            const position = p.getCurrentTime() * 1000;
            const duration = p.getDuration() * 1000;
            updatePlayback(position, duration, isPaused);
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

    let cancelled = false;

    initPlayer(containerEl, videoId).then((p) => {
      if (cancelled) {
        p.destroy();
        return;
      }
      player = p;
    });

    return () => {
      cancelled = true;
      window.removeEventListener('resonote:seek', handleSeek);
      stopPolling();
      player?.destroy();
      player = undefined;
    };
  });
</script>

<div
  data-testid="youtube-embed"
  class="animate-fade-in aspect-video w-full overflow-hidden rounded-2xl border border-border-subtle shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
>
  <div bind:this={containerEl}></div>
</div>
