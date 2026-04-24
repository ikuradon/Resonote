import type { StoredEvent } from '@auftakt/core';
import { describe, expect, it } from 'vitest';

import {
  createNegentropyRepairRequestKey,
  createRuntimeRequestKey,
  filterNegentropyEventRefs,
  reconcileNegentropyRepairSubjects,
  sortNegentropyEventRefsAsc
} from './index.js';

function makeEvent(
  id: string,
  created_at: number,
  overrides: Partial<StoredEvent> = {}
): StoredEvent {
  return {
    id,
    pubkey: overrides.pubkey ?? 'pubkey-a',
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [['p', 'pubkey-a']],
    content: overrides.content ?? 'hello',
    created_at
  };
}

describe('@auftakt/core negentropy repair contract', () => {
  it('creates a dedicated request key scope for negentropy repair fetches', () => {
    const filters = [{ kinds: [1], authors: ['pubkey-a'] }];
    const appRequestKey = createRuntimeRequestKey({
      mode: 'backward',
      filters,
      overlay: {
        relays: ['wss://relay-a.test'],
        includeDefaultReadRelays: false
      }
    });

    expect(
      createNegentropyRepairRequestKey({
        filters,
        relayUrl: 'wss://relay-a.test'
      })
    ).not.toBe(appRequestKey);

    expect(
      createNegentropyRepairRequestKey({
        filters,
        relayUrl: 'wss://relay-a.test'
      })
    ).not.toBe(
      createNegentropyRepairRequestKey({
        filters,
        relayUrl: 'wss://relay-a.test',
        scope: 'timeline:repair:fallback'
      })
    );
  });

  it('filters and sorts negentropy refs by canonical created_at/id ordering', () => {
    const lateA = makeEvent('b'.repeat(64), 300, { tags: [['e', 'root-a']] });
    const lateB = makeEvent('a'.repeat(64), 300, { tags: [['e', 'root-a']] });
    const early = makeEvent('c'.repeat(64), 100, { tags: [['e', 'root-b']] });

    expect(sortNegentropyEventRefsAsc([lateA, early, lateB]).map((event) => event.id)).toEqual([
      early.id,
      lateB.id,
      lateA.id
    ]);

    expect(
      filterNegentropyEventRefs(
        [lateA, early, lateB],
        [{ kinds: [1], '#e': ['root-a'], limit: 1 }, { ids: [early.id] }]
      ).map((event) => event.id)
    ).toEqual([early.id, lateA.id]);
  });

  it('emits canonical repairing state for negentropy repairs', () => {
    expect(reconcileNegentropyRepairSubjects(['ev-1', 'ev-1', 'ev-2'])).toEqual([
      {
        subjectId: 'ev-1',
        reason: 'repaired-negentropy',
        state: 'repairing'
      },
      {
        subjectId: 'ev-2',
        reason: 'repaired-negentropy',
        state: 'repairing'
      }
    ]);
  });
});
