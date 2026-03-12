<script lang="ts">
  import type { ContentId } from '../content/types.js';
  import { updatePlayback } from '../stores/player.svelte.js';
  import { createLogger } from '../utils/logger.js';

  const log = createLogger('SpotifyEmbed');

  interface Props {
    contentId: ContentId;
  }

  let { contentId }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let controller: SpotifyEmbedController | undefined;

  function spotifyUri(id: ContentId): string {
    return `spotify:${id.type}:${id.id}`;
  }

  /** Cached API promise to avoid race conditions on concurrent calls */
  let apiPromise: Promise<SpotifyIFrameAPI> | undefined;

  function loadApi(): Promise<SpotifyIFrameAPI> {
    if (apiPromise) return apiPromise;

    log.info('Loading Spotify IFrame API...');
    apiPromise = new Promise((resolve) => {
      window.onSpotifyIframeApiReady = (api) => {
        resolve(api);
      };

      const script = document.createElement('script');
      script.src = 'https://open.spotify.com/embed-podcast/iframe-api/v1';
      script.async = true;
      document.head.appendChild(script);
    });

    return apiPromise;
  }

  async function initController(el: HTMLDivElement, uri: string) {
    log.info('Initializing Spotify controller', { uri });
    const api = await loadApi();

    return new Promise<SpotifyEmbedController>((resolve) => {
      api.createController(el, { uri, width: '100%', height: 352 }, (ctrl) => {
        ctrl.addListener('playback_update', (e) => {
          updatePlayback(e.data.position, e.data.duration, e.data.isPaused);
        });
        ctrl.addListener('ready', () => {
          log.info('Spotify controller ready');
          resolve(ctrl);
        });
      });
    });
  }

  function handleSeek(e: Event) {
    const detail = (e as CustomEvent<{ positionMs: number }>).detail;
    if (controller && detail.positionMs >= 0) {
      log.debug('Seeking to position', { positionMs: detail.positionMs });
      controller.seek(detail.positionMs / 1000);
    }
  }

  $effect(() => {
    if (!containerEl) return;

    const uri = spotifyUri(contentId);

    window.addEventListener('resonote:seek', handleSeek);

    if (controller) {
      controller.loadUri(uri);
      return () => {
        window.removeEventListener('resonote:seek', handleSeek);
      };
    }

    let cancelled = false;

    initController(containerEl, uri).then((ctrl) => {
      if (cancelled) {
        ctrl.destroy();
        return;
      }
      controller = ctrl;
    });

    return () => {
      cancelled = true;
      window.removeEventListener('resonote:seek', handleSeek);
      controller?.destroy();
      controller = undefined;
    };
  });
</script>

<div
  data-testid="spotify-embed"
  class="animate-fade-in w-full overflow-hidden rounded-2xl border border-border-subtle shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
>
  <div bind:this={containerEl}></div>
</div>
