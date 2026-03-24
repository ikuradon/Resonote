import { beforeEach, describe, expect, it } from 'vitest';

import { buildDebugInfo, type DbStats } from './dev-tools.js';

describe('buildDebugInfo', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { href: 'https://resonote.pages.dev/settings' }
      },
      writable: true,
      configurable: true
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'TestBrowser/1.0' },
      writable: true,
      configurable: true
    });
    Object.defineProperty(globalThis, 'document', {
      value: { documentElement: { lang: 'en' } },
      writable: true,
      configurable: true
    });
  });

  it('should build debug info with all fields', () => {
    const dbStats: DbStats = { total: 42, byKind: [{ kind: 1111, count: 10 }] };
    const info = buildDebugInfo(
      { loggedIn: true, pubkey: 'abcdef1234567890' },
      [{ url: 'wss://relay.example.com', state: 'connected' }],
      dbStats,
      'active'
    );

    expect(info.app).toBe('Resonote');
    expect(info.auth.loggedIn).toBe(true);
    expect(info.auth.pubkey).toBe('abcdef12...');
    expect(info.relays).toHaveLength(1);
    expect(info.cache?.total).toBe(42);
    expect(info.sw).toBe('active');
    expect(info.timestamp).toBeTruthy();
  });

  it('should truncate pubkey', () => {
    const info = buildDebugInfo({ loggedIn: true, pubkey: '0123456789abcdef' }, [], null, 'none');
    expect(info.auth.pubkey).toBe('01234567...');
  });

  it('should handle null pubkey', () => {
    const info = buildDebugInfo({ loggedIn: false, pubkey: null }, [], null, 'none');
    expect(info.auth.pubkey).toBeNull();
  });
});
