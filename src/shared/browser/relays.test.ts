import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchRelayListEventsMock,
  observeRelayStatusesMock,
  snapshotRelayStatusesMock,
  fetchRelayListSourcesMock
} = vi.hoisted(() => ({
  fetchRelayListEventsMock: vi.fn(),
  observeRelayStatusesMock: vi.fn(),
  snapshotRelayStatusesMock: vi.fn(),
  fetchRelayListSourcesMock: vi.fn()
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  fetchRelayListEvents: fetchRelayListEventsMock,
  observeRelayStatuses: observeRelayStatusesMock,
  snapshotRelayStatuses: snapshotRelayStatusesMock,
  fetchRelayListSources: fetchRelayListSourcesMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
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
  parseRelayTags: (tags: string[][]): { url: string; read: boolean; write: boolean }[] =>
    tags
      .filter((t) => t[0] === 'r' && t[1])
      .map((t) => {
        const url = t[1];
        const marker = t[2];
        if (marker === 'read') return { url, read: true, write: false };
        if (marker === 'write') return { url, read: false, write: true };
        return { url, read: true, write: true };
      })
}));

import {
  destroyRelayStatus,
  getAggregateRelaySessionState,
  getRelays,
  initRelayStatus,
  refreshRelayList
} from './relays.svelte.js';

