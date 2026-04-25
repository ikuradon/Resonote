import { describe, expect, it } from 'vitest';

import {
  calculateRelayReconnectDelay,
  normalizeRelayLifecycleOptions,
  type RelayLifecycleRetryPolicy
} from './index.js';

describe('relay lifecycle policy model', () => {
  it('defaults session relays to lazy-keep and temporary relays to lazy idle disconnect', () => {
    const policy = normalizeRelayLifecycleOptions();

    expect(policy.defaultRelay).toMatchObject({
      mode: 'lazy-keep',
      idleDisconnectMs: 10_000,
      retry: {
        strategy: 'exponential',
        initialDelayMs: 0,
        maxDelayMs: 60_000,
        maxAttempts: Number.POSITIVE_INFINITY
      }
    });
    expect(policy.temporaryRelay).toMatchObject({
      mode: 'lazy',
      idleDisconnectMs: 10_000,
      retry: {
        strategy: 'exponential',
        initialDelayMs: 0,
        maxDelayMs: 60_000,
        maxAttempts: Number.POSITIVE_INFINITY
      }
    });
  });

  it('normalizes configured idle timeout and retry bounds', () => {
    const policy = normalizeRelayLifecycleOptions({
      idleDisconnectMs: 25,
      retry: {
        strategy: 'exponential',
        initialDelayMs: 50,
        maxDelayMs: 120,
        maxAttempts: 3
      }
    });

    expect(policy.defaultRelay.retry).toEqual({
      strategy: 'exponential',
      initialDelayMs: 50,
      maxDelayMs: 120,
      maxAttempts: 3
    });
    expect(policy.temporaryRelay.idleDisconnectMs).toBe(25);
  });

  it('calculates bounded reconnect delays', () => {
    const retry: RelayLifecycleRetryPolicy = {
      strategy: 'exponential',
      initialDelayMs: 50,
      maxDelayMs: 120,
      maxAttempts: 3
    };

    expect(calculateRelayReconnectDelay(1, retry)).toBe(50);
    expect(calculateRelayReconnectDelay(2, retry)).toBe(100);
    expect(calculateRelayReconnectDelay(3, retry)).toBe(120);
    expect(calculateRelayReconnectDelay(4, retry)).toBeNull();
  });

  it('returns null when reconnect strategy is off', () => {
    expect(
      calculateRelayReconnectDelay(1, {
        strategy: 'off',
        initialDelayMs: 50,
        maxDelayMs: 120,
        maxAttempts: 3
      })
    ).toBeNull();
  });
});
