import { createRuntimeRequestKey } from '@auftakt/core';
import { describe, expect, it } from 'vitest';

describe('request key contract', () => {
  it('normalizes order-only selector differences into the same request key', () => {
    const left = createRuntimeRequestKey({
      mode: 'forward',
      scope: 'contract:comments',
      filters: [
        {
          '#e': ['event-b', 'event-a'],
          kinds: [7, 1111],
          authors: ['pubkey-c', 'pubkey-a']
        }
      ],
      overlay: {
        relays: ['wss://relay-b.test', 'wss://relay-a.test'],
        includeDefaultReadRelays: true
      }
    });

    const right = createRuntimeRequestKey({
      mode: 'forward',
      scope: 'contract:comments',
      filters: [
        {
          authors: ['pubkey-a', 'pubkey-c'],
          kinds: [1111, 7],
          '#e': ['event-a', 'event-b']
        }
      ],
      overlay: {
        relays: ['wss://relay-a.test', 'wss://relay-b.test'],
        includeDefaultReadRelays: true
      }
    });

    expect(left).toBe(right);
  });

  it('treats scope, window, and overlay differences as distinct identities', () => {
    const base = createRuntimeRequestKey({
      mode: 'backward',
      scope: 'contract:profiles',
      filters: [{ kinds: [0], authors: ['pubkey-a'], limit: 1 }],
      overlay: {
        relays: ['wss://relay-a.test'],
        includeDefaultReadRelays: true
      }
    });

    const scopeChanged = createRuntimeRequestKey({
      mode: 'backward',
      scope: 'contract:profiles:other-scope',
      filters: [{ kinds: [0], authors: ['pubkey-a'], limit: 1 }],
      overlay: {
        relays: ['wss://relay-a.test'],
        includeDefaultReadRelays: true
      }
    });

    const windowChanged = createRuntimeRequestKey({
      mode: 'backward',
      scope: 'contract:profiles',
      filters: [{ kinds: [0], authors: ['pubkey-a'], limit: 2 }],
      overlay: {
        relays: ['wss://relay-a.test'],
        includeDefaultReadRelays: true
      }
    });

    const overlayChanged = createRuntimeRequestKey({
      mode: 'backward',
      scope: 'contract:profiles',
      filters: [{ kinds: [0], authors: ['pubkey-a'], limit: 1 }],
      overlay: {
        relays: ['wss://relay-b.test'],
        includeDefaultReadRelays: true
      }
    });

    expect(scopeChanged).not.toBe(base);
    expect(windowChanged).not.toBe(base);
    expect(overlayChanged).not.toBe(base);
  });

  it('keeps request key opaque/versioned on the public surface', () => {
    const key = createRuntimeRequestKey({
      mode: 'forward',
      scope: 'contract:opaque',
      filters: [{ kinds: [1], authors: ['pubkey-a'] }]
    });

    expect(key.startsWith('rq:v1:')).toBe(true);
    expect(key.includes('authors')).toBe(false);
    expect(key.includes('kinds')).toBe(false);
  });
});
