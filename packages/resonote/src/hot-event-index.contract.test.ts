import { describe, expect, it } from 'vitest';

import { createHotEventIndex } from './hot-event-index.js';

function event(
  id: string,
  overrides: {
    readonly pubkey?: string;
    readonly created_at?: number;
    readonly kind?: number;
    readonly tags?: string[][];
    readonly content?: string;
  } = {}
) {
  return {
    id,
    pubkey: overrides.pubkey ?? 'p1',
    created_at: overrides.created_at ?? 1,
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [],
    content: overrides.content ?? ''
  };
}

describe('HotEventIndex', () => {
  it('indexes by id and tag value', () => {
    const index = createHotEventIndex();
    index.applyVisible(event('e1', { tags: [['e', 'parent']] }));

    expect(index.getById('e1')).toMatchObject({ id: 'e1' });
    expect(index.getByTagValue('e:parent')).toEqual([expect.objectContaining({ id: 'e1' })]);
  });

  it('orders hot kind lookups and applies limit and cursor', () => {
    const index = createHotEventIndex();
    index.applyVisible(event('old', { kind: 1, created_at: 1 }));
    index.applyVisible(event('other-kind', { kind: 2, created_at: 2 }));
    index.applyVisible(event('new', { kind: 1, created_at: 3 }));

    expect(index.getByKind(1, { direction: 'desc', limit: 1 })).toEqual([
      expect.objectContaining({ id: 'new' })
    ]);
    expect(index.getByKind(1, { direction: 'asc', cursor: { created_at: 1, id: 'old' } })).toEqual([
      expect.objectContaining({ id: 'new' })
    ]);
  });

  it('filters hot tag lookups by kind', () => {
    const index = createHotEventIndex();
    index.applyVisible(event('comment', { kind: 1111, tags: [['e', 'root']] }));
    index.applyVisible(event('reaction', { kind: 7, tags: [['e', 'root']] }));

    expect(index.getByTagValue('e:root', 1111)).toEqual([
      expect.objectContaining({ id: 'comment' })
    ]);
  });

  it('keeps hot replaceable heads', () => {
    const index = createHotEventIndex();
    index.applyVisible(event('old-profile', { pubkey: 'alice', kind: 0, created_at: 1 }));
    index.applyVisible(event('new-profile', { pubkey: 'alice', kind: 0, created_at: 2 }));
    index.applyVisible(
      event('old-emoji', {
        pubkey: 'alice',
        kind: 30030,
        created_at: 1,
        tags: [['d', 'emoji']]
      })
    );
    index.applyVisible(
      event('new-emoji', {
        pubkey: 'alice',
        kind: 30030,
        created_at: 3,
        tags: [['d', 'emoji']]
      })
    );

    expect(index.getReplaceableHead('alice', 0)).toMatchObject({ id: 'new-profile' });
    expect(index.getById('old-profile')).toBeNull();
    expect(index.getReplaceableHead('alice', 30030, 'emoji')).toMatchObject({
      id: 'new-emoji'
    });
    expect(index.getById('old-emoji')).toBeNull();
  });

  it('removes deleted events from all hot indexes', () => {
    const index = createHotEventIndex();
    index.applyVisible(
      event('target', {
        pubkey: 'alice',
        kind: 30030,
        created_at: 1,
        tags: [
          ['d', 'emoji'],
          ['e', 'root']
        ]
      })
    );

    index.applyDeletionIndex('target', 'alice');
    index.applyVisible(
      event('target', {
        pubkey: 'alice',
        kind: 30030,
        created_at: 2,
        tags: [
          ['d', 'emoji'],
          ['e', 'root']
        ]
      })
    );

    expect(index.getById('target')).toBeNull();
    expect(index.getByTagValue('e:root')).toEqual([]);
    expect(index.getByKind(30030)).toEqual([]);
    expect(index.getReplaceableHead('alice', 30030, 'emoji')).toBeNull();
  });

  it('sorts hot relay hints newest first', () => {
    const index = createHotEventIndex();
    index.applyRelayHint({
      eventId: 'event',
      relayUrl: 'wss://old.example/',
      source: 'seen',
      lastSeenAt: 1
    });
    index.applyRelayHint({
      eventId: 'event',
      relayUrl: 'wss://new.example/',
      source: 'seen',
      lastSeenAt: 2
    });

    expect(index.getRelayHints('event')).toEqual([
      expect.objectContaining({ relayUrl: 'wss://new.example/' }),
      expect.objectContaining({ relayUrl: 'wss://old.example/' })
    ]);
  });
});
