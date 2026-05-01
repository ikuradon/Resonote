import {
  normalizeRelayObservation,
  normalizeRelayObservationPacket,
  normalizeRelayObservationSnapshot
} from '@auftakt/core';
import { describe, expect, it } from 'vitest';

describe('@auftakt/core relay observation contract', () => {
  it('marks backoff, closed, and degraded relay states as degraded observations', () => {
    expect(normalizeRelayObservation('wss://relay.test', 'backoff', 'disconnected')).toMatchObject({
      url: 'wss://relay.test',
      connection: 'backoff',
      replaying: false,
      degraded: true,
      reason: 'disconnected'
    });

    expect(normalizeRelayObservation('wss://relay.test', 'closed', 'disposed').degraded).toBe(true);
    expect(normalizeRelayObservation('wss://relay.test', 'open', 'opened').degraded).toBe(false);
    expect(normalizeRelayObservation('wss://relay.test', 'idle', 'idle-timeout')).toMatchObject({
      connection: 'idle',
      degraded: false,
      reason: 'idle-timeout'
    });
  });

  it('normalizes packets and snapshots with relay and aggregate state intact', () => {
    const aggregate = {
      state: 'degraded' as const,
      reason: 'relay-degraded' as const,
      relays: []
    };

    expect(
      normalizeRelayObservationPacket({
        from: 'wss://relay.test',
        state: 'degraded',
        reason: 'connect-failed',
        aggregate
      })
    ).toEqual({
      from: 'wss://relay.test',
      state: 'degraded',
      reason: 'connect-failed',
      aggregate,
      relay: {
        url: 'wss://relay.test',
        connection: 'degraded',
        replaying: false,
        degraded: true,
        reason: 'connect-failed'
      }
    });

    expect(
      normalizeRelayObservationSnapshot({
        url: 'wss://relay.test',
        connection: 'replaying',
        reason: 'replay-started',
        aggregate
      }).relay
    ).toMatchObject({
      url: 'wss://relay.test',
      connection: 'replaying',
      replaying: true,
      degraded: false,
      reason: 'replay-started'
    });
  });
});
