import type { StoredEvent } from './vocabulary.js';

export interface TimelineWindow<TEvent extends StoredEvent> {
  readonly items: readonly TEvent[];
  readonly nextCursor: number | null;
}

export function sortTimelineByCreatedAtDesc<TEvent extends StoredEvent>(
  events: readonly TEvent[]
): TEvent[] {
  return [...events].sort((left, right) => {
    if (right.created_at !== left.created_at) return right.created_at - left.created_at;
    return right.id.localeCompare(left.id);
  });
}

export function mergeTimelineEvents<TEvent extends StoredEvent>(
  current: readonly TEvent[],
  incoming: readonly TEvent[]
): TEvent[] {
  const merged = new Map<string, TEvent>();
  for (const event of current) merged.set(event.id, event);
  for (const event of incoming) merged.set(event.id, event);
  return sortTimelineByCreatedAtDesc([...merged.values()]);
}

export function paginateTimelineWindow<TEvent extends StoredEvent>(
  events: readonly TEvent[],
  limit: number
): TimelineWindow<TEvent> {
  const items = sortTimelineByCreatedAtDesc(events).slice(0, limit);
  const nextCursor = items.length === limit ? (items.at(-1)?.created_at ?? null) : null;
  return { items, nextCursor };
}
