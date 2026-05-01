import { createRuntimeRequestKey, type Filter } from './relay-request.js';
import type { RequestKey, StoredEvent } from './vocabulary.js';

export type NegentropyEventRef = Pick<
  StoredEvent,
  'id' | 'pubkey' | 'created_at' | 'kind' | 'tags'
>;

function sortNegentropyEventRefsDesc<TEvent extends NegentropyEventRef>(
  events: readonly TEvent[]
): TEvent[] {
  return [...events].sort((left, right) => {
    if (right.created_at !== left.created_at) return right.created_at - left.created_at;
    return right.id.localeCompare(left.id);
  });
}

export function sortNegentropyEventRefsAsc<TEvent extends NegentropyEventRef>(
  events: readonly TEvent[]
): TEvent[] {
  return [...events].sort((left, right) => {
    if (left.created_at !== right.created_at) return left.created_at - right.created_at;
    return left.id.localeCompare(right.id);
  });
}

function hasMatchingTag(
  event: Pick<StoredEvent, 'tags'>,
  tagName: string,
  values: readonly string[]
): boolean {
  return event.tags.some(
    (tag) => tag[0] === tagName && typeof tag[1] === 'string' && values.includes(tag[1])
  );
}

export function matchesStoredEventFilter<TEvent extends NegentropyEventRef>(
  event: TEvent,
  filter: Filter
): boolean {
  const ids = Array.isArray(filter.ids)
    ? filter.ids.filter((value): value is string => typeof value === 'string')
    : null;
  if (ids && ids.length > 0 && !ids.includes(event.id)) return false;

  const authors = Array.isArray(filter.authors)
    ? filter.authors.filter((value): value is string => typeof value === 'string')
    : null;
  if (authors && authors.length > 0 && !authors.includes(event.pubkey)) return false;

  const kinds = Array.isArray(filter.kinds)
    ? filter.kinds.filter((value): value is number => typeof value === 'number')
    : null;
  if (kinds && kinds.length > 0 && !kinds.includes(event.kind)) return false;

  if (typeof filter.since === 'number' && event.created_at < filter.since) return false;
  if (typeof filter.until === 'number' && event.created_at > filter.until) return false;

  for (const [key, raw] of Object.entries(filter)) {
    if (!key.startsWith('#') || !Array.isArray(raw) || raw.length === 0) continue;
    const values = raw.filter((value): value is string => typeof value === 'string');
    if (values.length === 0) continue;
    if (!hasMatchingTag(event, key.slice(1), values)) return false;
  }

  return true;
}

function selectFilterMatches<TEvent extends NegentropyEventRef>(
  events: readonly TEvent[],
  filter: Filter
): TEvent[] {
  const matched = events.filter((event) => matchesStoredEventFilter(event, filter));
  const limit =
    typeof filter.limit === 'number' && Number.isFinite(filter.limit)
      ? Math.max(0, Math.trunc(filter.limit))
      : null;

  if (limit === null) return matched;
  if (limit === 0) return [];
  return sortNegentropyEventRefsDesc(matched).slice(0, limit);
}

export function filterNegentropyEventRefs<TEvent extends NegentropyEventRef>(
  events: readonly TEvent[],
  filters: readonly Filter[]
): TEvent[] {
  if (filters.length === 0) return [];

  const matched = new Map<string, TEvent>();
  for (const filter of filters) {
    for (const event of selectFilterMatches(events, filter)) {
      matched.set(event.id, event);
    }
  }

  return sortNegentropyEventRefsAsc([...matched.values()]);
}

export function createNegentropyRepairRequestKey(options: {
  readonly filters: readonly Filter[];
  readonly relayUrl: string;
  readonly scope?: string;
}): RequestKey {
  return createRuntimeRequestKey({
    mode: 'backward',
    filters: options.filters,
    overlay: {
      relays: [options.relayUrl],
      includeDefaultReadRelays: false
    },
    scope: options.scope ?? 'timeline:repair:negentropy'
  });
}
