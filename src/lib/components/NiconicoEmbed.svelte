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
      <span class="text-sm font-medium text-text-muted">{t('loading')}</span>
    </div>
  {/if}
</div>
