import type { StoredEvent } from '@auftakt/core';
import type { EventStoreLike, QueryRuntime } from '@auftakt/runtime';
import { describe, expect, it, vi } from 'vitest';

import {
  fetchCustomEmojiCategories,
  fetchCustomEmojiSourceDiagnostics,
  fetchCustomEmojiSources
} from './runtime.js';

function event(id: string, overrides: Partial<StoredEvent>): StoredEvent {
  return {
    id,
    pubkey: 'author',
    kind: 1,
    content: '',
    created_at: 1,
    tags: [],
    ...overrides
  };
}

function createEmojiRuntime(input: {
  readonly listEvent: StoredEvent | null;
  readonly cachedSets?: Record<string, StoredEvent | null>;
  readonly fetchedSets?: StoredEvent[];
}) {
  const stored: StoredEvent[] = [];
  const store: EventStoreLike<StoredEvent> = {
    getByPubkeyAndKind: vi.fn(async () => null),
    getManyByPubkeysAndKind: vi.fn(async () => []),
    getByReplaceKey: vi.fn(async (pubkey, kind, dTag) => {
      if (kind !== 30030) return null;
      return input.cachedSets?.[`${pubkey}:${dTag}`] ?? null;
    }),
    getByTagValue: vi.fn(async () => []),
    put: vi.fn(async (storedEvent) => {
      stored.push(storedEvent);
      return true;
    })
  };
  const runtime: QueryRuntime<StoredEvent> = {
    fetchBackwardFirst: vi.fn(async () => input.listEvent),
    fetchBackwardEvents: vi.fn(async () => input.fetchedSets ?? []),
    fetchLatestEvent: vi.fn(async () => null),
    getEventsDB: vi.fn(async () => store)
  };

  return { runtime, store, stored };
}