function setupRelayGatewayMocks(connectionStates: Partial<Record<string, string>> = {}) {
  snapshotRelayStatusesMock.mockImplementation(async (urls: string[]) =>
    urls.map((url) => {
      const state = connectionStates[url];
      const connection = state ?? 'idle';
      return {
        url,
        relay: {
          url,
          connection,
          replaying: connection === 'replaying',
          degraded:
            connection === 'degraded' || connection === 'backoff' || connection === 'closed',
          reason: 'opened'
        },
        aggregate: {
          state: connection === 'open' ? 'live' : 'connecting',
          reason: connection === 'open' ? 'relay-opened' : 'relay-disconnected',
          relays: []
        }
      };
    })
  );

  let callback:
    | ((packet: {
        from: string;
        state: string;
        reason: string;
        relay: {
          url: string;
          connection: string;
          replaying: boolean;
          degraded: boolean;
          reason: string;
        };
        aggregate: {
          state: string;
          reason: string;
          relays: unknown[];
        };
      }) => void)
    | undefined;
  const unsubscribe = vi.fn();
  observeRelayStatusesMock.mockImplementation(async (cb) => {
    callback = cb;
    return { unsubscribe };
  });

  return {
    emit(packet: {
      from: string;
      state: string;
      relayConnection?: string;
      reason?: string;
      aggregateState?: string;
    }) {
      const reason = packet.reason ?? 'opened';
      const relayConnection = packet.relayConnection ?? packet.state;
      callback?.({
        from: packet.from,
        state: packet.state,
        reason,
        relay: {
          url: packet.from,
          connection: relayConnection,
          replaying: relayConnection === 'replaying',
          degraded:
            relayConnection === 'degraded' ||
            relayConnection === 'backoff' ||
            relayConnection === 'closed',
          reason
        },
        aggregate: {
          state: packet.aggregateState ?? (packet.state === 'replaying' ? 'replaying' : 'live'),
          reason: packet.aggregateState === 'degraded' ? 'relay-degraded' : 'relay-opened',
          relays: []
        }
      });
    },
    unsubscribe
  };
}

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
    setupRelayGatewayMocks({
      'wss://relay.damus.io': 'open',
      'wss://yabu.me': 'connecting'
    });

    await initRelayStatus();

    const relays = getRelays();
    expect(relays).toHaveLength(2);
    expect(relays[0]).toEqual({ url: 'wss://relay.damus.io', state: 'connected' });
    expect(relays[1]).toEqual({ url: 'wss://yabu.me', state: 'connecting' });
  });

  it('getRelayConnectionStateがnullの場合はinitializedをデフォルトにする', async () => {
    setupRelayGatewayMocks();

    await initRelayStatus();

    const relays = getRelays();
    expect(relays[0].state).toBe('initialized');
    expect(relays[1].state).toBe('initialized');
  });

  it('adapter state names are normalized to UI relay states', async () => {
    setupRelayGatewayMocks({
      'wss://relay.damus.io': 'open',
      'wss://yabu.me': 'backoff'
    });

    await initRelayStatus();

    const relays = getRelays();
    expect(relays[0]).toEqual({ url: 'wss://relay.damus.io', state: 'connected' });
    expect(relays[1]).toEqual({ url: 'wss://yabu.me', state: 'waiting-for-retrying' });
  });

  it('2回目の呼び出しは再購読しない', async () => {
    setupRelayGatewayMocks();

    await initRelayStatus();
    await initRelayStatus();

    expect(observeRelayStatusesMock).toHaveBeenCalledOnce();
  });

  it('接続状態コールバックで既存リレーの状態を更新する', async () => {
    const gateway = setupRelayGatewayMocks();

    await initRelayStatus();
    gateway.emit({ from: 'wss://relay.damus.io', state: 'open', aggregateState: 'live' });

    const relays = getRelays();
    const damusRelay = relays.find((r) => r.url === 'wss://relay.damus.io');
    expect(damusRelay?.state).toBe('connected');
  });

  it('接続状態コールバックで未知リレーを追加する', async () => {
    const gateway = setupRelayGatewayMocks();

    await initRelayStatus();
    gateway.emit({
      from: 'wss://new-relay.example.com',
      state: 'open',
      aggregateState: 'live'
    });

    const relays = getRelays();
    const newRelay = relays.find((r) => r.url === 'wss://new-relay.example.com');
    expect(newRelay).toBeDefined();
    expect(newRelay?.state).toBe('connected');
  });

  it('接続状態コールバックでも adapter state を正規化する', async () => {
    const gateway = setupRelayGatewayMocks();

    await initRelayStatus();
    gateway.emit({ from: 'wss://new-relay.example.com', state: 'open', aggregateState: 'live' });

    const relays = getRelays();
    const newRelay = relays.find((r) => r.url === 'wss://new-relay.example.com');
    expect(newRelay?.state).toBe('connected');
  });

  it('packet の canonical relay.connection を UI state の正規化元にする', async () => {
    const gateway = setupRelayGatewayMocks();

    await initRelayStatus();
    gateway.emit({
      from: 'wss://new-relay.example.com',
      state: 'closed',
      relayConnection: 'open',
      aggregateState: 'live'
    });

    const relays = getRelays();
    const newRelay = relays.find((r) => r.url === 'wss://new-relay.example.com');
    expect(newRelay?.state).toBe('connected');
  });

  it('destroy 後に再度 initRelayStatus できる', async () => {
    setupRelayGatewayMocks();

    await initRelayStatus();
    destroyRelayStatus();
    expect(getRelays()).toEqual([]);

    await initRelayStatus();
    expect(getRelays()).toHaveLength(2);
  });

  it('destroyRelayStatus は subscription を解除する', async () => {
    const gateway = setupRelayGatewayMocks();

    await initRelayStatus();
    destroyRelayStatus();

    expect(gateway.unsubscribe).toHaveBeenCalledOnce();
  });

  it('pubkeyを渡すとユーザーのリレーリストを使用する', async () => {
    setupRelayGatewayMocks({
      'wss://user.relay.com': 'open'
    });
    fetchRelayListSourcesMock.mockResolvedValue({
      relayListEvents: [
        {
          id: '1',
          pubkey: 'user-pubkey',
          created_at: 1000,
          kind: 10002,
          tags: [['r', 'wss://user.relay.com']],
          content: '',
          sig: ''
        }
      ],
      followListEvents: []
    });

    await initRelayStatus('user-pubkey-123');

    expect(snapshotRelayStatusesMock).toHaveBeenCalledWith(['wss://user.relay.com']);
  });

  it('fetchRelayList失敗時はDEFAULT_RELAYSにフォールバック', async () => {
    setupRelayGatewayMocks();
    fetchRelayListSourcesMock.mockRejectedValue(new Error('Network error'));

    await initRelayStatus('user-pubkey-123');

    expect(snapshotRelayStatusesMock).toHaveBeenCalledWith([
      'wss://relay.damus.io',
      'wss://yabu.me'
    ]);
  });

  it('runtime aggregate state を参照できる', async () => {
    const gateway = setupRelayGatewayMocks();

    await initRelayStatus();
    gateway.emit({
      from: 'wss://relay.damus.io',
      state: 'replaying',
      reason: 'replay-started',
      aggregateState: 'replaying'
    });
    expect(getAggregateRelaySessionState()).toBe('replaying');

    gateway.emit({
      from: 'wss://relay.damus.io',
      state: 'degraded',
      reason: 'replay-failed',
      aggregateState: 'degraded'
    });
    expect(getAggregateRelaySessionState()).toBe('degraded');
  });
});

describe('refreshRelayList', () => {
  beforeEach(() => {
    destroyRelayStatus();
    vi.clearAllMocks();
  });

  it('渡したURLからrelaysを更新する', async () => {
    setupRelayGatewayMocks({
      'wss://relay.example.com': 'open'
    });

    await refreshRelayList(['wss://relay.example.com', 'wss://other.relay.com']);

    const relays = getRelays();
    expect(relays).toHaveLength(2);
    expect(relays[0]).toEqual({ url: 'wss://relay.example.com', state: 'connected' });
    expect(relays[1]).toEqual({ url: 'wss://other.relay.com', state: 'initialized' });
  });

  it('空のURLリストを渡すとrelaysは空になる', async () => {
    setupRelayGatewayMocks();

    await refreshRelayList([]);

    expect(getRelays()).toEqual([]);
  });
});
