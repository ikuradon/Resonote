import { describe, expect, it, vi } from 'vitest';

import type { RelayObservationRuntime } from './index.js';
import { observeRelayStatuses, snapshotRelayStatuses } from './index.js';

describe('runtime relay observation behavior', () => {
  it('snapshots relay state with idle fallback for missing runtime entries', async () => {
    const runtime: RelayObservationRuntime = {
      async getRelayConnectionState(url) {
        if (url !== 'wss://known.test') return null;
        return {
          url,
          relay: { url, connection: 'open', replaying: false, degraded: false, reason: 'opened' },
          aggregate: { state: 'live', reason: 'relay-opened', relays: [] }
        };
      },
      async observeRelayConnectionStates() {
        return { unsubscribe() {} };
      }
    };

    const snapshots = await snapshotRelayStatuses(runtime, [
      'wss://known.test',
      'wss://missing.test'
    ]);

    expect(snapshots[0].relay.connection).toBe('open');
    expect(snapshots[1]).toMatchObject({
      url: 'wss://missing.test',
      relay: { connection: 'idle', reason: 'boot' },
      aggregate: { state: 'booting', reason: 'boot' }
    });
  });

  it('normalizes observable connection packets before notifying consumers', async () => {
    const onPacket = vi.fn();
    const runtime: RelayObservationRuntime = {
      async getRelayConnectionState() {
        return null;
      },
      async observeRelayConnectionStates(callback) {
        callback({
          from: 'wss://relay.test',
          state: 'backoff',
          reason: 'connect-failed',
          relay: {
            url: 'wss://relay.test',
            connection: 'backoff',
            replaying: false,
            degraded: true,
            reason: 'connect-failed'
          },
          aggregate: { state: 'degraded', reason: 'relay-degraded', relays: [] }
        });
        return { unsubscribe() {} };
      }
    };

    await observeRelayStatuses(runtime, onPacket);

    expect(onPacket).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'wss://relay.test',
        relay: expect.objectContaining({ degraded: true, connection: 'backoff' })
      })
    );
  });
});
