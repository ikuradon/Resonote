<script lang="ts">
  import type { ContentId } from '../content/types.js';
  import { SoundCloudProvider } from '../content/soundcloud.js';
  import { updatePlayback } from '../stores/player.svelte.js';
  import { t } from '../i18n/t.js';
  import { createLogger } from '../utils/logger.js';

  const log = createLogger('SoundCloudEmbed');
  const provider = new SoundCloudProvider();

  interface Props {
    contentId: ContentId;
  }

  let { contentId }: Props = $props();

  let iframeEl: HTMLIFrameElement | undefined = $state();
  // eslint-disable-next-line no-undef
  let widget: SC.WidgetInstance | undefined;
  let ready = $state(false);
  let error = $state(false);

  let apiPromise: Promise<void> | undefined;

  function loadApi(): Promise<void> {
    if (apiPromise) return apiPromise;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== 'undefined' && (window as any).SC?.Widget) {
      apiPromise = Promise.resolve();
      return apiPromise;
    }
    log.info('Loading SoundCloud Widget API...');
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://w.soundcloud.com/player/api.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load SoundCloud API'));
      document.head.appendChild(script);
    });
    return apiPromise;
  }

  function handleSeek(e: Event) {
    const detail = (e as CustomEvent<{ positionMs: number }>).detail;
    if (widget && detail.positionMs >= 0) {
      log.debug('Seeking to position', { positionMs: detail.positionMs });
      widget.seekTo(detail.positionMs);
    }
  }

  $effect(() => {
    if (!iframeEl) return;

    window.addEventListener('resonote:seek', handleSeek);

    let cancelled = false;
    let cachedDuration = 0;
    let cachedPaused = true;

    loadApi()
      .then(() => {
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SCWidget = (window as any).SC.Widget;
        const w = SCWidget(iframeEl) as SC.WidgetInstance; // eslint-disable-line no-undef

        w.bind(SCWidget.Events.READY, () => {
          if (cancelled) return;
          widget = w;
          ready = true;
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
        log.error('Failed to initialize SoundCloud widget', err);
        error = true;
      });

    return () => {
      cancelled = true;
      window.removeEventListener('resonote:seek', handleSeek);
      if (widget) {
        const SCWidget = (window as any).SC?.Widget; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (SCWidget?.Events) {
          widget.unbind(SCWidget.Events.READY);
          widget.unbind(SCWidget.Events.PLAY);
          widget.unbind(SCWidget.Events.PAUSE);
          widget.unbind(SCWidget.Events.PLAY_PROGRESS);
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
  <iframe
    bind:this={iframeEl}
    src={provider.embedUrl(contentId)}
    width="100%"
    height="166"
    scrolling="no"
    frameborder="no"
    allow="autoplay"
    title="SoundCloud Player"
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
