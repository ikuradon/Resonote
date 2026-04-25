import { describe, expect, it } from 'vitest';

import {
  calculateEffectiveRelayCapability,
  normalizeRelayCapabilitySnapshot,
  parseRelayLimitClosedReason,
  type RelayCapabilityRecord
} from './index.js';

describe('relay capability model', () => {
  it('keeps learned safety bounds when NIP-11 is failed', () => {
    const record: RelayCapabilityRecord = {
      relayUrl: 'wss://relay.example',
      nip11Status: 'failed',
      nip11CheckedAt: 10,
      nip11ExpiresAt: 310,
      supportedNips: [],
      nip11MaxFilters: null,
      nip11MaxSubscriptions: null,
      learnedMaxFilters: 1,
      learnedMaxSubscriptions: 2,
      learnedAt: 20,
      learnedReason: 'CLOSED too many filters',
      updatedAt: 20
    };

    expect(calculateEffectiveRelayCapability(record, 100)).toMatchObject({
      relayUrl: 'wss://relay.example',
      maxFilters: 1,
      maxSubscriptions: 2,
      source: 'learned',
      stale: false
    });
  });

  it('uses the strictest fresh NIP-11, learned, and override limits', () => {
    const record: RelayCapabilityRecord = {
      relayUrl: 'wss://relay.example',
      nip11Status: 'ok',
      nip11CheckedAt: 10,
      nip11ExpiresAt: 3_610,
      supportedNips: [1, 11],
      nip11MaxFilters: 5,
      nip11MaxSubscriptions: 8,
      learnedMaxFilters: 2,
      learnedMaxSubscriptions: null,
      learnedAt: 20,
      learnedReason: 'CLOSED too many filters',
      updatedAt: 20
    };

    expect(
      calculateEffectiveRelayCapability(record, 100, {
        maxFilters: 3,
        maxSubscriptions: 4
      })
    ).toMatchObject({
      maxFilters: 2,
      maxSubscriptions: 4,
      supportedNips: [1, 11],
      source: 'mixed',
      expiresAt: 3_610,
      stale: false
    });
  });

  it('marks expired NIP-11 metadata stale without deleting learned bounds', () => {
    const record: RelayCapabilityRecord = {
      relayUrl: 'wss://relay.example',
      nip11Status: 'ok',
      nip11CheckedAt: 10,
      nip11ExpiresAt: 20,
      supportedNips: [1],
      nip11MaxFilters: 10,
      nip11MaxSubscriptions: 10,
      learnedMaxFilters: 2,
      learnedMaxSubscriptions: null,
      learnedAt: 15,
      learnedReason: 'CLOSED too many filters',
      updatedAt: 15
    };

    expect(calculateEffectiveRelayCapability(record, 30)).toMatchObject({
      maxFilters: 2,
      maxSubscriptions: null,
      source: 'learned',
      expiresAt: 20,
      stale: true
    });
  });

  it('parses CLOSED filter and subscription limit reasons', () => {
    expect(
      parseRelayLimitClosedReason({
        relayUrl: 'wss://relay.example',
        reason: 'too many filters: max_filters=2',
        activeAcceptedSubscriptions: 3
      })
    ).toEqual({
      relayUrl: 'wss://relay.example',
      kind: 'maxFilters',
      value: 2,
      reason: 'too many filters: max_filters=2'
    });

    expect(
      parseRelayLimitClosedReason({
        relayUrl: 'wss://relay.example',
        reason: 'too many subscriptions',
        activeAcceptedSubscriptions: 3
      })
    ).toEqual({
      relayUrl: 'wss://relay.example',
      kind: 'maxSubscriptions',
      value: 3,
      reason: 'too many subscriptions'
    });
  });

  it('normalizes runtime queue state into a public snapshot', () => {
    expect(
      normalizeRelayCapabilitySnapshot({
        relayUrl: 'wss://relay.example',
        maxFilters: null,
        maxSubscriptions: 1,
        supportedNips: [],
        source: 'learned',
        expiresAt: null,
        stale: false,
        queueDepth: 2,
        activeSubscriptions: 1
      })
    ).toEqual({
      url: 'wss://relay.example',
      maxFilters: null,
      maxSubscriptions: 1,
      supportedNips: [],
      source: 'learned',
      expiresAt: null,
      stale: false,
      queueDepth: 2,
      activeSubscriptions: 1
    });
  });
});
