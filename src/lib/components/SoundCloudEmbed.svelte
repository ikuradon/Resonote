<script lang="ts">
  import { resolveSoundCloudEmbed } from '$features/content-resolution/application/resolve-soundcloud-embed.js';
  import { createAsyncReadyTimeout } from '$shared/browser/async-ready-timeout.js';
  import { loadExternalScript } from '$shared/browser/script-loader.js';
  import type { ContentId } from '$shared/content/types.js';
  import { setContent, updatePlayback } from '$shared/browser/player.js';
  import { onSeek } from '$shared/browser/seek-bridge.js';
  import { t } from '$shared/i18n/t.js';
  import { createLogger } from '$shared/utils/logger.js';
  import EmbedLoading from './EmbedLoading.svelte';

  const log = createLogger('SoundCloudEmbed');

  interface Props {
    contentId: ContentId;
    openUrl?: string;
  }

  let { contentId, openUrl }: Props = $props();

  let iframeEl: HTMLIFrameElement | undefined = $state();
  // eslint-disable-next-line no-undef
  let widget: SC.WidgetInstance | undefined;
  let ready = $state(false);
  let error = $state(false);
  let embedSrc = $state('');

  function loadApi(): Promise<void> {
    log.info('Loading SoundCloud Widget API...');
    return loadExternalScript({
      src: 'https://w.soundcloud.com/player/api.js',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      isReady: () => typeof window !== 'undefined' && !!(window as any).SC?.Widget
    });
  }

  function handleSeek(posMs: number) {
    if (widget && posMs >= 0) {
      log.debug('Seeking to position', { posMs });
      widget.seekTo(posMs);
    }
  }

  // Resolve embed URL via oEmbed API
  $effect(() => {
    const trackUrl = `https://soundcloud.com/${contentId.id}`;
    embedSrc = '';
    error = false;

    let cancelled = false;
    resolveSoundCloudEmbed(trackUrl)
      .then((src) => {
        if (!cancelled) embedSrc = src;
      })
      .catch((err) => {
        if (!cancelled) {
          log.error('Failed to resolve SoundCloud oEmbed', err);
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
      timeoutMs: 15000,
      onTimeout: () => {
        log.error('Player initialization timed out');
        error = true;
      }
    });

    loadApi()
      .then(() => {
        if (cancelled || readyTimeout.hasTimedOut()) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SCWidget = (window as any).SC.Widget;
        const w = SCWidget(iframeEl) as SC.WidgetInstance; // eslint-disable-line no-undef

        w.bind(SCWidget.Events.READY, () => {
          if (cancelled || !readyTimeout.succeed()) return;
          widget = w;
          ready = true;
          setContent(contentId);
          log.info('SoundCloud widget ready');
          w.getDuration((d: number) => {
            cachedDuration = d;
          });
        });

        w.bind(SCWidget.Events.PLAY, () => {
          cachedPaused = false;
        });
        w.bind(SCWidget.Events.PAUSE, () => {
          cachedPaused = true;
        });

        w.bind(SCWidget.Events.PLAY_PROGRESS, (data?: unknown) => {
          const d = data as { currentPosition: number };
          updatePlayback(d.currentPosition, cachedDuration, cachedPaused);
        });
      })
      .catch((err) => {
        readyTimeout.cancel();
        log.error('Failed to initialize SoundCloud widget', err);
        error = true;
      });

    return () => {
      cancelled = true;
      readyTimeout.cancel();
      cleanupSeek();
      if (widget) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const SCWidget = (window as any).SC?.Widget;
          if (SCWidget?.Events) {
            widget.unbind(SCWidget.Events.READY);
            widget.unbind(SCWidget.Events.PLAY);
            widget.unbind(SCWidget.Events.PAUSE);
            widget.unbind(SCWidget.Events.PLAY_PROGRESS);
          }
        } catch {
          // iframe may already be removed from DOM during navigation
        }
      }
      widget = undefined;
      ready = false;
      error = false;
    };
  });
</script>

<div
  data-testid="soundcloud-embed"
  class="animate-fade-in relative w-full overflow-hidden rounded-2xl border border-border-subtle shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
>
  {#if embedSrc}
    <iframe
      bind:this={iframeEl}
      src={embedSrc}
      width="100%"
      height="166"
      scrolling="no"
      frameborder="no"
      allow="autoplay"
      title={t('embed.player_title', { platform: 'SoundCloud' })}
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
    <EmbedLoading color="bg-orange-500" minHeight="min-h-[166px]">
      {#snippet icon()}
        <svg
          aria-hidden="true"
          class="h-8 w-8 text-orange-500"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M11.56 8.87V17h8.76c1.85-.04 2.68-1.32 2.68-2.66 0-1.34-.84-2.64-2.68-2.66-.2-3.17-2.7-4.68-4.93-4.68-1.68 0-2.77.67-3.83 1.87zM7.1 11.74c.52 0 .94.42.94.94v3.94c0 .52-.42.94-.94.94s-.94-.42-.94-.94v-3.94c0-.52.42-.94.94-.94zm-2.35 1.18c.52 0 .94.42.94.94v2.76c0 .52-.42.94-.94.94S3.8 17.14 3.8 16.62v-2.76c0-.52.42-.94.95-.94zM9.45 10.2c.52 0 .94.42.94.94v5.48c0 .52-.42.94-.94.94s-.94-.42-.94-.94v-5.48c0-.52.42-.94.94-.94zM2.4 13.87c.52 0 .94.42.94.94v1.81c0 .52-.42.94-.94.94s-.95-.42-.95-.94v-1.81c0-.52.43-.94.95-.94zM0 14.81c.52 0 .94.42.94.94v.87c0 .52-.42.94-.94.94V14.81z"
          />
        </svg>
      {/snippet}
    </EmbedLoading>
  {/if}
</div>
