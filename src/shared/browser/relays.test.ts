import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- hoisted mocks ---
const { getRxNostrMock, logInfoMock, logDebugMock } = vi.hoisted(() => ({
  getRxNostrMock: vi.fn(),
  logInfoMock: vi.fn(),
  logDebugMock: vi.fn()
}));

vi.mock('$shared/nostr/client.js', () => ({
  getRxNostr: getRxNostrMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: logInfoMock,
    debug: logDebugMock,
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock('$shared/nostr/relays.js', () => ({
  DEFAULT_RELAYS: ['wss://relay.damus.io', 'wss://yabu.me']
}));

vi.mock('$shared/nostr/events.js', () => ({
  RELAY_LIST_KIND: 10002,
  FOLLOW_KIND: 3
}));

vi.mock('$features/relays/domain/relay-model.js', () => ({
  parseRelayTags: (tags: string[][]): { url: string; read: boolean; write: boolean }[] => {
    return tags
      .filter((t) => t[0] === 'r' && t[1])
      .map((t) => {
        const url = t[1];
        const marker = t[2];
        if (marker === 'read') return { url, read: true, write: false };
        if (marker === 'write') return { url, read: false, write: true };
        return { url, read: true, write: true };
      });
  }
}));

import {
  destroyRelayStatus,
  getRelays,
  initRelayStatus,
  refreshRelayList
} from './relays.svelte.js';

// ---- helpers ----
function makeRxNostrMock(connectionStates: Record<string, string> = {}) {
  return {
    getRelayStatus: vi.fn((url: string) => {
      const state = connectionStates[url];
      return state ? { connection: state } : null;
    }),
    createConnectionStateObservable: vi.fn(() => ({
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() }))
    }))
  };
}

// ---- tests ----

describe('getRelays', () => {
  beforeEach(() => {
    destroyRelayStatus();
  });

  it('初期状態は空配列', () => {
    expect(getRelays()).toEqual([]);
  });
});

describe('destroyRelayStatus', () => {
  beforeEach(() => {
    destroyRelayStatus();
  });

  it('relaysを空配列にリセットする', () => {
    destroyRelayStatus();
    expect(getRelays()).toEqual([]);
  });
});

