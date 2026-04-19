import type { ProjectionDefinition, StoredEvent } from '@auftakt/core';

export * from './runtime.js';

export const RESONOTE_PLAY_POSITION_SORT = 'resonote:play-position';

export interface ResonoteTimelineEvent extends StoredEvent {
  readonly tags: string[][];
}

export function getResonotePlayPositionMs(event: Pick<ResonoteTimelineEvent, 'tags'>): number {
  const raw = event.tags.find((tag) => tag[0] === 'position')?.[1];
  if (!raw) return 0;
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

export function sortResonoteTimelineByPlayPosition<TEvent extends ResonoteTimelineEvent>(
  events: readonly TEvent[]
): TEvent[] {
  return [...events].sort((left, right) => {
    const positionDelta = getResonotePlayPositionMs(right) - getResonotePlayPositionMs(left);
    if (positionDelta !== 0) return positionDelta;
    if (right.created_at !== left.created_at) return right.created_at - left.created_at;
    return right.id.localeCompare(left.id);
  });
}

export const resonoteTimelineProjection: ProjectionDefinition = {
  name: 'resonote.timeline',
  sourceKinds: [1, 1111, 7, 17],
  sorts: [
    { key: 'created_at', pushdownSupported: true },
    { key: RESONOTE_PLAY_POSITION_SORT, pushdownSupported: true }
  ]
};
