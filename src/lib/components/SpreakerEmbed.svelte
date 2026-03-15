<script lang="ts" module>
  import { createLogger } from '../utils/logger.js';

  const log = createLogger('SpreakerEmbed');

  let apiPromise: Promise<void> | undefined;

  function loadApi(): Promise<void> {
    if (apiPromise) return apiPromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== 'undefined' && (window as any).SP?.getWidget) {
      apiPromise = Promise.resolve();
      return apiPromise;
    }

    log.info('Loading Spreaker Widget API...');
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://widget.spreaker.com/widgets.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Spreaker API'));
      document.head.appendChild(script);
    });

    return apiPromise;
  }
</script>

<script lang="ts">
  import type { ContentId } from '../content/types.js';
  import { SpreakerProvider } from '../content/spreaker.js';
  import { updatePlayback } from '../stores/player.svelte.js';
  import { t } from '../i18n/t.js';

  const POLL_INTERVAL_MS = 500;
  const provider = new SpreakerProvider();

  interface Props {
    contentId: ContentId;
  }

  let { contentId }: Props = $props();

  let iframeEl: HTMLIFrameElement | undefined = $state();
  // eslint-disable-next-line no-undef
  let widget: SP.SpreakerWidget | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let ready = $state(false);
  let error = $state(false);

  function handleSeek(e: Event) {
    const detail = (e as CustomEvent<{ positionMs: number }>).detail;
    if (widget && detail.positionMs >= 0) {
      log.debug('Seeking to position', { positionMs: detail.positionMs });
      widget.seek(detail.positionMs);
    }
  }

  $effect(() => {
    if (!iframeEl) return;

    window.addEventListener('resonote:seek', handleSeek);

    let cancelled = false;

    const iframe = iframeEl;

    const onIframeLoad = () => {
      loadApi()
        .then(() => {
          if (cancelled) return;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = (window as any).SP.getWidget(iframe) as SP.SpreakerWidget; // eslint-disable-line no-undef
          widget = w;
          ready = true;
          log.info('Spreaker widget ready');

          let cachedPaused = true;

          pollTimer = setInterval(() => {
            w.getPosition((position, _progress, duration) => {
              updatePlayback(position, duration, cachedPaused);
            });
            w.getState((_episode, _state, isPlaying) => {
              cachedPaused = !isPlaying;
            });
          }, POLL_INTERVAL_MS);
        })
        .catch((err) => {
          log.error('Failed to initialize Spreaker widget', err);
          error = true;
        });
    };

    iframe.addEventListener('load', onIframeLoad);

    return () => {
      cancelled = true;
      window.removeEventListener('resonote:seek', handleSeek);
      iframe.removeEventListener('load', onIframeLoad);
      if (pollTimer !== undefined) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
      widget = undefined;
      ready = false;
      error = false;
    };
  });
</script>

<div
  data-testid="spreaker-embed"
  class="animate-fade-in relative w-full overflow-hidden rounded-2xl border border-border-subtle shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
>
  <iframe
    bind:this={iframeEl}
    src={provider.embedUrl(contentId)}
    width="100%"
    height="200"
    frameborder="no"
    scrolling="no"
    allow="autoplay"
    title="Spreaker Player"
  ></iframe>
  {#if error}
    <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-surface-1">
      <p class="text-sm text-text-muted">{t('embed.load_failed')}</p>
    </div>
  {:else if !ready}
    <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-1">
      <span class="text-sm font-medium text-text-muted">{t('loading')}</span>
    </div>
  {/if}
</div>
