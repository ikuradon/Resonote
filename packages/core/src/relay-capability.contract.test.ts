import { describe, expect, it } from 'vitest';

import {
  calculateEffectiveRelayCapability,
  calculateNip66RelayScore,
  NIP66_RELAY_DISCOVERY_KIND,
  NIP66_RELAY_MONITOR_ANNOUNCEMENT_KIND,
  parseNip66RelayDiscoveryEvent,
  parseNip66RelayMonitorAnnouncement,
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

  it('parses NIP-66 relay discovery events with repeated tags and RTT metrics', () => {
    const discovery = parseNip66RelayDiscoveryEvent({
      kind: NIP66_RELAY_DISCOVERY_KIND,
      pubkey: 'monitor-pubkey',
      created_at: 123,
      tags: [
        ['d', 'wss://relay.example/'],
        ['N', '1'],
        ['N', '11'],
        ['N', '11'],
        ['N', 'not-a-number'],
        ['R', 'auth'],
        ['R', '!payment'],
        ['n', 'clearnet'],
        ['T', 'PrivateInbox'],
        ['t', 'music'],
        ['g', 'ww8p1r4t8'],
        ['rtt-open', '200'],
        ['rtt-read', '150'],
        ['rtt-write', '250']
      ]
    });

    expect(discovery).toEqual({
      relayUrl: 'wss://relay.example/',
      monitorPubkey: 'monitor-pubkey',
      createdAt: 123,
      supportedNips: [1, 11],
      requirements: ['auth', '!payment'],
      networkTypes: ['clearnet'],
      relayTypes: ['PrivateInbox'],
      topics: ['music'],
      geohashes: ['ww8p1r4t8'],
      rttOpenMs: 200,
      rttReadMs: 150,
      rttWriteMs: 250
    });
    expect(calculateNip66RelayScore(discovery!)).toBe(0.833);
  });

  it('rejects malformed NIP-66 discovery events without a d tag', () => {
    expect(
      parseNip66RelayDiscoveryEvent({
        kind: NIP66_RELAY_DISCOVERY_KIND,
        pubkey: 'monitor-pubkey',
        created_at: 123,
        tags: [['N', '1']]
      })
    ).toBeNull();
  });

  it('parses NIP-66 relay monitor announcements in both timeout tag forms', () => {
    expect(
      parseNip66RelayMonitorAnnouncement({
        kind: NIP66_RELAY_MONITOR_ANNOUNCEMENT_KIND,
        pubkey: 'monitor-pubkey',
        created_at: 456,
        tags: [
          ['frequency', '3600'],
          ['timeout', '5000', 'open'],
          ['timeout', 'read', '3000'],
          ['c', 'open'],
          ['c', 'nip11'],
          ['g', 'ww8p1r4t8']
        ]
      })
    ).toEqual({
      monitorPubkey: 'monitor-pubkey',
      createdAt: 456,
      frequencySeconds: 3600,
      checks: ['open', 'nip11'],
      timeouts: [
        { check: 'open', timeoutMs: 5000 },
        { check: 'read', timeoutMs: 3000 }
      ],
      geohashes: ['ww8p1r4t8']
    });
  });
});
