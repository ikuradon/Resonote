import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  clearLocalStorage,
  checkServiceWorkerStatus,
  checkServiceWorkerUpdate,
  buildDebugInfo,
  type DbStats
} from './dev-tools.svelte.js';

describe('dev-tools.svelte', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { href: 'https://resonote.pages.dev/' }
      },
      writable: true,
      configurable: true
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'TestAgent/1.0' },
      writable: true,
      configurable: true
    });
    Object.defineProperty(globalThis, 'document', {
      value: { documentElement: { lang: 'ja' } },
      writable: true,
      configurable: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('clearLocalStorage', () => {
    it('calls localStorage.removeItem with the given key', () => {
      const removeItem = vi.fn();
      Object.defineProperty(globalThis, 'localStorage', {
        value: { removeItem },
        writable: true,
        configurable: true
      });

      clearLocalStorage('my-key');

      expect(removeItem).toHaveBeenCalledWith('my-key');
    });

    it('does not throw when localStorage throws', () => {
      Object.defineProperty(globalThis, 'localStorage', {
        get() {
          throw new Error('no storage');
        },
        configurable: true
      });

      expect(() => clearLocalStorage('key')).not.toThrow();
    });
  });

  describe('checkServiceWorkerStatus', () => {
    it('returns "active" when serviceWorker.controller exists', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent: 'TestAgent/1.0',
          serviceWorker: { controller: {} }
        },
        writable: true,
        configurable: true
      });

      const result = checkServiceWorkerStatus();

      expect(result).toBe('active');
    });

    it('returns "none" when serviceWorker is not in navigator', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'TestAgent/1.0' },
        writable: true,
        configurable: true
      });

      const result = checkServiceWorkerStatus();

      expect(result).toBe('none');
    });

    it('returns "none" when serviceWorker.controller is null', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent: 'TestAgent/1.0',
          serviceWorker: { controller: null }
        },
        writable: true,
        configurable: true
      });

      const result = checkServiceWorkerStatus();

      expect(result).toBe('none');
    });
  });

  describe('checkServiceWorkerUpdate', () => {
    it('returns false when serviceWorker is not in navigator', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'TestAgent/1.0' },
        writable: true,
        configurable: true
      });

      const result = await checkServiceWorkerUpdate();

      expect(result).toBe(false);
    });

    it('returns true and calls reg.update() when registration exists', async () => {
      const updateMock = vi.fn(async () => {});
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent: 'TestAgent/1.0',
          serviceWorker: {
            getRegistration: vi.fn(async () => ({ update: updateMock }))
          }
        },
        writable: true,
        configurable: true
      });

      const result = await checkServiceWorkerUpdate();

      expect(result).toBe(true);
      expect(updateMock).toHaveBeenCalledTimes(1);
    });

    it('returns false when getRegistration returns undefined', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent: 'TestAgent/1.0',
          serviceWorker: {
            getRegistration: vi.fn(async () => undefined)
          }
        },
        writable: true,
        configurable: true
      });

      const result = await checkServiceWorkerUpdate();

      expect(result).toBe(false);
    });
  });

  describe('buildDebugInfo', () => {
    it('builds debug info with all fields populated', () => {
      const dbStats: DbStats = { total: 10, byKind: [{ kind: 1111, count: 10 }] };
      const info = buildDebugInfo(
        { loggedIn: true, pubkey: 'deadbeef12345678' },
        [{ url: 'wss://relay.example.com', state: 'connected' }],
        dbStats,
        'active'
      );

      expect(info.app).toBe('Resonote');
      expect(info.url).toBe('https://resonote.pages.dev/');
      expect(info.userAgent).toBe('TestAgent/1.0');
      expect(info.locale).toBe('ja');
      expect(info.auth.loggedIn).toBe(true);
      expect(info.auth.pubkey).toBe('deadbeef...');
      expect(info.relays).toHaveLength(1);
      expect(info.cache?.total).toBe(10);
      expect(info.sw).toBe('active');
      expect(info.timestamp).toBeTruthy();
    });

    it('sets pubkey to null when auth.pubkey is null', () => {
      const info = buildDebugInfo({ loggedIn: false, pubkey: null }, [], null, 'none');

      expect(info.auth.pubkey).toBeNull();
      expect(info.cache).toBeNull();
      expect(info.sw).toBe('none');
    });
  });
});
