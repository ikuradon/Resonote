<script lang="ts">
  import type { ContentId } from '../content/types.js';
  import { MixcloudProvider } from '../content/mixcloud.js';
  import { updatePlayback } from '../stores/player.svelte.js';
  import { t } from '../i18n/t.js';
  import { createLogger } from '../utils/logger.js';
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

  let apiPromise: Promise<void> | undefined;

  function loadApi(): Promise<void> {
    if (apiPromise) return apiPromise;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== 'undefined' && (window as any).Mixcloud?.PlayerWidget) {
      apiPromise = Promise.resolve();
      return apiPromise;
    }
    log.info('Loading Mixcloud Widget API...');
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://widget.mixcloud.com/media/js/widgetApi.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Mixcloud API'));
      document.head.appendChild(script);
    });
    return apiPromise;
  }

  function handleSeek(e: Event) {
    const detail = (e as CustomEvent<{ positionMs: number }>).detail;
    if (widget && detail.positionMs >= 0) {
      log.debug('Seeking to position', { positionMs: detail.positionMs });
      widget.seek(detail.positionMs / 1000);
    }
  }

  $effect(() => {
    if (!iframeEl) return;

    window.addEventListener('resonote:seek', handleSeek);

    let cancelled = false;
    let cachedPaused = true;
    let progressHandler: ((position: number, duration: number) => void) | undefined;
    let playHandler: (() => void) | undefined;
    let pauseHandler: (() => void) | undefined;

    const readyTimeout = setTimeout(() => {
      if (!ready && !error) {
        log.error('Player initialization timed out');
        error = true;
      }
    }, 15000);

    loadApi()
      .then(() => {
        if (cancelled) return;
        // eslint-disable-next-line no-undef
        const w = Mixcloud.PlayerWidget(iframeEl!);

        return w.ready.then(() => {
          if (cancelled) return;
          widget = w;
          ready = true;
          clearTimeout(readyTimeout);
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
        log.error('Failed to initialize Mixcloud widget', err);
        error = true;
      });

    return () => {
      cancelled = true;
      clearTimeout(readyTimeout);
      window.removeEventListener('resonote:seek', handleSeek);
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