describe('initRelayStatus', () => {
  beforeEach(() => {
    destroyRelayStatus();
    vi.clearAllMocks();
  });

  it('DEFAULT_RELAYSをもとにrelaysを初期化する', async () => {
    const rxNostr = makeRxNostrMock({
      'wss://relay.damus.io': 'connected',
      'wss://yabu.me': 'connecting'
    });
    getRxNostrMock.mockResolvedValue(rxNostr);

    await initRelayStatus();

    const relays = getRelays();
    expect(relays).toHaveLength(2);
    expect(relays[0]).toEqual({ url: 'wss://relay.damus.io', state: 'connected' });
    expect(relays[1]).toEqual({ url: 'wss://yabu.me', state: 'connecting' });
  });

  it('getRelayStatusがnullの場合はinitializedをデフォルトにする', async () => {
    const rxNostr = makeRxNostrMock();
    getRxNostrMock.mockResolvedValue(rxNostr);

    await initRelayStatus();

    const relays = getRelays();
    expect(relays[0].state).toBe('initialized');
    expect(relays[1].state).toBe('initialized');
  });

  it('2回目の呼び出しはrxNostrを再取得しない', async () => {
    const rxNostr = makeRxNostrMock();
    getRxNostrMock.mockResolvedValue(rxNostr);

    await initRelayStatus();
    await initRelayStatus();

    expect(getRxNostrMock).toHaveBeenCalledOnce();
  });

  it('createConnectionStateObservableのsubscribeを呼び出す', async () => {
    const subscribeMock = vi.fn(() => ({ unsubscribe: vi.fn() }));
    const rxNostr = {
      getRelayStatus: vi.fn(() => null),
      createConnectionStateObservable: vi.fn(() => ({ subscribe: subscribeMock }))
    };
    getRxNostrMock.mockResolvedValue(rxNostr);

    await initRelayStatus();

    expect(rxNostr.createConnectionStateObservable).toHaveBeenCalledOnce();
    expect(subscribeMock).toHaveBeenCalledOnce();
  });

  it('接続状態コールバックで既存リレーの状態を更新する', async () => {
    let subscribedCallback: ((packet: { from: string; state: string }) => void) | undefined;
    const subscribeMock = vi.fn((cb: (packet: { from: string; state: string }) => void) => {
      subscribedCallback = cb;
      return { unsubscribe: vi.fn() };
    });
    const rxNostr = {
      getRelayStatus: vi.fn(() => null),
      createConnectionStateObservable: vi.fn(() => ({ subscribe: subscribeMock }))
    };
    getRxNostrMock.mockResolvedValue(rxNostr);

    await initRelayStatus();

    subscribedCallback!({ from: 'wss://relay.damus.io', state: 'connected' });

    const relays = getRelays();
    const damusRelay = relays.find((r) => r.url === 'wss://relay.damus.io');
    expect(damusRelay?.state).toBe('connected');
  });

  it('接続状態コールバックで未知リレーを追加する', async () => {
    let subscribedCallback: ((packet: { from: string; state: string }) => void) | undefined;
    const subscribeMock = vi.fn((cb: (packet: { from: string; state: string }) => void) => {
      subscribedCallback = cb;
      return { unsubscribe: vi.fn() };
    });
    const rxNostr = {
      getRelayStatus: vi.fn(() => null),
      createConnectionStateObservable: vi.fn(() => ({ subscribe: subscribeMock }))
    };
    getRxNostrMock.mockResolvedValue(rxNostr);

    await initRelayStatus();

    subscribedCallback!({ from: 'wss://new-relay.example.com', state: 'connected' });

    const relays = getRelays();
    const newRelay = relays.find((r) => r.url === 'wss://new-relay.example.com');
    expect(newRelay).toBeDefined();
    expect(newRelay?.state).toBe('connected');
  });

  it('destroy 後に再度 initRelayStatus できる', async () => {
    const rxNostr = makeRxNostrMock();
    getRxNostrMock.mockResolvedValue(rxNostr);

    await initRelayStatus();
    destroyRelayStatus();
    expect(getRelays()).toEqual([]);

    await initRelayStatus();
    expect(getRelays()).toHaveLength(2);
  });

  it('destroyRelayStatus は subscription を解除する', async () => {
    const unsubscribeMock = vi.fn();
    const subscribeMock = vi.fn(() => ({ unsubscribe: unsubscribeMock }));
    const rxNostr = {
      getRelayStatus: vi.fn(() => null),
      createConnectionStateObservable: vi.fn(() => ({ subscribe: subscribeMock }))
    };
    getRxNostrMock.mockResolvedValue(rxNostr);

    await initRelayStatus();
    destroyRelayStatus();

    expect(unsubscribeMock).toHaveBeenCalledOnce();
  });
});

describe('refreshRelayList', () => {
  beforeEach(() => {
    destroyRelayStatus();
    vi.clearAllMocks();
  });

  it('渡したURLからrelaysを更新する', async () => {
    const urls = ['wss://relay.example.com', 'wss://other.relay.com'];
    const rxNostr = makeRxNostrMock({
      'wss://relay.example.com': 'connected'
    });
    getRxNostrMock.mockResolvedValue(rxNostr);

    await refreshRelayList(urls);

    const relays = getRelays();
    expect(relays).toHaveLength(2);
    expect(relays[0]).toEqual({ url: 'wss://relay.example.com', state: 'connected' });
    expect(relays[1]).toEqual({ url: 'wss://other.relay.com', state: 'initialized' });
  });

  it('空のURLリストを渡すとrelaysは空になる', async () => {
    const rxNostr = makeRxNostrMock();
    getRxNostrMock.mockResolvedValue(rxNostr);

    await refreshRelayList([]);

    expect(getRelays()).toEqual([]);
  });
});
