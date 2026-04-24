import type { StoredEvent } from '@auftakt/core';

export interface RelayHint {
  readonly eventId: string;
  readonly relayUrl: string;
  readonly source: string;
  readonly lastSeenAt: number;
}

export interface HotEventIndex {
  applyVisible(event: StoredEvent): void;
  applyDeletionIndex(id: string, pubkey: string): void;
  applyRelayHint(hint: RelayHint): void;
  getById(id: string): StoredEvent | null;
  getByTagValue(value: string): StoredEvent[];
  getRelayHints(eventId: string): RelayHint[];
}

export function createHotEventIndex(): HotEventIndex {
  const byId = new Map<string, StoredEvent>();
  const tagIndex = new Map<string, Set<string>>();
  const deletionIndex = new Set<string>();
  const relayHints = new Map<string, Map<string, RelayHint>>();

  function remove(id: string): void {
    byId.delete(id);
    for (const ids of tagIndex.values()) ids.delete(id);
  }

  return {
    applyVisible(event): void {
      if (deletionIndex.has(`${event.id}:${event.pubkey}`)) return;
      byId.set(event.id, event);
      for (const tag of event.tags) {
        if (!tag[0] || !tag[1]) continue;
        const key = `${tag[0]}:${tag[1]}`;
        const ids = tagIndex.get(key) ?? new Set<string>();
        ids.add(event.id);
        tagIndex.set(key, ids);
      }
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
    getByTagValue(value): StoredEvent[] {
      return [...(tagIndex.get(value) ?? [])].flatMap((id) => byId.get(id) ?? []);
    },
    getRelayHints(eventId): RelayHint[] {
      return [...(relayHints.get(eventId)?.values() ?? [])].sort(
        (left, right) => right.lastSeenAt - left.lastSeenAt
      );
    }
  };
}
