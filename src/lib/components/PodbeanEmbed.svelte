<script lang="ts" module>
  import { createLogger } from '../utils/logger.js';

  const log = createLogger('PodbeanEmbed');

  let apiLoaded = false;

  function loadPbApi(): Promise<void> {
    if (apiLoaded) return Promise.resolve();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== 'undefined' && (window as any).PB) {
      apiLoaded = true;
      return Promise.resolve();
    }
    log.info('Loading Podbean Widget API...');
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://pbcdn1.podbean.com/fs1/player/api.js';
      script.async = true;
      script.onload = () => {
        apiLoaded = true;
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load Podbean API'));
      document.head.appendChild(script);
    });
  }
</script>

<script lang="ts">
  import type { ContentId } from '../content/types.js';
  import { setContent, updatePlayback } from '../stores/player.svelte.js';
  import { t } from '../i18n/t.js';

  interface Props {
    contentId: ContentId;
  }

  let { contentId }: Props = $props();

  let iframeEl: HTMLIFrameElement | undefined = $state();
  // eslint-disable-next-line no-undef
  let widget: PB | undefined;
  let ready = $state(false);
  let error = $state(false);
  let embedSrc = $state('');

  function handleSeek(e: Event) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detail = (e as CustomEvent).detail as any;
    const posMs: number = detail.position ?? detail.positionMs ?? -1;
    if (widget && posMs >= 0) {
      log.debug('Seeking to position', { posMs });
      widget.seekTo(posMs);
    }
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

    fetch(`https://api.podbean.com/v1/oembed?format=json&url=${encodeURIComponent(sourceUrl)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`oEmbed ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const match = (data.html as string)?.match(/src="([^"]+)"/);
        if (match?.[1]) {
          embedSrc = match[1];
        } else {
          throw new Error('No iframe src in oEmbed response');
        }
      })
      .catch((err) => {
        log.error('Failed to resolve Podbean oEmbed', err);
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

    loadPbApi()
      .then(() => {
        if (cancelled || !iframeEl) return;

        // eslint-disable-next-line no-undef, @typescript-eslint/no-explicit-any
        const pb = new (window as any).PB(iframeEl) as PB;
        widget = pb;

        pb.bind('PB.Widget.Events.READY', () => {
          if (cancelled) return;
          setContent(contentId);
          ready = true;
          log.info('Podbean widget ready');
          pb.getDuration((d: number) => {
            cachedDuration = d;
          });
        });

        pb.bind('PB.Widget.Events.PLAY', () => {
          cachedPaused = false;
        });

        pb.bind('PB.Widget.Events.PAUSE', () => {
          cachedPaused = true;
        });

        pb.bind('PB.Widget.Events.PLAY_PROGRESS', (data?: unknown) => {
          const d = data as { currentPosition: number };
          updatePlayback(d.currentPosition * 1000, cachedDuration * 1000, cachedPaused);
        });
      })
      .catch((err) => {
        log.error('Failed to initialize Podbean widget', err);
        error = true;
      });

    return () => {
      cancelled = true;
      window.removeEventListener('resonote:seek', handleSeek);
      if (widget) {
        widget.unbind('PB.Widget.Events.READY');
        widget.unbind('PB.Widget.Events.PLAY');
        widget.unbind('PB.Widget.Events.PAUSE');
        widget.unbind('PB.Widget.Events.PLAY_PROGRESS');
      }
      widget = undefined;
      ready = false;
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
      src={embedSrc}
      width="100%"
      height="150"
      scrolling="no"
      frameborder="no"
      allow="autoplay"
      title="Podbean Player"
    ></iframe>
  {/if}
  {#if error}
    <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-surface-1">
      <p class="text-sm text-text-muted">{t('embed.load_failed')}</p>
    </div>
  {:else if !ready}
    <div
      class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-1"
      style="min-height: 150px"
    >
      <div class="flex items-center gap-3">
        <svg class="h-8 w-8" style="color: #3db56a;" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4zm0 18a7 7 0 0 0 7-7h-2a5 5 0 0 1-10 0H5a7 7 0 0 0 7 7zm-1 2v2h2v-2h-2z"
          />
        </svg>
        <span class="text-sm font-medium text-text-muted">{t('loading')}</span>
      </div>
      <div class="w-48">
        <div class="h-1 overflow-hidden rounded-full bg-surface-3">
          <div
            class="animate-shimmer h-full w-1/3 rounded-full bg-gradient-to-r from-transparent to-transparent"
            style="background-size: 400px 100%; background-image: linear-gradient(to right, transparent, #3db56a66, transparent);"
          ></div>
        </div>
      </div>
    </div>
  {/if}
</div>
