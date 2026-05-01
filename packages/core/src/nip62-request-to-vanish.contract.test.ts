import {
  buildNip62RequestToVanishEvent,
  isNip62RequestToVanishEvent,
  NIP62_ALL_RELAYS,
  NIP62_REQUEST_TO_VANISH_KIND,
  nip62TargetsRelay,
  parseNip62RelayTargets,
  parseNip62RequestToVanishEvent
} from '@auftakt/core';
import { describe, expect, it } from 'vitest';

describe('NIP-62 request to vanish model', () => {
  it('builds relay-targeted kind:62 requests', () => {
    expect(
      buildNip62RequestToVanishEvent({
        relayUrls: ['wss://relay.example/?ignored=1', 'https://not-a-relay.example'],
        content: 'legal notice',
        tags: [
          ['relay', 'wss://duplicate.example'],
          ['alt', 'request to vanish']
        ]
      })
    ).toEqual({
      kind: NIP62_REQUEST_TO_VANISH_KIND,
      content: 'legal notice',
      tags: [
        ['relay', 'wss://relay.example/'],
        ['alt', 'request to vanish']
      ]
    });
  });

  it('builds global ALL_RELAYS requests', () => {
    expect(
      buildNip62RequestToVanishEvent({
        relayUrls: NIP62_ALL_RELAYS
      })
    ).toEqual({
      kind: 62,
      content: '',
      tags: [['relay', 'ALL_RELAYS']]
    });
  });

  it('rejects requests without a valid relay target', () => {
    expect(() => buildNip62RequestToVanishEvent({ relayUrls: [] })).toThrow(
      'NIP-62 request to vanish must include at least one relay target'
    );
    expect(
      parseNip62RequestToVanishEvent({
        kind: 62,
        pubkey: 'alice',
        created_at: 10,
        tags: [],
        content: ''
      })
    ).toBeNull();
  });

  it('parses relay targets and relay applicability', () => {
    const snapshot = parseNip62RequestToVanishEvent({
      kind: 62,
      pubkey: 'alice',
      created_at: 10,
      tags: [
        ['relay', 'wss://relay.example/path?x=1'],
        ['relay', 'wss://relay.example/path'],
        ['relay', 'ALL_RELAYS'],
        ['p', 'ignored']
      ],
      content: 'reason'
    });

    expect(snapshot).toEqual({
      pubkey: 'alice',
      createdAt: 10,
      content: 'reason',
      relayTargets: ['wss://relay.example/path', 'ALL_RELAYS'],
      global: true,
      customTags: [['p', 'ignored']]
    });
    expect(nip62TargetsRelay(snapshot!, 'wss://other.example')).toBe(true);
    expect(
      isNip62RequestToVanishEvent({
        kind: 62,
        tags: [['relay', 'ALL_RELAYS']],
        content: ''
      })
    ).toBe(true);
  });

  it('parses only valid relay tags for targeted requests', () => {
    expect(
      parseNip62RelayTargets([
        ['relay', 'wss://relay.example'],
        ['relay', 'ALL_RELAYS'],
        ['relay', 'ALL_relays'],
        ['relay', 'https://invalid.example'],
        ['e', 'ignored']
      ])
    ).toEqual(['wss://relay.example/', 'ALL_RELAYS']);
  });
});
