import type { StoredEvent } from '@auftakt/core';

export interface HotEventIndex {
  applyVisible(event: StoredEvent): void;
  applyDeletionIndex(id: string, pubkey: string): void;
  getById(id: string): StoredEvent | null;
  getByTagValue(value: string): StoredEvent[];
}

export function createHotEventIndex(): HotEventIndex {
  const byId = new Map<string, StoredEvent>();
  const tagIndex = new Map<string, Set<string>>();
  const deletionIndex = new Set<string>();

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
    getById(id): StoredEvent | null {
      return byId.get(id) ?? null;
    },
    getByTagValue(value): StoredEvent[] {
      return [...(tagIndex.get(value) ?? [])].flatMap((id) => byId.get(id) ?? []);
    }
  };
}
