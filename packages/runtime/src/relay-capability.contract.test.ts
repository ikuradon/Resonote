import { describe, expect, it } from 'vitest';

import { normalizeRelayCapabilitySnapshot } from './index.js';

describe('runtime relay capability state', () => {
  it('normalizes runtime queue state into an observable capability snapshot', () => {
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
