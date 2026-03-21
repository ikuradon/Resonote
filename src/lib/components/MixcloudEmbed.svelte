<script lang="ts">
  import { createAsyncReadyTimeout } from '$shared/browser/async-ready-timeout.js';
  import { loadExternalScript } from '$shared/browser/script-loader.js';
  import type { ContentId } from '$shared/content/types.js';
  import { MixcloudProvider } from '$shared/content/mixcloud.js';
  import { updatePlayback } from '$shared/browser/player.js';
  import { onSeek } from '../../shared/browser/seek-bridge.js';
  import { t } from '$shared/i18n/t.js';
  import { createLogger } from '$shared/utils/logger.js';
  import EmbedLoading from './EmbedLoading.svelte';

  const log = createLogger('MixcloudEmbed');
  const provider = new MixcloudProvider();

  interface Props {
    contentId: ContentId;
    openUrl?: string;
  }

  let { contentId, openUrl }: Props = $props();

  let iframeEl: HTMLIFrameElement | undefined = $state();
  // eslint-disable-next-line no-undef
  let widget: Mixcloud.MixcloudWidget | undefined;
  let ready = $state(false);
  let error = $state(false);

  function loadApi(): Promise<void> {
    log.info('Loading Mixcloud Widget API...');
    return loadExternalScript({
      src: 'https://widget.mixcloud.com/media/js/widgetApi.js',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      isReady: () => typeof window !== 'undefined' && !!(window as any).Mixcloud?.PlayerWidget
    });
  }

  function handleSeek(posMs: number) {
    if (widget && posMs >= 0) {
      log.debug('Seeking to position', { positionMs: posMs });
      widget.seek(posMs / 1000);
    }
  }

  $effect(() => {
    if (!iframeEl) return;

    const cleanupSeek = onSeek(handleSeek);

    let cancelled = false;
    let cachedPaused = true;
    let progressHandler: ((position: number, duration: number) => void) | undefined;
    let playHandler: (() => void) | undefined;
    let pauseHandler: (() => void) | undefined;
    const readyTimeout = createAsyncReadyTimeout({
      timeoutMs: 15000,
      onTimeout: () => {
        log.error('Player initialization timed out');
        error = true;
      }
    });

    loadApi()
      .then(() => {
        if (cancelled || readyTimeout.hasTimedOut()) return;
        // eslint-disable-next-line no-undef
        const w = Mixcloud.PlayerWidget(iframeEl!);

        return w.ready.then(() => {
          if (cancelled || !readyTimeout.succeed()) return;
          widget = w;
          ready = true;
          log.info('Mixcloud widget ready');

          playHandler = () => {
            cachedPaused = false;
          };
          pauseHandler = () => {
            cachedPaused = true;
          };
          progressHandler = (position: number, duration: number) => {
            updatePlayback(position * 1000, duration * 1000, cachedPaused);
          };

          w.events.play.on(playHandler);
          w.events.pause.on(pauseHandler);
          w.events.progress.on(progressHandler);
        });
      })
      .catch((err) => {
        readyTimeout.cancel();
        log.error('Failed to initialize Mixcloud widget', err);
        error = true;
      });

    return () => {
      cancelled = true;
      readyTimeout.cancel();
      cleanupSeek();
      if (widget && progressHandler && playHandler && pauseHandler) {
        widget.events.progress.off(progressHandler);
        widget.events.play.off(playHandler);
        widget.events.pause.off(pauseHandler);
      }
      widget = undefined;
      ready = false;
      error = false;
    };
  });
</script>

<div
  data-testid="mixcloud-embed"
  class="animate-fade-in relative w-full overflow-hidden rounded-2xl border border-border-subtle shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
>
  <iframe
    bind:this={iframeEl}
    src={provider.embedUrl(contentId)}
    width="100%"
    height="120"
    scrolling="no"
    frameborder="no"
    allow="autoplay; encrypted-media"
    title="Mixcloud Player"
  ></iframe>
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
    <EmbedLoading color="bg-violet-500">
      {#snippet icon()}
        <svg
          aria-hidden="true"
          class="h-8 w-8 text-violet-500"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M12 1a9 9 0 0 0-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2a7 7 0 0 1 14 0v2h-4v8h3c1.66 0 3-1.34 3-3v-7a9 9 0 0 0-9-9z"
          />
        </svg>
      {/snippet}
    </EmbedLoading>
  {/if}
</div>
