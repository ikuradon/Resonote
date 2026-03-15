<script lang="ts" module>
  import { createLogger } from '../utils/logger.js';

  const log = createLogger('NiconicoEmbed');
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
  let ready = $state(false);
  let error = $state(false);

  const NICONICO_ORIGINS = ['https://embed.nicovideo.jp', 'http://embed.nicovideo.jp'];

  function sendCommand(
    iframeEl: HTMLIFrameElement,
    command: string,
    data: Record<string, unknown> = {}
  ) {
    iframeEl.contentWindow?.postMessage(
      { ...data, eventName: command, sourceConnectorType: 1, playerId: '1' },
      'https://embed.nicovideo.jp'
    );
  }

  function handleSeek(e: Event) {
    if (!iframeEl) return;
    const detail = (e as CustomEvent<{ positionMs?: number; position?: number }>).detail;
    const positionMs = detail.positionMs ?? detail.position;
    if (positionMs !== undefined && positionMs >= 0) {
      log.debug('Seeking to position', { positionMs });
      sendCommand(iframeEl, 'seek', { data: { time: positionMs / 1000 } });
    }
  }

  function handleMessage(e: MessageEvent) {
    if (!NICONICO_ORIGINS.includes(e.origin)) return;

    const { eventName, data } = e.data ?? {};
    log.debug('Received message', { eventName, data });

    switch (eventName) {
      case 'loadComplete':
        setContent(contentId);
        ready = true;
        break;
      case 'playerMetadataChange': {
        const currentTimeMs = data?.currentTime !== undefined ? data.currentTime * 1000 : undefined;
        const durationMs = data?.duration !== undefined ? data.duration * 1000 : undefined;
        if (currentTimeMs !== undefined && durationMs !== undefined) {
          updatePlayback(currentTimeMs, durationMs, true);
        }
        break;
      }
      case 'playerStatusChange': {
        // 2 = playing, 3 = paused, 4 = ended
        const status = data?.playerStatus;
        const isPaused = status !== 2;
        if (data?.currentTime !== undefined && data?.duration !== undefined) {
          updatePlayback(data.currentTime * 1000, data.duration * 1000, isPaused);
        } else {
          updatePlayback(0, 0, isPaused);
        }
        break;
      }
      case 'error':
        log.error('Niconico embed error', data);
        error = true;
        break;
    }
  }

  $effect(() => {
    if (!iframeEl) return;

    window.addEventListener('resonote:seek', handleSeek);
    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('resonote:seek', handleSeek);
      window.removeEventListener('message', handleMessage);
      ready = false;
      error = false;
    };
  });
</script>

<div
  data-testid="niconico-embed"
  class="animate-fade-in relative w-full overflow-hidden rounded-2xl border border-border-subtle shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
  style="padding-bottom: 56.25%;"
>
  <iframe
    bind:this={iframeEl}
    src={`https://embed.nicovideo.jp/watch/${contentId.id}?jsapi=1&playerId=1`}
    width="100%"
    height="100%"
    frameborder="no"
    scrolling="no"
    allow="autoplay"
    allowfullscreen
    title="Niconico Player"
    class="absolute inset-0 h-full w-full"
  ></iframe>
  {#if error}
    <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-surface-1">
      <p class="text-sm text-text-muted">{t('embed.load_failed')}</p>
    </div>
  {:else if !ready}
    <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-1">
      <div class="flex items-center gap-3">
        <svg class="h-8 w-8 text-zinc-100" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M.79 6.41L.67 6.56C-.2 7.7-.23 9.37.74 10.57L9.43 21.16C10.26 22.19 11.89 22.19 12.72 21.16L21.42 10.57C22.39 9.37 22.35 7.7 21.48 6.56L21.37 6.41C20.38 5.12 18.4 5.13 17.42 6.42L11.08 14.79L4.74 6.42C3.75 5.13 1.78 5.12 .79 6.41Z"
          />
        </svg>
        <span class="text-sm font-medium text-text-muted">{t('loading')}</span>
      </div>
      <div class="w-48">
        <div class="h-1 overflow-hidden rounded-full bg-surface-3">
          <div
            class="animate-shimmer h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-zinc-100/40 to-transparent"
            style="background-size: 400px 100%;"
          ></div>
        </div>
      </div>
    </div>
  {/if}
</div>
