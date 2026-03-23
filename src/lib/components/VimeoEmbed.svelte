<script lang="ts">
  import { createAsyncReadyTimeout } from '$shared/browser/async-ready-timeout.js';
  import { loadExternalScript } from '$shared/browser/script-loader.js';
  import type { ContentId } from '$shared/content/types.js';
  import { VimeoProvider } from '$shared/content/vimeo.js';
  import { updatePlayback } from '$shared/browser/player.js';
  import { onSeek } from '../../shared/browser/seek-bridge.js';
  import { t } from '$shared/i18n/t.js';
  import { createLogger } from '$shared/utils/logger.js';
  import EmbedLoading from './EmbedLoading.svelte';

  const log = createLogger('VimeoEmbed');
  const provider = new VimeoProvider();

  interface Props {
    contentId: ContentId;
    openUrl?: string;
  }

  let { contentId, openUrl }: Props = $props();

  let iframeEl: HTMLIFrameElement | undefined = $state();
  let player: Vimeo.Player | undefined; // eslint-disable-line no-undef
  let ready = $state(false);
  let error = $state(false);

  function loadApi(): Promise<void> {
    log.info('Loading Vimeo Player API...');
    return loadExternalScript({
      src: 'https://player.vimeo.com/api/player.js',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      isReady: () => typeof window !== 'undefined' && !!(window as any).Vimeo?.Player
    });
  }

  function handleSeek(posMs: number) {
    if (player && posMs >= 0) {
      log.debug('Seeking to position', { positionMs: posMs });
      player.setCurrentTime(posMs / 1000);
    }
  }

  $effect(() => {
    if (!iframeEl) return;

    const cleanupSeek = onSeek(handleSeek);
    let cancelled = false;
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
        const p = new Vimeo.Player(iframeEl!);
        let cachedPaused = true;

        p.on('play', () => {
          cachedPaused = false;
        });
        p.on('pause', () => {
          cachedPaused = true;
          // Immediately update to reflect paused state (timeupdate may lag)
          p.getCurrentTime().then((sec: number) => {
            p.getDuration().then((dur: number) => {
              updatePlayback(sec * 1000, dur * 1000, true);
            });
          });
        });
        p.on('ended', () => {
          cachedPaused = true;
        });

        p.on('timeupdate', (data: { seconds: number; duration: number }) => {
          updatePlayback(data.seconds * 1000, data.duration * 1000, cachedPaused);
        });

        p.on('loaded', () => {
          if (cancelled || !readyTimeout.succeed()) {
            p.destroy();
            return;
          }
          player = p;
          ready = true;
          log.info('Vimeo player ready');
        });
      })
      .catch((err) => {
        readyTimeout.cancel();
        log.error('Failed to initialize Vimeo player', err);
        error = true;
      });

    return () => {
      cancelled = true;
      readyTimeout.cancel();
      cleanupSeek();
      if (player) {
        try {
          player.off('play');
          player.off('pause');
          player.off('ended');
          player.off('timeupdate');
          player.off('loaded');
          player.destroy();
        } catch {
          // iframe may already be removed from DOM during navigation
        }
      }
      player = undefined;
      ready = false;
      error = false;
    };
  });
</script>

<div
  data-testid="vimeo-embed"
  class="animate-fade-in relative aspect-video w-full overflow-hidden rounded-2xl border border-border-subtle shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
>
  <iframe
    bind:this={iframeEl}
    src={provider.embedUrl(contentId)}
    class="h-full w-full"
    allow="autoplay; fullscreen; picture-in-picture"
    title={t('embed.player_title', { platform: 'Vimeo' })}
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
    <EmbedLoading color="bg-text-muted">
      {#snippet icon()}
        <svg
          aria-hidden="true"
          class="h-8 w-8 text-text-muted"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609-3.268 4.247-6.026 6.37-8.29 6.37-1.409 0-2.578-1.294-3.553-3.881L5.322 11.4C4.603 8.816 3.834 7.522 3.01 7.522c-.179 0-.806.378-1.881 1.132L0 7.197c1.185-1.044 2.351-2.084 3.501-3.128C5.08 2.701 6.266 1.984 7.055 1.91c1.867-.18 3.016 1.1 3.447 3.838.465 2.953.789 4.789.971 5.507.539 2.45 1.131 3.674 1.776 3.674.502 0 1.256-.796 2.265-2.385 1.004-1.589 1.54-2.797 1.612-3.628.144-1.371-.395-2.061-1.614-2.061-.574 0-1.167.121-1.777.391 1.186-3.868 3.434-5.757 6.762-5.637 2.473.06 3.628 1.664 3.48 4.807z"
          />
        </svg>
      {/snippet}
    </EmbedLoading>
  {/if}
</div>
