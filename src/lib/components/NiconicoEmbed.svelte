<script lang="ts" module>
  import { createLogger } from '$shared/utils/logger.js';

  const log = createLogger('NiconicoEmbed');
</script>

<script lang="ts">
  import {
    createAsyncReadyTimeout,
    type AsyncReadyTimeoutHandle
  } from '$shared/browser/async-ready-timeout.js';
  import type { ContentId } from '$shared/content/types.js';
  import {
    onNiconicoMessage,
    seekNiconicoPlayer,
    type NiconicoPlayerMessage
  } from '$shared/browser/niconico-bridge.js';
  import { setContent, updatePlayback } from '$shared/browser/player.js';
  import { onSeek } from '$shared/browser/seek-bridge.js';
  import { t } from '$shared/i18n/t.js';
  import EmbedLoading from './EmbedLoading.svelte';

  interface Props {
    contentId: ContentId;
    openUrl?: string;
  }

  let { contentId, openUrl }: Props = $props();

  let iframeEl: HTMLIFrameElement | undefined = $state();
  let ready = $state(false);
  let error = $state(false);
  let readyTimeout: AsyncReadyTimeoutHandle | undefined;

  function handleSeek(posMs: number) {
    if (!iframeEl) return;
    if (posMs >= 0) {
      log.debug('Seeking to position', { positionMs: posMs });
      seekNiconicoPlayer(iframeEl, posMs);
    }
  }

  function handleMessage(message: NiconicoPlayerMessage) {
    log.debug('Received message', message);

    switch (message.type) {
      case 'ready':
        if (!readyTimeout?.succeed()) return;
        setContent(contentId);
        ready = true;
        break;
      case 'metadata': {
        const { currentTimeMs, durationMs } = message;
        if (currentTimeMs !== undefined && durationMs !== undefined) {
          updatePlayback(currentTimeMs, durationMs, true);
        }
        break;
      }
      case 'status': {
        const { currentTimeMs, durationMs, isPaused } = message;
        if (currentTimeMs !== undefined && durationMs !== undefined) {
          updatePlayback(currentTimeMs, durationMs, isPaused);
        } else {
          updatePlayback(0, 0, isPaused);
        }
        break;
      }
      case 'error':
        readyTimeout?.cancel();
        log.error('Niconico embed error', message.data);
        error = true;
        break;
    }
  }

  $effect(() => {
    if (!iframeEl) return;

    const cleanupSeek = onSeek(handleSeek);
    const cleanupMessages = onNiconicoMessage(handleMessage);

    readyTimeout = createAsyncReadyTimeout({
      timeoutMs: 20000,
      onTimeout: () => {
        log.error('Player initialization timed out');
        error = true;
      }
    });

    return () => {
      readyTimeout?.cancel();
      readyTimeout = undefined;
      cleanupSeek();
      cleanupMessages();
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
    title={t('embed.player_title', { platform: 'Niconico' })}
    class="absolute inset-0 h-full w-full"
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
    <EmbedLoading color="bg-zinc-100">
      {#snippet icon()}
        <svg
          aria-hidden="true"
          class="h-8 w-8 text-zinc-100"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path
            d="M.4787 7.534v12.1279A2.0213 2.0213 0 0 0 2.5 21.6832h2.3888l1.323 2.0948a.4778.4778 0 0 0 .4043.2205.4778.4778 0 0 0 .441-.2205l1.323-2.0948h6.9828l1.323 2.0948a.4778.4778 0 0 0 .441.2205c.1838 0 .3308-.0735.4043-.2205l1.323-2.0948h2.6462a2.0213 2.0213 0 0 0 2.0213-2.0213V7.5339a2.0213 2.0213 0 0 0-2.0213-1.9845h-7.681l4.4468-4.4469L17.1637 0l-5.1452 5.1452L6.8 0 5.6973 1.1025l4.4102 4.4102H2.5367a2.0213 2.0213 0 0 0-2.058 2.058z"
          />
        </svg>
      {/snippet}
    </EmbedLoading>
  {/if}
</div>
