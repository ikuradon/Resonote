<script lang="ts">
  import type { ContentId } from '../content/types.js';
  import { setContent, updatePlayback } from '../stores/player.svelte.js';
  import { t } from '../i18n/t.js';
  import { createLogger } from '../utils/logger.js';

  const log = createLogger('SoundCloudEmbed');

  interface Props {
    contentId: ContentId;
  }

  let { contentId }: Props = $props();

  let iframeEl: HTMLIFrameElement | undefined = $state();
  // eslint-disable-next-line no-undef
  let widget: SC.WidgetInstance | undefined;
  let ready = $state(false);
  let error = $state(false);
  let embedSrc = $state('');

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detail = (e as CustomEvent).detail as any;
    const posMs: number = detail.position ?? detail.positionMs ?? -1;
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

    fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(trackUrl)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`oEmbed ${res.status}`);
        return res.json();
      })
      .then((data) => {
        // Extract iframe src from oEmbed HTML
        const match = (data.html as string)?.match(/src="([^"]+)"/);
        if (match?.[1]) {
          embedSrc = match[1];
        } else {
          throw new Error('No iframe src in oEmbed response');
        }
      })
      .catch((err) => {
        log.error('Failed to resolve SoundCloud oEmbed', err);
        error = true;
      });
  });

  // Initialize widget once iframe loads
  $effect(() => {
    if (!iframeEl || !embedSrc) return;

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
        log.error('Failed to initialize SoundCloud widget', err);
        error = true;
      });

    return () => {
      cancelled = true;
      window.removeEventListener('resonote:seek', handleSeek);
      if (widget) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SCWidget = (window as any).SC?.Widget;
        if (SCWidget?.Events) {
          widget.unbind(SCWidget.Events.READY);
          widget.unbind(SCWidget.Events.PLAY);
          widget.unbind(SCWidget.Events.PAUSE);
          widget.unbind(SCWidget.Events.PLAY_PROGRESS);
        }
      }
      widget = undefined;
      ready = false;
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
      title="SoundCloud Player"
    ></iframe>
  {/if}
  {#if error}
    <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-surface-1">
      <p class="text-sm text-text-muted">{t('embed.load_failed')}</p>
    </div>
  {:else if !ready}
    <div
      class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-1"
      style="min-height: 166px"
    >
      <div class="flex items-center gap-3">
        <svg class="h-8 w-8 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M11.56 8.87V17h8.76c1.85-.04 2.68-1.32 2.68-2.66 0-1.34-.84-2.64-2.68-2.66-.2-3.17-2.7-4.68-4.93-4.68-1.68 0-2.77.67-3.83 1.87zM7.1 11.74c.52 0 .94.42.94.94v3.94c0 .52-.42.94-.94.94s-.94-.42-.94-.94v-3.94c0-.52.42-.94.94-.94zm-2.35 1.18c.52 0 .94.42.94.94v2.76c0 .52-.42.94-.94.94S3.8 17.14 3.8 16.62v-2.76c0-.52.42-.94.95-.94zM9.45 10.2c.52 0 .94.42.94.94v5.48c0 .52-.42.94-.94.94s-.94-.42-.94-.94v-5.48c0-.52.42-.94.94-.94zM2.4 13.87c.52 0 .94.42.94.94v1.81c0 .52-.42.94-.94.94s-.95-.42-.95-.94v-1.81c0-.52.43-.94.95-.94zM0 14.81c.52 0 .94.42.94.94v.87c0 .52-.42.94-.94.94V14.81z"
          />
        </svg>
        <span class="text-sm font-medium text-text-muted">{t('loading')}</span>
      </div>
      <div class="w-48">
        <div class="h-1 overflow-hidden rounded-full bg-surface-3">
          <div
            class="animate-shimmer h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-orange-500/40 to-transparent"
            style="background-size: 400px 100%;"
          ></div>
        </div>
      </div>
    </div>
  {/if}
</div>
