import type { RelaySelectionPolicyOptions, StoredEvent } from '@auftakt/core';
import { describe, expect, it, vi } from 'vitest';

import {
  buildPublishRelaySendOptions,
  buildReadRelayOverlay,
  DEFAULT_RELAY_SELECTION_POLICY
} from './relay-selection-runtime.js';

const policy: RelaySelectionPolicyOptions = {
  ...DEFAULT_RELAY_SELECTION_POLICY,
  maxReadRelays: 4,
  maxWriteRelays: 4,
  maxTemporaryRelays: 2,
  maxAudienceRelays: 2
};

function event(overrides: Partial<StoredEvent>): StoredEvent {
  return {
    id: overrides.id ?? 'event-id',
    pubkey: overrides.pubkey ?? 'author',
    created_at: overrides.created_at ?? 1,
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [],
    content: overrides.content ?? ''
  };
}

function createRuntimeFixture() {
  const getRelayHints = vi.fn(async (eventId: string) => {
    if (eventId === 'target') {
      return [
        {
          eventId: 'target',
          relayUrl: 'wss://durable.example',
          source: 'seen' as const,
          lastSeenAt: 1
        }
      ];
    }
    if (eventId === 'addressable-target') {
      return [
        {
          eventId: 'addressable-target',
          relayUrl: 'wss://addressable-durable.example',
          source: 'seen' as const,
          lastSeenAt: 2
        }
      ];
    }
    return [];
  });
  const getByPubkeyAndKind = vi.fn(async (pubkey: string, kind: number) =>
    kind === 10002 && pubkey === 'alice'
      ? event({
          pubkey,
          kind,
          tags: [
            ['r', 'wss://alice-read.example', 'read'],
            ['r', 'wss://alice-write.example', 'write']
          ]
        })
      : null
  );
  const getByReplaceKey = vi.fn(async (pubkey: string, kind: number, dTag: string) =>
    pubkey === 'bob' && kind === 30023 && dTag === 'article'
      ? event({
          id: 'addressable-target',
          pubkey,
          kind,
          tags: [['d', dTag]],
          content: 'addressable article'
        })
      : null
  );

  return {
    async getDefaultRelays() {
      return ['wss://default.example'];
    },
    async getEventsDB() {
      return {
        getRelayHints,
        getByPubkeyAndKind,
        getByReplaceKey
      };
    },
    getRelayHints,
    getByPubkeyAndKind,
    getByReplaceKey
  };
}

describe('@auftakt/runtime relay selection runtime', () => {
  it('builds read overlays from defaults, temporary hints, durable hints, and author relay lists', async () => {
    const runtime = createRuntimeFixture();

    const overlay = await buildReadRelayOverlay(runtime, {
      intent: 'read',
      filters: [{ ids: ['target'], authors: ['alice'] }],
      temporaryRelays: ['wss://temporary.example'],
      policy
    });

    expect(runtime.getRelayHints).toHaveBeenCalledWith('target');
    expect(runtime.getByPubkeyAndKind).toHaveBeenCalledWith('alice', 10002);
    expect(overlay).toEqual({
      relays: [
        'wss://temporary.example/',
        'wss://default.example/',
        'wss://durable.example/',
        'wss://alice-write.example/'
      ],
      includeDefaultReadRelays: false
    });
  });

  it('builds publish options from author write relays and audience hints', async () => {
    const runtime = createRuntimeFixture();

    const options = await buildPublishRelaySendOptions(runtime, {
      event: event({
        id: 'reply',
        pubkey: 'alice',
        kind: 1111,
        tags: [
          ['e', 'target', 'wss://explicit-target.example'],
          ['p', 'alice']
        ]
      }),
      policy
    });

    expect(options).toEqual({
      on: {
        relays: [
          'wss://alice-write.example/',
          'wss://default.example/',
          'wss://durable.example/',
          'wss://explicit-target.example/'
        ],
        defaultWriteRelays: false
      }
    });
  });

  it('builds publish options from durable hints for local addressable targets', async () => {
    const runtime = createRuntimeFixture();

    const options = await buildPublishRelaySendOptions(runtime, {
      event: event({
        id: 'reply-to-local-addressable',
        pubkey: 'alice',
        kind: 1111,
        tags: [['a', '30023:bob:article']]
      }),
      policy
    });

    expect(runtime.getByReplaceKey).toHaveBeenCalledWith('bob', 30023, 'article');
    expect(runtime.getRelayHints).toHaveBeenCalledWith('addressable-target');
    expect(options).toEqual({
      on: {
        relays: [
          'wss://alice-write.example/',
          'wss://default.example/',
          'wss://addressable-durable.example/'
        ],
        defaultWriteRelays: false
      }
    });
  });

  it('default-only policy suppresses broader outbox publish candidates', async () => {
    const runtime = createRuntimeFixture();

    const options = await buildPublishRelaySendOptions(runtime, {
      event: event({
        id: 'broad-publish',
        pubkey: 'alice',
        kind: 1111,
        tags: [
          ['e', 'target', 'wss://explicit-target.example'],
          ['p', 'bob', 'wss://explicit-pubkey.example'],
          ['a', '30023:bob:article', 'wss://addressable-explicit.example']
        ]
      }),
      policy: { strategy: 'default-only' }
    });

    expect(options).toEqual({
      on: {
        relays: ['wss://default.example/'],
        defaultWriteRelays: false
      }
    });
  });

  it('uses conservative outbox as the runtime default policy', () => {
    expect(DEFAULT_RELAY_SELECTION_POLICY).toMatchObject({
      strategy: 'conservative-outbox',
      maxReadRelays: 4,
      maxWriteRelays: 4,
      maxTemporaryRelays: 2,
      maxAudienceRelays: 2
    });
  });
});
