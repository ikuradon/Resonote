import { describe, expect, it } from 'vitest';

import {
  normalizeRelaySelectionPolicy,
  parseNip65RelayListTags,
  relayListEntriesToSelectionCandidates,
  type RelaySelectionPolicyOptions
} from './index.js';

describe('relay selection NIP-65 parsing', () => {
  it('parses NIP-65 r tags into read and write relay entries', () => {
    expect(
      parseNip65RelayListTags([
        ['r', 'wss://read.example', 'read'],
        ['r', 'wss://write.example', 'write'],
        ['r', 'wss://both.example'],
        ['r', 'wss://ignored.example', 'invalid-marker'],
        ['p', 'not-a-relay']
      ])
    ).toEqual([
      { relay: 'wss://read.example/', read: true, write: false },
      { relay: 'wss://write.example/', read: false, write: true },
      { relay: 'wss://both.example/', read: true, write: true },
      { relay: 'wss://ignored.example/', read: true, write: true }
    ]);
  });

  it('ignores malformed, non-websocket, and duplicate relay entries', () => {
    expect(
      parseNip65RelayListTags([
        ['r'],
        ['r', 'https://relay.example'],
        ['r', 'notaurl'],
        ['r', 'wss://relay.example', 'read'],
        ['r', 'wss://relay.example/', 'write']
      ])
    ).toEqual([{ relay: 'wss://relay.example/', read: true, write: true }]);
  });

  it('turns relay-list entries into read and write selection candidates', () => {
    const candidates = relayListEntriesToSelectionCandidates(
      parseNip65RelayListTags([
        ['r', 'wss://read.example', 'read'],
        ['r', 'wss://write.example', 'write'],
        ['r', 'wss://both.example']
      ])
    );

    expect(candidates).toEqual([
      { relay: 'wss://read.example/', source: 'nip65-read', role: 'read' },
      { relay: 'wss://write.example/', source: 'nip65-write', role: 'write' },
      { relay: 'wss://both.example/', source: 'nip65-read', role: 'read' },
      { relay: 'wss://both.example/', source: 'nip65-write', role: 'write' }
    ]);
  });

  it('normalizes preset option defaults', () => {
    const defaultOnly = normalizeRelaySelectionPolicy({ strategy: 'default-only' });
    const conservative = normalizeRelaySelectionPolicy({ strategy: 'conservative-outbox' });
    const strict = normalizeRelaySelectionPolicy({ strategy: 'strict-outbox' });
    const overridden = normalizeRelaySelectionPolicy({
      strategy: 'default-only',
      allowTemporaryHints: true
    } satisfies RelaySelectionPolicyOptions);

    expect(defaultOnly).toMatchObject({
      strategy: 'default-only',
      includeDefaultFallback: true,
      allowTemporaryHints: false,
      includeDurableHints: false,
      includeAudienceRelays: false
    });
    expect(conservative).toMatchObject({
      strategy: 'conservative-outbox',
      includeDefaultFallback: true,
      allowTemporaryHints: true,
      includeDurableHints: true,
      includeAudienceRelays: true
    });
    expect(strict).toMatchObject({
      strategy: 'strict-outbox',
      includeDefaultFallback: true,
      allowTemporaryHints: true,
      includeDurableHints: true,
      includeAudienceRelays: true
    });
    expect(overridden.allowTemporaryHints).toBe(true);
  });
});
