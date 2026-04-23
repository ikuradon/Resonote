import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { countStoredEventsByKindsMock, clearStoredEventsMock } = vi.hoisted(() => ({
  countStoredEventsByKindsMock: vi.fn(),
  clearStoredEventsMock: vi.fn()
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  countStoredEventsByKinds: countStoredEventsByKindsMock,
  clearStoredEvents: clearStoredEventsMock
}));

import {
  buildDebugInfo,
  checkServiceWorkerStatus,
  checkServiceWorkerUpdate,
  clearAllData,
  clearIndexedDB,
  clearLocalStorage,
  type DbStats,
  loadDbStats
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

  describe('loadDbStats', () => {
    it('returns kind-by-kind counts from DB', async () => {
      countStoredEventsByKindsMock.mockResolvedValue([
        { kind: 0, count: 2 },
        { kind: 3, count: 0 },
        { kind: 5, count: 0 },
        { kind: 7, count: 1 },
        { kind: 1111, count: 0 },
        { kind: 10000, count: 0 },
        { kind: 10002, count: 0 },
        { kind: 10003, count: 0 },
        { kind: 10030, count: 0 },
        { kind: 30030, count: 0 }
      ]);

      const result = await loadDbStats();

      expect(result.total).toBe(3);
      expect(result.byKind).toEqual([
        { kind: 0, count: 2 },
        { kind: 7, count: 1 }
      ]);
    });

    it('skips kinds with zero events in byKind array', async () => {
      countStoredEventsByKindsMock.mockResolvedValue([
        { kind: 0, count: 0 },
        { kind: 3, count: 0 }
      ]);

      const result = await loadDbStats();

      expect(result.total).toBe(0);
      expect(result.byKind).toEqual([]);
    });

    it('returns { total: 0, byKind: [] } on count helper rejection', async () => {
      countStoredEventsByKindsMock.mockRejectedValue(new Error('count failed'));

      const result = await loadDbStats();

      expect(result).toEqual({ total: 0, byKind: [] });
    });

    it('returns { total: 0, byKind: [] } when count helper throws', async () => {
      countStoredEventsByKindsMock.mockRejectedValue(new Error('read error'));

      const result = await loadDbStats();

      expect(result).toEqual({ total: 0, byKind: [] });
    });
  });

  describe('clearIndexedDB', () => {
    it('calls clearStoredEvents()', async () => {
      clearStoredEventsMock.mockResolvedValue(undefined);

      await clearIndexedDB();

      expect(clearStoredEventsMock).toHaveBeenCalledOnce();
    });

    it('propagates clear helper error', async () => {
      clearStoredEventsMock.mockRejectedValue(new Error('clear failed'));

      await expect(clearIndexedDB()).rejects.toThrow('clear failed');
    });
  });

  describe('clearAllData', () => {
    function setupClearAllGlobals(localStorageValue: Record<string, unknown>) {
      vi.stubGlobal('localStorage', localStorageValue);
      const deleteDbMock = vi.fn().mockReturnValue({});
      vi.stubGlobal('indexedDB', { deleteDatabase: deleteDbMock });
      const reloadMock = vi.fn();
      vi.stubGlobal('window', {
        location: { href: 'https://resonote.pages.dev/', reload: reloadMock }
      });
      return { deleteDbMock, reloadMock };
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('calls localStorage.clear, indexedDB.deleteDatabase, and location.reload', () => {
      const clearMock = vi.fn();
      const { deleteDbMock, reloadMock } = setupClearAllGlobals({ clear: clearMock });

      clearAllData();

      expect(clearMock).toHaveBeenCalledOnce();
      expect(deleteDbMock).toHaveBeenCalledWith('resonote-events');
      expect(reloadMock).toHaveBeenCalledOnce();
    });

    it('still deletes DB and reloads when localStorage.clear throws', () => {
      const { deleteDbMock, reloadMock } = setupClearAllGlobals({
        clear() {
          throw new Error('denied');
        }
      });

      clearAllData();

      expect(deleteDbMock).toHaveBeenCalledWith('resonote-events');
      expect(reloadMock).toHaveBeenCalledOnce();
    });
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
