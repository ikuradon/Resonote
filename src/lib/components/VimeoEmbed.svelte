<script lang="ts">
  import type { ContentId } from '../content/types.js';
  import { VimeoProvider } from '../content/vimeo.js';
  import { updatePlayback } from '../stores/player.svelte.js';
  import { t } from '../i18n/t.js';
  import { createLogger } from '../utils/logger.js';

  const log = createLogger('VimeoEmbed');
  const provider = new VimeoProvider();

  interface Props {
    contentId: ContentId;
  }

  let { contentId }: Props = $props();

  let iframeEl: HTMLIFrameElement | undefined = $state();
  let player: Vimeo.Player | undefined; // eslint-disable-line no-undef
  let ready = $state(false);
  let error = $state(false);

  let apiPromise: Promise<void> | undefined;

  function loadApi(): Promise<void> {
    if (apiPromise) return apiPromise;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== 'undefined' && (window as any).Vimeo?.Player) {
      apiPromise = Promise.resolve();
      return apiPromise;
    }
    log.info('Loading Vimeo Player API...');
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://player.vimeo.com/api/player.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Vimeo API'));
      document.head.appendChild(script);
    });
    return apiPromise;
  }

  function handleSeek(e: Event) {
    const detail = (e as CustomEvent<{ positionMs: number }>).detail;
    if (player && detail.positionMs >= 0) {
      log.debug('Seeking to position', { positionMs: detail.positionMs });
      player.setCurrentTime(detail.positionMs / 1000);
    }
  }

  $effect(() => {
    if (!iframeEl) return;

    window.addEventListener('resonote:seek', handleSeek);
    let cancelled = false;

    loadApi()
      .then(() => {
        if (cancelled) return;
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
          if (cancelled) {
            p.destroy();
            return;
          }
          player = p;
          ready = true;
          log.info('Vimeo player ready');
        });
      })
      .catch((err) => {
        log.error('Failed to initialize Vimeo player', err);
        error = true;
      });

    return () => {
      cancelled = true;
      window.removeEventListener('resonote:seek', handleSeek);
      if (player) {
        player.off('play');
        player.off('pause');
        player.off('ended');
        player.off('timeupdate');
        player.off('loaded');
        player.destroy();
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
    title="Vimeo Player"
  ></iframe>
  {#if error}
    <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-surface-1">
      <p class="text-sm text-text-muted">{t('embed.load_failed')}</p>
    </div>
  {:else if !ready}
    <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-1">
      <div class="flex items-center gap-3">
        <svg class="h-8 w-8 text-text-muted" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609-3.268 4.247-6.026 6.37-8.29 6.37-1.409 0-2.578-1.294-3.553-3.881L5.322 11.4C4.603 8.816 3.834 7.522 3.01 7.522c-.179 0-.806.378-1.881 1.132L0 7.197c1.185-1.044 2.351-2.084 3.501-3.128C5.08 2.701 6.266 1.984 7.055 1.91c1.867-.18 3.016 1.1 3.447 3.838.465 2.953.789 4.789.971 5.507.539 2.45 1.131 3.674 1.776 3.674.502 0 1.256-.796 2.265-2.385 1.004-1.589 1.54-2.797 1.612-3.628.144-1.371-.395-2.061-1.614-2.061-.574 0-1.167.121-1.777.391 1.186-3.868 3.434-5.757 6.762-5.637 2.473.06 3.628 1.664 3.48 4.807z"
          />
        </svg>
        <span class="text-sm font-medium text-text-muted">{t('loading')}</span>
      </div>
      <div class="w-48">
        <div class="h-1 overflow-hidden rounded-full bg-surface-3">
          <div
            class="animate-shimmer h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-text-muted/40 to-transparent"
            style="background-size: 400px 100%;"
          ></div>
        </div>
      </div>
    </div>
  {/if}
</div>
