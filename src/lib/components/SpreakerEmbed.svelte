<script lang="ts" module>
  import { reloadExternalScript } from '$shared/browser/script-loader.js';
  import { createLogger } from '$shared/utils/logger.js';

  const log = createLogger('SpreakerEmbed');

  /**
   * Load widgets.js. On re-invocation (SPA navigation), remove and re-add
   * the script so it re-scans for new .spreaker-player anchors.
   */
  function loadWidgetsScript(): void {
    reloadExternalScript('https://widget.spreaker.com/widgets.js');
  }
</script>

<script lang="ts">
  import { createAsyncReadyTimeout } from '$shared/browser/async-ready-timeout.js';
  import { startIntervalTask, type IntervalTaskHandle } from '$shared/browser/interval-task.js';
  import type { ContentId } from '$shared/content/types.js';
  import { setContent, updatePlayback } from '$shared/browser/player.js';
  import { onSeek } from '../../shared/browser/seek-bridge.js';
  import { t } from '$shared/i18n/t.js';
  import EmbedLoading from './EmbedLoading.svelte';

  const POLL_INTERVAL_MS = 500;
  const SP_READY_POLL_MS = 200;
  const SP_READY_TIMEOUT_MS = 15000;

  interface Props {
    contentId: ContentId;
    openUrl?: string;
  }

  let { contentId, openUrl }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  // eslint-disable-next-line no-undef
  let widget: SP.SpreakerWidget | undefined;
  let pollTimer: IntervalTaskHandle | undefined;
  let ready = $state(false);
  let error = $state(false);

  function handleSeek(posMs: number) {
    if (widget && posMs >= 0) {
      log.debug('Seeking to position', { posMs });
      widget.seek(posMs);
    }
  }

  $effect(() => {
    if (!containerEl) return;

    const cleanupSeek = onSeek(handleSeek);

    let cancelled = false;
    let spReadyTimer: IntervalTaskHandle | undefined;
    let positionSyncDelay: ReturnType<typeof setTimeout> | undefined;

    // Create anchor element for widgets.js to convert to iframe
    const anchor = document.createElement('a');
    anchor.className = 'spreaker-player';
    anchor.href = `https://www.spreaker.com/episode/${contentId.id}`;
    anchor.setAttribute('data-resource', `episode_id=${contentId.id}`);
    anchor.setAttribute('data-width', '100%');
    anchor.setAttribute('data-height', '200px');
    anchor.setAttribute('data-theme', 'dark');
    // eslint-disable-next-line svelte/no-dom-manipulating -- Spreaker widgets.js requires anchor element injection
    containerEl.appendChild(anchor);

    // Re-add script to trigger re-scan of .spreaker-player anchors
    loadWidgetsScript();

    const readyTimeout = createAsyncReadyTimeout({
      timeoutMs: SP_READY_TIMEOUT_MS,
      onTimeout: () => {
        spReadyTimer?.stop();
        log.error('Spreaker SP.getWidget not available after timeout');
        error = true;
      }
    });

    spReadyTimer = startIntervalTask(() => {
      if (cancelled || readyTimeout.hasTimedOut()) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SP = (window as any).SP;
      if (!SP?.getWidget) return;
      const iframe = containerEl?.querySelector('iframe');
      if (!iframe) return;
      if (!readyTimeout.succeed()) return;
      spReadyTimer?.stop();
      initWidget(SP.getWidget(iframe));
    }, SP_READY_POLL_MS);

    // eslint-disable-next-line no-undef
    function initWidget(w: SP.SpreakerWidget) {
      try {
        widget = w;
        ready = true;
        setContent(contentId);
        log.info('Spreaker widget ready');

        let cachedPaused = true;

        pollTimer = startIntervalTask(() => {
          w.getState((_episode, _state, isPlaying) => {
            if (typeof isPlaying === 'boolean') {
              cachedPaused = !isPlaying;
            }
          });
          // Delay getPosition slightly so getState resolves first
          clearTimeout(positionSyncDelay);
          positionSyncDelay = setTimeout(() => {
            positionSyncDelay = undefined;
            w.getPosition((position, _progress, duration) => {
              updatePlayback(position, duration, cachedPaused);
            });
          }, 50);
        }, POLL_INTERVAL_MS);
      } catch (err) {
        readyTimeout.cancel();
        log.error('Failed to initialize Spreaker widget', err);
        error = true;
      }
    }

    return () => {
      cancelled = true;
      readyTimeout.cancel();
      spReadyTimer?.stop();
      cleanupSeek();
      pollTimer?.stop();
      pollTimer = undefined;
      clearTimeout(positionSyncDelay);
      positionSyncDelay = undefined;
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
    <EmbedLoading color="bg-green-500" minHeight="min-h-[200px]">
      {#snippet icon()}
        <svg
          aria-hidden="true"
          class="h-8 w-8 text-green-500"
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
