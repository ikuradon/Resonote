<script module lang="ts">
  import { createLogger } from '../utils/logger.js';

  const log = createLogger('SpotifyEmbed');

  /** Module-level API cache — persists across SPA navigations */
  let apiPromise: Promise<SpotifyIFrameAPI> | undefined;

  function loadApi(): Promise<SpotifyIFrameAPI> {
    if (apiPromise) return apiPromise;

    // Check if already loaded (re-visit in SPA)
    if (
      typeof window !== 'undefined' &&
      (window as unknown as Record<string, unknown>).SpotifyIframeApi
    ) {
      apiPromise = Promise.resolve(
        (window as unknown as Record<string, SpotifyIFrameAPI>).SpotifyIframeApi
      );
      return apiPromise;
    }

    log.info('Loading Spotify IFrame API...');
    apiPromise = new Promise((resolve) => {
      window.onSpotifyIframeApiReady = (api) => {
        (window as unknown as Record<string, SpotifyIFrameAPI>).SpotifyIframeApi = api;
        resolve(api);
      };

      const script = document.createElement('script');
      script.src = 'https://open.spotify.com/embed-podcast/iframe-api/v1';
      script.async = true;
      document.head.appendChild(script);
    });

    return apiPromise;
  }
</script>

<script lang="ts">
  import type { ContentId } from '../content/types.js';
  import { updatePlayback } from '../stores/player.svelte.js';
  import { t } from '../i18n/t.js';

  interface Props {
    contentId: ContentId;
    openUrl?: string;
  }

  let { contentId, openUrl }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let controller: SpotifyEmbedController | undefined;
  let ready = $state(false);
  let error = $state(false);

  function spotifyUri(id: ContentId): string {
    return `spotify:${id.type}:${id.id}`;
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
      controller.resume();
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

    const readyTimeout = setTimeout(() => {
      if (!ready && !error) {
        log.error('Player initialization timed out');
        error = true;
      }
    }, 15000);

    initController(containerEl, uri)
      .then((ctrl) => {
        if (cancelled) {
          ctrl.destroy();
          return;
        }
        controller = ctrl;
        ready = true;
        clearTimeout(readyTimeout);
      })
      .catch((err) => {
        log.error('Failed to initialize Spotify controller', err);
        error = true;
      });

    return () => {
      cancelled = true;
      clearTimeout(readyTimeout);
      window.removeEventListener('resonote:seek', handleSeek);
      controller?.destroy();
      controller = undefined;
      ready = false;
      error = false;
    };
  });
</script>

<div
  data-testid="spotify-embed"
  class="animate-fade-in relative w-full overflow-hidden rounded-2xl border border-border-subtle shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
>
  <div bind:this={containerEl}></div>
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
          class="h-8 w-8 text-spotify"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"
          />
        </svg>
        <span class="text-sm font-medium text-text-muted">{t('loading')}</span>
      </div>
      <div class="w-48">
        <div class="h-1 overflow-hidden rounded-full bg-surface-3">
          <div
            class="animate-shimmer h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-spotify/40 to-transparent"
            style="background-size: 400px 100%;"
          ></div>
        </div>
      </div>
    </div>
  {/if}
</div>
