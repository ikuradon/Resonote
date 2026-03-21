// @public — Stable API for route/component/feature consumers
/**
 * Typed Niconico embed bridge.
 * Components import this instead of handling raw postMessage/message protocol details.
 */

const NICONICO_EMBED_ORIGIN = 'https://embed.nicovideo.jp';
const NICONICO_ALLOWED_ORIGINS = [NICONICO_EMBED_ORIGIN, 'http://embed.nicovideo.jp'];

interface NiconicoMessagePayload {
  currentTime?: unknown;
  duration?: unknown;
  playerStatus?: unknown;
}

export type NiconicoPlayerMessage =
  | { type: 'ready' }
  | {
      type: 'metadata';
      currentTimeMs?: number;
      durationMs?: number;
    }
  | {
      type: 'status';
      currentTimeMs?: number;
      durationMs?: number;
      isPaused: boolean;
    }
  | {
      type: 'error';
      data: unknown;
    };

function toMilliseconds(value: unknown): number | undefined {
  return typeof value === 'number' ? value * 1000 : undefined;
}

function parseNiconicoMessage(event: MessageEvent): NiconicoPlayerMessage | null {
  if (!NICONICO_ALLOWED_ORIGINS.includes(event.origin)) return null;

  const eventName = event.data?.eventName;
  const data = (event.data?.data ?? {}) as NiconicoMessagePayload;
  if (typeof eventName !== 'string') return null;

  switch (eventName) {
    case 'loadComplete':
      return { type: 'ready' };
    case 'playerMetadataChange':
      return {
        type: 'metadata',
        currentTimeMs: toMilliseconds(data.currentTime),
        durationMs: toMilliseconds(data.duration)
      };
    case 'playerStatusChange':
      return {
        type: 'status',
        currentTimeMs: toMilliseconds(data.currentTime),
        durationMs: toMilliseconds(data.duration),
        isPaused: data.playerStatus !== 2
      };
    case 'error':
      return { type: 'error', data };
    default:
      return null;
  }
}

export function seekNiconicoPlayer(iframeEl: HTMLIFrameElement, positionMs: number): void {
  iframeEl.contentWindow?.postMessage(
    {
      data: { time: positionMs / 1000 },
      eventName: 'seek',
      playerId: '1',
      sourceConnectorType: 1
    },
    NICONICO_EMBED_ORIGIN
  );
}

export function onNiconicoMessage(
  callback: (message: NiconicoPlayerMessage) => void
): () => void {
  function handler(event: MessageEvent): void {
    const message = parseNiconicoMessage(event);
    if (message) {
      callback(message);
    }
  }

  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
