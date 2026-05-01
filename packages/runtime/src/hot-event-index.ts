import type {
  OrderedEventCursor,
  OrderedEventTraversalDirection,
  StoredEvent
} from '@auftakt/core';

export interface RelayHint {
  readonly eventId: string;
  readonly relayUrl: string;
  readonly source: string;
  readonly lastSeenAt: number;
}

export interface HotEventTraversalOptions {
  readonly direction?: OrderedEventTraversalDirection;
  readonly cursor?: OrderedEventCursor | null;
  readonly limit?: number;
}

export interface HotEventIndex {
  applyVisible(event: StoredEvent): void;
  applyDeletionIndex(id: string, pubkey: string): void;
  applyRelayHint(hint: RelayHint): void;
  getById(id: string): StoredEvent | null;
  getByTagValue(value: string, kind?: number): StoredEvent[];
  getByKind(kind: number, options?: HotEventTraversalOptions): StoredEvent[];
  getReplaceableHead(pubkey: string, kind: number, dTag?: string): StoredEvent | null;
  getRelayHints(eventId: string): RelayHint[];
}

export function createHotEventIndex(): HotEventIndex {
  const byId = new Map<string, StoredEvent>();
  const tagIndex = new Map<string, Set<string>>();
  const kindIndex = new Map<number, Set<string>>();
  const replaceableHeads = new Map<string, string>();
  const deletionIndex = new Set<string>();
  const relayHints = new Map<string, Map<string, RelayHint>>();

  function remove(id: string): void {
    const existing = byId.get(id);
    byId.delete(id);

    if (!existing) {
      for (const ids of tagIndex.values()) ids.delete(id);
      for (const ids of kindIndex.values()) ids.delete(id);
      for (const [key, eventId] of replaceableHeads.entries()) {
        if (eventId === id) replaceableHeads.delete(key);
      }
      return;
    }

    for (const tag of existing.tags) {
      if (!tag[0] || !tag[1]) continue;
      tagIndex.get(`${tag[0]}:${tag[1]}`)?.delete(id);
    }
    kindIndex.get(existing.kind)?.delete(id);

    const replaceableKey = getReplaceableKey(existing);
    if (replaceableKey && replaceableHeads.get(replaceableKey) === id) {
      replaceableHeads.delete(replaceableKey);
    }
  }

  function insert(event: StoredEvent): void {
    byId.set(event.id, event);

    const kindIds = kindIndex.get(event.kind) ?? new Set<string>();
    kindIds.add(event.id);
    kindIndex.set(event.kind, kindIds);

    for (const tag of event.tags) {
      if (!tag[0] || !tag[1]) continue;
      const key = `${tag[0]}:${tag[1]}`;
      const ids = tagIndex.get(key) ?? new Set<string>();
      ids.add(event.id);
      tagIndex.set(key, ids);
    }
  }

  return {
    applyVisible(event): void {
      if (deletionIndex.has(`${event.id}:${event.pubkey}`)) return;

      const replaceableKey = getReplaceableKey(event);
      if (replaceableKey) {
        const currentId = replaceableHeads.get(replaceableKey);
        const current = currentId ? byId.get(currentId) : null;
        if (current && current.created_at >= event.created_at) return;
        if (currentId) remove(currentId);
      }

      remove(event.id);
      insert(event);
      if (replaceableKey) replaceableHeads.set(replaceableKey, event.id);
    },
    applyDeletionIndex(id, pubkey): void {
      deletionIndex.add(`${id}:${pubkey}`);
      remove(id);
    },
    applyRelayHint(hint): void {
      const byEvent = relayHints.get(hint.eventId) ?? new Map<string, RelayHint>();
      byEvent.set(`${hint.relayUrl}:${hint.source}`, hint);
      relayHints.set(hint.eventId, byEvent);
    },
    getById(id): StoredEvent | null {
      return byId.get(id) ?? null;
    },
    getByTagValue(value, kind): StoredEvent[] {
      return [...(tagIndex.get(value) ?? [])]
        .flatMap((id) => byId.get(id) ?? [])
        .filter((event) => kind === undefined || event.kind === kind);
    },
    getByKind(kind, options = {}): StoredEvent[] {
      const direction = options.direction ?? 'asc';
      const limit = normalizeLimit(options.limit);
      if (limit === 0) return [];

      return [...(kindIndex.get(kind) ?? [])]
        .flatMap((id) => byId.get(id) ?? [])
        .filter((event) => isBeyondHotCursor(event, options.cursor, direction))
        .sort((left, right) => compareHotEvents(left, right, direction))
        .slice(0, limit);
    },
    getReplaceableHead(pubkey, kind, dTag = ''): StoredEvent | null {
      const id = replaceableHeads.get(`${pubkey}:${kind}:${dTag}`);
      return id ? (byId.get(id) ?? null) : null;
    },
    getRelayHints(eventId): RelayHint[] {
      return [...(relayHints.get(eventId)?.values() ?? [])].sort(
        (left, right) => right.lastSeenAt - left.lastSeenAt
      );
    }
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.floor(limit);
}

function isBeyondHotCursor(
  event: Pick<StoredEvent, 'created_at' | 'id'>,
  cursor: OrderedEventCursor | null | undefined,
  direction: OrderedEventTraversalDirection
): boolean {
  if (!cursor) return true;

  if (direction === 'desc') {
    if (event.created_at !== cursor.created_at) return event.created_at < cursor.created_at;
    return event.id < cursor.id;
  }

  if (event.created_at !== cursor.created_at) return event.created_at > cursor.created_at;
  return event.id > cursor.id;
}

function compareHotEvents(
  left: Pick<StoredEvent, 'created_at' | 'id'>,
  right: Pick<StoredEvent, 'created_at' | 'id'>,
  direction: OrderedEventTraversalDirection
): number {
  const createdAtDelta =
    direction === 'desc' ? right.created_at - left.created_at : left.created_at - right.created_at;
  if (createdAtDelta !== 0) return createdAtDelta;
  return direction === 'desc' ? right.id.localeCompare(left.id) : left.id.localeCompare(right.id);
}

function getReplaceableKey(event: Pick<StoredEvent, 'pubkey' | 'kind' | 'tags'>): string | null {
  if (isReplaceable(event.kind)) return `${event.pubkey}:${event.kind}:`;
  if (isParameterizedReplaceable(event.kind)) {
    return `${event.pubkey}:${event.kind}:${getDTag(event.tags)}`;
  }
  return null;
}

function isReplaceable(kind: number): boolean {
  return kind === 0 || kind === 3 || (kind >= 10000 && kind <= 19999);
}

function isParameterizedReplaceable(kind: number): boolean {
  return kind >= 30000 && kind <= 39999;
}

function getDTag(tags: readonly string[][]): string {
  return tags.find((tag) => tag[0] === 'd')?.[1] ?? '';
}
