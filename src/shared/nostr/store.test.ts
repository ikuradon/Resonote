import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock auftakt modules
const mockStore = {
  add: vi.fn().mockResolvedValue('added'),
  query: vi.fn(),
  fetchById: vi.fn(),
  getSync: vi.fn().mockResolvedValue([]),
  dispose: vi.fn(),
  changes$: { subscribe: vi.fn() },
  _setConnectFilter: vi.fn(),
  _getConnectFilter: vi.fn()
};

const mockCreateEventStore = vi.fn().mockReturnValue(mockStore);
const mockIndexedDBBackend = vi.fn().mockReturnValue({});
const mockConnectStore = vi.fn().mockReturnValue(() => {});

vi.mock('@ikuradon/auftakt', () => ({
  createEventStore: mockCreateEventStore
}));
vi.mock('@ikuradon/auftakt/backends/dexie', () => ({
  dexieBackend: mockIndexedDBBackend
}));
vi.mock('@ikuradon/auftakt/sync', () => ({
  connectStore: mockConnectStore,
  createSyncedQuery: vi.fn()
}));
vi.mock('./client.js', () => ({
  getRxNostr: vi.fn().mockResolvedValue({ createAllEventObservable: vi.fn() })
}));

describe('store.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStore', () => {
    it('throws if store is not initialized', async () => {
      // Import fresh module to test uninitialized state
      vi.resetModules();

      // Re-apply mocks after reset
      vi.doMock('@ikuradon/auftakt', () => ({
        createEventStore: mockCreateEventStore
      }));
      vi.doMock('@ikuradon/auftakt/backends/dexie', () => ({
        dexieBackend: mockIndexedDBBackend
      }));
      vi.doMock('@ikuradon/auftakt/sync', () => ({
        connectStore: mockConnectStore,
        createSyncedQuery: vi.fn()
      }));
      vi.doMock('./client.js', () => ({
        getRxNostr: vi.fn().mockResolvedValue({ createAllEventObservable: vi.fn() })
      }));

      const { getStore } = await import('./store.js');
      expect(() => getStore()).toThrow('Store not initialized');
    });
  });

  describe('initStore', () => {
    it('creates EventStore with indexedDB backend and connects', async () => {
      vi.resetModules();

      const mockStore2 = {
        add: vi.fn().mockResolvedValue('added'),
        query: vi.fn(),
        fetchById: vi.fn(),
        getSync: vi.fn().mockResolvedValue([]),
        dispose: vi.fn(),
        changes$: { subscribe: vi.fn() },
        _setConnectFilter: vi.fn(),
        _getConnectFilter: vi.fn()
      };
      const mockCreate2 = vi.fn().mockReturnValue(mockStore2);
      const mockBackend2 = vi.fn().mockReturnValue({});
      const mockConnect2 = vi.fn().mockReturnValue(() => {});
      const mockRxNostr = { createAllEventObservable: vi.fn() };

      vi.doMock('@ikuradon/auftakt', () => ({
        createEventStore: mockCreate2
      }));
      vi.doMock('@ikuradon/auftakt/backends/dexie', () => ({
        dexieBackend: mockBackend2
      }));
      vi.doMock('@ikuradon/auftakt/sync', () => ({
        connectStore: mockConnect2,
        createSyncedQuery: vi.fn()
      }));
      vi.doMock('./client.js', () => ({
        getRxNostr: vi.fn().mockResolvedValue(mockRxNostr)
      }));

      const { initStore, getStore } = await import('./store.js');
      await initStore();

      expect(mockBackend2).toHaveBeenCalledWith({ dbName: 'resonote-events' });
      expect(mockCreate2).toHaveBeenCalled();
      expect(mockConnect2).toHaveBeenCalledWith(mockRxNostr, mockStore2, {
        reconcileDeletions: true
      });
      expect(() => getStore()).not.toThrow();
    });

    it('allows retry after init failure without keeping a partial store', async () => {
      vi.resetModules();

      const failedStore = {
        add: vi.fn(),
        query: vi.fn(),
        fetchById: vi.fn(),
        getSync: vi.fn().mockResolvedValue([]),
        dispose: vi.fn(),
        changes$: { subscribe: vi.fn() },
        _setConnectFilter: vi.fn(),
        _getConnectFilter: vi.fn()
      };
      const connectedStore = {
        add: vi.fn(),
        query: vi.fn(),
        fetchById: vi.fn(),
        getSync: vi.fn().mockResolvedValue([]),
        dispose: vi.fn(),
        changes$: { subscribe: vi.fn() },
        _setConnectFilter: vi.fn(),
        _getConnectFilter: vi.fn()
      };
      const mockCreate = vi
        .fn()
        .mockReturnValueOnce(failedStore)
        .mockReturnValueOnce(connectedStore);
      const mockBackend = vi.fn().mockReturnValue({});
      const mockConnect = vi.fn().mockReturnValue(() => {});
      const mockRxNostr = { createAllEventObservable: vi.fn() };
      const mockGetRxNostr = vi
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce(mockRxNostr);

      vi.doMock('@ikuradon/auftakt', () => ({
        createEventStore: mockCreate
      }));
      vi.doMock('@ikuradon/auftakt/backends/dexie', () => ({
        dexieBackend: mockBackend
      }));
      vi.doMock('@ikuradon/auftakt/sync', () => ({
        connectStore: mockConnect,
        createSyncedQuery: vi.fn()
      }));
      vi.doMock('./client.js', () => ({
        getRxNostr: mockGetRxNostr
      }));

      const { initStore, getStore } = await import('./store.js');

      await expect(initStore()).rejects.toThrow('network');
      await expect(initStore()).resolves.toBeUndefined();

      expect(failedStore.dispose).toHaveBeenCalledOnce();
      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(mockConnect).toHaveBeenCalledWith(mockRxNostr, connectedStore, {
        reconcileDeletions: true
      });
      expect(getStore()).toBe(connectedStore);
    });
  });

  describe('disposeStore', () => {
    it('disposes the store and clears singleton', async () => {
      vi.resetModules();

      const mockStore3 = {
        add: vi.fn(),
        query: vi.fn(),
        fetchById: vi.fn(),
        getSync: vi.fn().mockResolvedValue([]),
        dispose: vi.fn(),
        changes$: { subscribe: vi.fn() },
        _setConnectFilter: vi.fn(),
        _getConnectFilter: vi.fn()
      };

      vi.doMock('@ikuradon/auftakt', () => ({
        createEventStore: vi.fn().mockReturnValue(mockStore3)
      }));
      vi.doMock('@ikuradon/auftakt/backends/dexie', () => ({
        dexieBackend: vi.fn().mockReturnValue({})
      }));
      vi.doMock('@ikuradon/auftakt/sync', () => ({
        connectStore: vi.fn().mockReturnValue(() => {}),
        createSyncedQuery: vi.fn()
      }));
      vi.doMock('./client.js', () => ({
        getRxNostr: vi.fn().mockResolvedValue({ createAllEventObservable: vi.fn() })
      }));

      const { initStore, disposeStore, getStore } = await import('./store.js');
      await initStore();
      disposeStore();

      expect(mockStore3.dispose).toHaveBeenCalled();
      expect(() => getStore()).toThrow('Store not initialized');
    });
  });

  describe('fetchLatest', () => {
    it('returns cached event if available', async () => {
      vi.resetModules();

      const mockEvent = {
        id: 'abc',
        kind: 0,
        pubkey: 'pk1',
        created_at: 100,
        tags: [],
        content: '',
        sig: ''
      };
      const mockStore4 = {
        add: vi.fn(),
        query: vi.fn(),
        fetchById: vi.fn(),
        getSync: vi.fn().mockResolvedValue([{ event: mockEvent, seenOn: [], firstSeen: 0 }]),
        dispose: vi.fn(),
        changes$: { subscribe: vi.fn() },
        _setConnectFilter: vi.fn(),
        _getConnectFilter: vi.fn()
      };

      vi.doMock('@ikuradon/auftakt', () => ({
        createEventStore: vi.fn().mockReturnValue(mockStore4)
      }));
      vi.doMock('@ikuradon/auftakt/backends/dexie', () => ({
        dexieBackend: vi.fn().mockReturnValue({})
      }));
      vi.doMock('@ikuradon/auftakt/sync', () => ({
        connectStore: vi.fn().mockReturnValue(() => {}),
        createSyncedQuery: vi.fn()
      }));
      vi.doMock('./client.js', () => ({
        getRxNostr: vi.fn().mockResolvedValue({ createAllEventObservable: vi.fn() })
      }));

      const { initStore, fetchLatest } = await import('./store.js');
      await initStore();

      const result = await fetchLatest('pk1', 0);
      expect(result).toEqual(mockEvent);
      expect(mockStore4.getSync).toHaveBeenCalledWith({ kinds: [0], authors: ['pk1'], limit: 1 });
    });

    it('returns null when not cached and no relay result', async () => {
      vi.resetModules();

      const mockDispose = vi.fn();
      const { BehaviorSubject } = await import('rxjs');
      const eventsSubject = new BehaviorSubject<unknown[]>([]);

      const mockStore5 = {
        add: vi.fn(),
        query: vi.fn(),
        fetchById: vi.fn(),
        getSync: vi.fn().mockResolvedValue([]),
        dispose: vi.fn(),
        changes$: { subscribe: vi.fn() },
        _setConnectFilter: vi.fn(),
        _getConnectFilter: vi.fn()
      };

      vi.doMock('@ikuradon/auftakt', () => ({
        createEventStore: vi.fn().mockReturnValue(mockStore5)
      }));
      vi.doMock('@ikuradon/auftakt/backends/dexie', () => ({
        dexieBackend: vi.fn().mockReturnValue({})
      }));
      vi.doMock('@ikuradon/auftakt/sync', () => ({
        connectStore: vi.fn().mockReturnValue(() => {}),
        createSyncedQuery: vi.fn().mockReturnValue({
          events$: eventsSubject.asObservable(),
          status$: new BehaviorSubject('cached').asObservable(),
          emit: vi.fn(),
          dispose: mockDispose
        })
      }));
      vi.doMock('./client.js', () => ({
        getRxNostr: vi.fn().mockResolvedValue({ createAllEventObservable: vi.fn() })
      }));

      const { initStore, fetchLatest } = await import('./store.js');
      await initStore();

      const result = await fetchLatest('pk1', 0, { timeout: 100 });
      expect(result).toBeNull();
      expect(mockDispose).toHaveBeenCalled();
    });
  });
});
