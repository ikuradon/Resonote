<script lang="ts" module>
  import { createLogger } from '../utils/logger.js';

  const log = createLogger('SpreakerEmbed');

  let apiLoaded = false;

  function ensureApiScript(): void {
    if (apiLoaded) return;
    if (document.querySelector('script[src*="widget.spreaker.com/widgets.js"]')) {
      apiLoaded = true;
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://widget.spreaker.com/widgets.js';
    script.async = true;
    document.head.appendChild(script);
    apiLoaded = true;
  }
</script>

<script lang="ts">
  import type { ContentId } from '../content/types.js';
  import { setContent, updatePlayback } from '../stores/player.svelte.js';
  import { t } from '../i18n/t.js';

  const POLL_INTERVAL_MS = 500;
  const SP_READY_POLL_MS = 200;
  const SP_READY_TIMEOUT_MS = 15000;

  interface Props {
    contentId: ContentId;
  }

  let { contentId }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  // eslint-disable-next-line no-undef
  let widget: SP.SpreakerWidget | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let ready = $state(false);
  let error = $state(false);

  function handleSeek(e: Event) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detail = (e as CustomEvent).detail as any;
    const posMs: number = detail.position ?? detail.positionMs ?? -1;
    if (widget && posMs >= 0) {
      log.debug('Seeking to position', { posMs });
      widget.seek(posMs);
    }
  }

  $effect(() => {
    if (!containerEl) return;

    window.addEventListener('resonote:seek', handleSeek);

    let cancelled = false;
    let spReadyTimer: ReturnType<typeof setInterval> | undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingSP = (window as any).SP;

    if (existingSP?.getWidget) {
      // Re-visit: SP already available, create iframe directly
      const iframe = document.createElement('iframe');
      iframe.src = `https://widget.spreaker.com/player?episode_id=${contentId.id}&theme=dark`;
      iframe.width = '100%';
      iframe.height = '200';
      iframe.setAttribute('frameborder', 'no');
      iframe.setAttribute('scrolling', 'no');
      iframe.allow = 'autoplay';
      // eslint-disable-next-line svelte/no-dom-manipulating -- Direct iframe for SPA re-navigation
      containerEl.appendChild(iframe);

      iframe.addEventListener(
        'load',
        () => {
          if (cancelled) return;
          initWidget(existingSP.getWidget(iframe));
        },
        { once: true }
      );
    } else {
      // First visit: use anchor + widgets.js
      const anchor = document.createElement('a');
      anchor.className = 'spreaker-player';
      anchor.href = `https://www.spreaker.com/episode/${contentId.id}`;
      anchor.setAttribute('data-resource', `episode_id=${contentId.id}`);
      anchor.setAttribute('data-width', '100%');
      anchor.setAttribute('data-height', '200px');
      anchor.setAttribute('data-theme', 'dark');
      // eslint-disable-next-line svelte/no-dom-manipulating -- Spreaker widgets.js requires anchor element injection
      containerEl.appendChild(anchor);

      ensureApiScript();

      const startTime = Date.now();
      spReadyTimer = setInterval(() => {
        if (cancelled) {
          clearInterval(spReadyTimer);
          return;
        }
        if (Date.now() - startTime > SP_READY_TIMEOUT_MS) {
          clearInterval(spReadyTimer);
          log.error('Spreaker SP.getWidget not available after timeout');
          error = true;
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SP = (window as any).SP;
        if (!SP?.getWidget) return;
        const iframe = containerEl?.querySelector('iframe');
        if (!iframe) return;
        clearInterval(spReadyTimer);
        initWidget(SP.getWidget(iframe));
      }, SP_READY_POLL_MS);
    }

    // eslint-disable-next-line no-undef
    function initWidget(w: SP.SpreakerWidget) {
      try {
        widget = w;
        ready = true;
        setContent(contentId);
        log.info('Spreaker widget ready');

        let cachedPaused = true;

        pollTimer = setInterval(() => {
          w.getState((_episode, _state, isPlaying) => {
            if (typeof isPlaying === 'boolean') {
              cachedPaused = !isPlaying;
            }
          });
          // Delay getPosition slightly so getState resolves first
          setTimeout(() => {
            w.getPosition((position, _progress, duration) => {
              updatePlayback(position, duration, cachedPaused);
            });
          }, 50);
        }, POLL_INTERVAL_MS);
      } catch (err) {
        log.error('Failed to initialize Spreaker widget', err);
        error = true;
      }
    }

    return () => {
      cancelled = true;
      if (spReadyTimer) clearInterval(spReadyTimer);
      window.removeEventListener('resonote:seek', handleSeek);
      if (pollTimer !== undefined) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
      widget = undefined;
      ready = false;
      error = false;
      // Clean up generated DOM elements
      while (containerEl?.firstChild) {
        // eslint-disable-next-line svelte/no-dom-manipulating -- Cleanup of injected Spreaker elements
        containerEl.removeChild(containerEl.firstChild);
      }
    };
  });
</script>

<div
  data-testid="spreaker-embed"
  class="animate-fade-in relative w-full overflow-hidden rounded-2xl border border-border-subtle shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
>
  <div bind:this={containerEl}></div>
  {#if error}
    <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-surface-1">
      <p class="text-sm text-text-muted">{t('embed.load_failed')}</p>
    </div>
  {:else if !ready}
    <div
      class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-1"
      style="min-height: 200px"
    >
      <div class="flex items-center gap-3">
        <svg class="h-8 w-8 text-green-500" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4zm0 18a7 7 0 0 0 7-7h-2a5 5 0 0 1-10 0H5a7 7 0 0 0 7 7zm-1 2v2h2v-2h-2z"
          />
        </svg>
        <span class="text-sm font-medium text-text-muted">{t('loading')}</span>
      </div>
      <div class="w-48">
        <div class="h-1 overflow-hidden rounded-full bg-surface-3">
          <div
            class="animate-shimmer h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-green-500/40 to-transparent"
            style="background-size: 400px 100%;"
          ></div>
        </div>
      </div>
    </div>
  {/if}
</div>
