<script lang="ts">
  import { createAsyncReadyTimeout } from '$shared/browser/async-ready-timeout.js';
  import { setContent, updatePlayback } from '$shared/browser/player.js';
  import { mountPodbeanWidget, type PodbeanWidgetHandle } from '$shared/browser/podbean-widget.js';
  import { onSeek } from '$shared/browser/seek-bridge.js';
  import type { ContentId } from '$shared/content/types.js';
  import { t } from '$shared/i18n/t.js';
  import { createLogger } from '$shared/utils/logger.js';

  import EmbedLoading from './EmbedLoading.svelte';

  interface Props {
    contentId: ContentId;
    openUrl?: string;
  }

  let { contentId, openUrl }: Props = $props();

  let iframeEl: HTMLIFrameElement | undefined = $state();
  let widgetHandle: PodbeanWidgetHandle | undefined;
  let ready = $state(false);
  let error = $state(false);
  let embedSrc = $state('');
  const log = createLogger('PodbeanEmbed');

  function handleSeek(posMs: number) {
    if (!widgetHandle || posMs < 0) return;
    log.debug('Seeking to position', { posMs });
    widgetHandle.seekTo(posMs);
  }

  // Resolve embed URL via Podbean oEmbed API
  $effect(() => {
    embedSrc = '';
    error = false;

    // Build the source URL for oEmbed lookup
    const id = contentId.id;
    let sourceUrl: string;
    if (id.startsWith('pb-')) {
      sourceUrl = `https://www.podbean.com/media/share/${id}`;
    } else {
      const parts = id.split('/');
      sourceUrl = `https://${parts[0]}.podbean.com/e/${parts[1]}`;
    }

    let cancelled = false;
    import('$features/content-resolution/application/resolve-podbean-embed.js')
      .then(({ resolvePodbeanEmbed }) => resolvePodbeanEmbed(sourceUrl))
      .then((src) => {
        if (!cancelled) embedSrc = src;
      })
      .catch((err) => {
        if (!cancelled) {
          log.error('Failed to resolve Podbean oEmbed', err);
          error = true;
        }
      });

    return () => {
      cancelled = true;
    };
  });

  // Initialize widget once iframe loads
  $effect(() => {
    if (!iframeEl || !embedSrc) return;

    const cleanupSeek = onSeek(handleSeek);

    let cancelled = false;
    let cachedDuration = 0;
    let cachedPaused = true;
    const readyTimeout = createAsyncReadyTimeout({
      timeoutMs: 20000,
      onTimeout: () => {
        log.error('Player initialization timed out');
        error = true;
      }
    });

    widgetHandle = mountPodbeanWidget(iframeEl, {
      onReady: () => {
        if (cancelled || !readyTimeout.succeed()) return;
        setContent(contentId);
        ready = true;
        log.info('Podbean widget ready');
      },
      onPlay: (widget) => {
        cachedPaused = false;
        if (!cachedDuration || isNaN(cachedDuration)) {
          widget.getDuration((duration) => {
            if (typeof duration === 'number' && !isNaN(duration) && duration > 0) {
              cachedDuration = duration;
            }
          });
        }
      },
      onPause: () => {
        cachedPaused = true;
      },
      onProgress: (event) => {
        const pos = event.data?.currentPosition;
        const rel = event.data?.relativePosition;
        if (pos === undefined) return;
        if (rel && rel > 0) {
          cachedDuration = pos / rel;
        }
        updatePlayback(pos * 1000, cachedDuration * 1000, cachedPaused);
      },
      onError: (err) => {
        readyTimeout.cancel();
        log.error('Failed to initialize Podbean widget', err);
        error = true;
      }
    });

    return () => {
      cancelled = true;
      readyTimeout.cancel();
      cleanupSeek();
      widgetHandle?.destroy();
      widgetHandle = undefined;
      ready = false;
      error = false;
    };
  });
</script>

<div
  data-testid="podbean-embed"
  class="animate-fade-in relative w-full overflow-hidden rounded-2xl border border-border-subtle shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
>
  {#if embedSrc}
    <iframe
      bind:this={iframeEl}
      id="pb-player"
      data-name="pb-iframe-player"
      src={embedSrc}
      width="100%"
      height="150"
      scrolling="no"
      frameborder="no"
      allow="autoplay"
      title={t('embed.player_title', { platform: 'Podbean' })}
    ></iframe>
  {/if}
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
    <EmbedLoading color="bg-[#3db56a]" minHeight="min-h-[150px]">
      {#snippet icon()}
        <svg
          aria-hidden="true"
          class="h-8 w-8"
          style="color: #3db56a;"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4zm0 18a7 7 0 0 0 7-7h-2a5 5 0 0 1-10 0H5a7 7 0 0 0 7 7zm-1 2v2h2v-2h-2z"
          />
        </svg>
      {/snippet}
    </EmbedLoading>
  {/if}
</div>
