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
  import EmbedLoading from './EmbedLoading.svelte';

  interface Props {
    contentId: ContentId;
    openUrl?: string;
  }

  let { contentId, openUrl }: Props = $props();

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
      widget.seekTo(posMs / 1000); // PB.seekTo takes seconds despite docs saying ms
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

    fetch(`/api/podbean/resolve?url=${encodeURIComponent(sourceUrl)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`resolve ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const d = data as { embedSrc?: string; embedId?: string };
        if (d.embedSrc) {
          embedSrc = d.embedSrc;
        } else if (d.embedId) {
          embedSrc = `https://www.podbean.com/player-v2/?i=${d.embedId}`;
        } else {
          throw new Error('No embed URL resolved');
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

    const readyTimeout = setTimeout(() => {
      if (!ready && !error) {
        log.error('Player initialization timed out');
        error = true;
      }
    }, 20000);

    // Wait for both iframe load and API script
    const initWidget = () => {
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
            clearTimeout(readyTimeout);
            log.info('Podbean widget ready');
          });

          pb.bind('PB.Widget.Events.PLAY', () => {
            cachedPaused = false;
            // getDuration returns NaN before playback starts
            if (!cachedDuration || isNaN(cachedDuration)) {
              pb.getDuration((d) => {
                if (typeof d === 'number' && !isNaN(d) && d > 0) {
                  cachedDuration = d;
                }
              });
            }
          });

          pb.bind('PB.Widget.Events.PAUSE', () => {
            cachedPaused = true;
          });

          pb.bind('PB.Widget.Events.PLAY_PROGRESS', (e?: unknown) => {
            const ev = e as {
              data?: { currentPosition?: number; relativePosition?: number };
            };
            const pos = ev?.data?.currentPosition;
            const rel = ev?.data?.relativePosition;
            if (pos !== undefined) {
              // Derive duration from currentPosition / relativePosition
              if (rel && rel > 0) {
                cachedDuration = pos / rel;
              }
              updatePlayback(pos * 1000, cachedDuration * 1000, cachedPaused);
            }
          });
        })
        .catch((err) => {
          log.error('Failed to initialize Podbean widget', err);
          error = true;
        });
    };

    // If iframe is already loaded, init immediately; otherwise wait for load event
    if (iframeEl.contentDocument?.readyState === 'complete') {
      initWidget();
    } else {
      iframeEl.addEventListener('load', initWidget, { once: true });
    }

    return () => {
      cancelled = true;
      clearTimeout(readyTimeout);
      iframeEl?.removeEventListener('load', initWidget);
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
      id="pb-player"
      data-name="pb-iframe-player"
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
    <EmbedLoading color="bg-[#3db56a]">
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
