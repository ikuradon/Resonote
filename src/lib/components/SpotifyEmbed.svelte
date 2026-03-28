<script module lang="ts">
  import { loadWindowCallbackScript } from '$shared/browser/script-loader.js';
  import { createLogger } from '$shared/utils/logger.js';

  const log = createLogger('SpotifyEmbed');

  function loadApi(): Promise<SpotifyIFrameAPI> {
    log.info('Loading Spotify IFrame API...');
    return loadWindowCallbackScript<SpotifyIFrameAPI>({
      src: 'https://open.spotify.com/embed-podcast/iframe-api/v1',
      callbackName: 'onSpotifyIframeApiReady',
      isReady: () =>
        typeof window !== 'undefined' &&
        !!(window as unknown as Record<string, unknown>).SpotifyIframeApi,
      getResolvedValue: (api) => api as SpotifyIFrameAPI,
      onResolved: (api) => {
        (window as unknown as Record<string, SpotifyIFrameAPI>).SpotifyIframeApi = api;
      }
    });
  }
</script>

<script lang="ts">
  import { createAsyncReadyTimeout } from '$shared/browser/async-ready-timeout.js';
  import { onTogglePlayback } from '$shared/browser/playback-bridge.js';
  import { updatePlayback } from '$shared/browser/player.js';
  import { onSeek } from '$shared/browser/seek-bridge.js';
  import type { ContentId } from '$shared/content/types.js';
  import { t } from '$shared/i18n/t.js';

  import EmbedLoading from './EmbedLoading.svelte';

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

  function handleSeek(posMs: number) {
    if (controller && posMs >= 0) {
      log.debug('Seeking to position', { positionMs: posMs });
      controller.seek(posMs / 1000);
      controller.resume();
    }
  }

  $effect(() => {
    if (!containerEl) return;

    const uri = spotifyUri(contentId);

    const cleanupSeek = onSeek(handleSeek);
    const cleanupToggle = onTogglePlayback(() => {
      if (!controller) return;
      controller.togglePlay();
    });

    if (controller) {
      controller.loadUri(uri);
      return () => {
        cleanupSeek();
        cleanupToggle();
      };
    }

    let cancelled = false;
    const readyTimeout = createAsyncReadyTimeout({
      timeoutMs: 15000,
      onTimeout: () => {
        log.error('Player initialization timed out');
        error = true;
      }
    });

    initController(containerEl, uri)
      .then((ctrl) => {
        if (cancelled || !readyTimeout.succeed()) {
          ctrl.destroy();
          return;
        }
        controller = ctrl;
        ready = true;
      })
      .catch((err) => {
        readyTimeout.cancel();
        log.error('Failed to initialize Spotify controller', err);
        error = true;
      });

    return () => {
      cancelled = true;
      readyTimeout.cancel();
      cleanupSeek();
      cleanupToggle();
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
    <EmbedLoading color="bg-spotify">
      {#snippet icon()}
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
      {/snippet}
    </EmbedLoading>
  {/if}
</div>