describe('custom emoji read model', () => {
  it('fetches kind:10030 sources and only requests missing kind:30030 sets', async () => {
    const pubkey = 'user-pubkey';
    const setAuthor = 'set-author';
    const listEvent = event('emoji-list', {
      pubkey,
      kind: 10030,
      tags: [
        ['emoji', 'wave', 'https://example.com/wave.png'],
        ['a', `30030:${setAuthor}:cached`],
        ['a', `30030:${setAuthor}:remote`]
      ]
    });
    const cachedSet = event('cached-set', {
      pubkey: setAuthor,
      kind: 30030,
      tags: [
        ['d', 'cached'],
        ['title', 'Cached'],
        ['emoji', 'cat', 'https://example.com/cat.png']
      ]
    });
    const fetchedSet = event('fetched-set', {
      pubkey: setAuthor,
      kind: 30030,
      tags: [
        ['d', 'remote'],
        ['title', 'Remote'],
        ['emoji', 'spark', 'https://example.com/spark.png']
      ]
    });
    const { runtime, store, stored } = createEmojiRuntime({
      listEvent,
      cachedSets: { [`${setAuthor}:cached`]: cachedSet },
      fetchedSets: [fetchedSet]
    });

    const result = await fetchCustomEmojiSources(runtime, pubkey);

    expect(result).toEqual({ listEvent, setEvents: [cachedSet, fetchedSet] });
    expect(runtime.fetchBackwardFirst).toHaveBeenCalledWith(
      [{ kinds: [10030], authors: [pubkey], limit: 1 }],
      { timeoutMs: 5_000 }
    );
    expect(store.getByReplaceKey).toHaveBeenCalledWith(setAuthor, 30030, 'cached');
    expect(store.getByReplaceKey).toHaveBeenCalledWith(setAuthor, 30030, 'remote');
    expect(runtime.fetchBackwardEvents).toHaveBeenCalledWith(
      [{ kinds: [30030], authors: [setAuthor], '#d': ['remote'] }],
      { timeoutMs: 5_000 }
    );
    expect(stored).toEqual([listEvent, fetchedSet]);
  });

  it('builds inline and referenced NIP-30 emoji categories from NIP-51 lists', async () => {
    const pubkey = 'user-pubkey';
    const setAuthor = 'set-author';
    const listEvent = event('emoji-list', {
      pubkey,
      kind: 10030,
      tags: [
        ['emoji', 'wave', 'https://example.com/wave.png'],
        ['emoji', 'fire-hot', 'https://example.com/fire.png'],
        ['a', `30030:${setAuthor}:remote`]
      ]
    });
    const fetchedSet = event('fetched-set', {
      pubkey: setAuthor,
      kind: 30030,
      tags: [
        ['d', 'remote'],
        ['title', 'Remote'],
        ['emoji', 'spark', 'https://example.com/spark.png'],
        ['emoji', 'bad-name', 'https://example.com/bad.png']
      ]
    });
    const { runtime } = createEmojiRuntime({ listEvent, fetchedSets: [fetchedSet] });

    await expect(fetchCustomEmojiCategories(runtime, pubkey)).resolves.toEqual([
      {
        id: 'custom-inline',
        name: 'Custom',
        emojis: [{ id: 'wave', name: 'wave', skins: [{ src: 'https://example.com/wave.png' }] }]
      },
      {
        id: 'set-fetched-',
        name: 'Remote',
        emojis: [{ id: 'spark', name: 'spark', skins: [{ src: 'https://example.com/spark.png' }] }]
      }
    ]);
  });

  it('returns an empty source set when no kind:10030 list exists', async () => {
    const { runtime } = createEmojiRuntime({ listEvent: null });

    await expect(fetchCustomEmojiSources(runtime, 'missing-user')).resolves.toEqual({
      listEvent: null,
      setEvents: []
    });
    expect(runtime.fetchBackwardEvents).not.toHaveBeenCalled();
  });

  it('returns diagnostics and categories from the same custom emoji source resolution', async () => {
    const pubkey = 'user-pubkey';
    const setAuthor = 'set-author';
    const listEvent = event('emoji-list', {
      pubkey,
      kind: 10030,
      created_at: 300,
      tags: [
        ['emoji', 'wave', 'https://example.com/wave.png'],
        ['emoji', 'bad-name', 'https://example.com/bad.png'],
        ['a', `30030:${setAuthor}:cached`],
        ['a', `30030:${setAuthor}:cached`],
        ['a', '30030:missing-author:missing'],
        ['a', 'not-a-valid-ref']
      ]
    });
    const cachedSet = event('cached-set', {
      pubkey: setAuthor,
      kind: 30030,
      created_at: 400,
      tags: [
        ['d', 'cached'],
        ['title', 'Cached Set'],
        ['emoji', 'spark', 'https://example.com/spark.png'],
        ['emoji', 'spark', 'https://example.com/duplicate.png'],
        ['emoji', 'bad-name', 'https://example.com/bad.png']
      ]
    });
    const { runtime } = createEmojiRuntime({
      listEvent,
      cachedSets: { [`${setAuthor}:cached`]: cachedSet },
      fetchedSets: []
    });

    const result = await fetchCustomEmojiSourceDiagnostics(runtime, pubkey);

    expect(result.categories).toEqual([
      {
        id: 'custom-inline',
        name: 'Custom',
        emojis: [{ id: 'wave', name: 'wave', skins: [{ src: 'https://example.com/wave.png' }] }]
      },
      {
        id: 'set-cached-s',
        name: 'Cached Set',
        emojis: [{ id: 'spark', name: 'spark', skins: [{ src: 'https://example.com/spark.png' }] }]
      }
    ]);
    expect(result.diagnostics.listEvent).toEqual({
      id: 'emoji-list',
      createdAtSec: 300,
      inlineEmojiCount: 1,
      referencedSetRefCount: 2
    });
    expect(result.diagnostics.sets).toEqual([
      {
        ref: `30030:${setAuthor}:cached`,
        id: 'cached-set',
        pubkey: setAuthor,
        dTag: 'cached',
        title: 'Cached Set',
        createdAtSec: 400,
        emojiCount: 1,
        resolvedVia: 'cache'
      }
    ]);
    expect(result.diagnostics.missingRefs).toEqual(['30030:missing-author:missing']);
    expect(result.diagnostics.invalidRefs).toEqual(['not-a-valid-ref']);
    expect(result.diagnostics.sourceMode).toBe('cache-only');
  });

  it('keeps resolved empty emoji sets in diagnostics while categories stay empty', async () => {
    const pubkey = 'user-pubkey';
    const setAuthor = 'set-author';
    const listEvent = event('emoji-list', {
      pubkey,
      kind: 10030,
      tags: [['a', `30030:${setAuthor}:empty`]]
    });
    const emptySet = event('empty-set', {
      pubkey: setAuthor,
      kind: 30030,
      created_at: 500,
      tags: [['d', 'empty']]
    });
    const { runtime } = createEmojiRuntime({
      listEvent,
      cachedSets: { [`${setAuthor}:empty`]: emptySet }
    });

    const result = await fetchCustomEmojiSourceDiagnostics(runtime, pubkey);

    expect(result.categories).toEqual([]);
    expect(result.diagnostics.sets).toEqual([
      {
        ref: `30030:${setAuthor}:empty`,
        id: 'empty-set',
        pubkey: setAuthor,
        dTag: 'empty',
        title: 'empty',
        createdAtSec: 500,
        emojiCount: 0,
        resolvedVia: 'cache'
      }
    ]);
  });
});
