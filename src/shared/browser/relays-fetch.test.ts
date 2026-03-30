import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getRxNostrMock, createRxBackwardReqMock, reqEmitMock, reqOverMock, publishRelayListMock } =
  vi.hoisted(() => {
    const reqEmitMock = vi.fn();
    const reqOverMock = vi.fn();
    return {
      getRxNostrMock: vi.fn(),
      createRxBackwardReqMock: vi.fn(),
      reqEmitMock,
      reqOverMock,
      publishRelayListMock: vi.fn(async () => ['wss://relay.example.com'])
    };
  });

vi.mock('$shared/nostr/gateway.js', () => ({
  getRxNostr: getRxNostrMock
}));

vi.mock('rx-nostr', () => ({
  createRxBackwardReq: createRxBackwardReqMock
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
  DEFAULT_RELAYS: ['wss://relay.damus.io']
}));

vi.mock('$shared/nostr/events.js', () => ({
  RELAY_LIST_KIND: 10002,
  FOLLOW_KIND: 3
}));

vi.mock('$features/relays/domain/relay-model.js', () => ({
  parseRelayTags: (tags: string[][]): { url: string; read: boolean; write: boolean }[] => {
    return tags
      .filter((t) => t[0] === 'r' && t[1])
      .map((t) => ({ url: t[1], read: true, write: true }));
  }
}));

vi.mock('$features/relays/application/relay-actions.js', () => ({
  publishRelayList: publishRelayListMock
}));

import {
  destroyRelayStatus,
  fetchRelayList,
  getRelays,
  publishRelayList
} from './relays.svelte.js';

interface Observer {
  next: (p: unknown) => void;
  complete: () => void;
  error: (e: unknown) => void;
}

function makeBackwardReqMock(
  packets: Array<{ event: { tags: string[][]; created_at?: number; content?: string } }>,
  errorToThrow?: unknown
) {
  const subscriptionMock = { unsubscribe: vi.fn() };
  const req = { emit: reqEmitMock, over: reqOverMock };

  const rxNostr = {
    getRelayStatus: vi.fn(() => null),
    createConnectionStateObservable: vi.fn(() => ({
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() }))
    })),
    use: vi.fn(() => ({
      subscribe: vi.fn((obs: Observer) => {
        void Promise.resolve().then(() => {
          if (errorToThrow) {
            obs.error(errorToThrow);
          } else {
            for (const p of packets) obs.next(p);
            obs.complete();
          }
        });
        return subscriptionMock;
      })
    }))
  };

  createRxBackwardReqMock.mockReturnValue(req);
  return rxNostr;
}

const PUBKEY = 'aabbccdd'.repeat(8);

describe('fetchRelayList', () => {
  beforeEach(() => {
    destroyRelayStatus();
    vi.clearAllMocks();
  });

  it('returns kind10002 entries when kind:10002 has relay tags', async () => {
    const rxNostr = makeBackwardReqMock([
      { event: { created_at: 1000, tags: [['r', 'wss://relay.example.com']] } }
    ]);
    getRxNostrMock.mockResolvedValue(rxNostr);

    const result = await fetchRelayList(PUBKEY);

    expect(result.source).toBe('kind10002');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].url).toBe('wss://relay.example.com');
  });

  it('falls back to kind3 when kind:10002 returns no relay tags', async () => {
    const subscriptionMock = { unsubscribe: vi.fn() };
    const req = { emit: reqEmitMock, over: reqOverMock };

    let callCount = 0;
    const rxNostr = {
      getRelayStatus: vi.fn(() => null),
      createConnectionStateObservable: vi.fn(() => ({
        subscribe: vi.fn(() => ({ unsubscribe: vi.fn() }))
      })),
      use: vi.fn(() => ({
        subscribe: vi.fn((obs: Observer) => {
          callCount += 1;
          const currentCall = callCount;
          void Promise.resolve().then(() => {
            if (currentCall === 1) {
              // kind:10002 - no relay tags
              obs.next({ event: { created_at: 1000, tags: [] } });
              obs.complete();
            } else {
              // kind:3 - has relay in content
              obs.next({
                event: {
                  created_at: 1000,
                  tags: [],
                  content: JSON.stringify({
                    'wss://fallback.relay.com': { read: true, write: true }
                  })
                }
              });
              obs.complete();
            }
          });
          return subscriptionMock;
        })
      }))
    };

    createRxBackwardReqMock.mockReturnValue(req);
    getRxNostrMock.mockResolvedValue(rxNostr);

    const result = await fetchRelayList(PUBKEY);

    expect(result.source).toBe('kind3');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].url).toBe('wss://fallback.relay.com');
  });

  it('returns source=none when both kind:10002 and kind:3 have no entries', async () => {
    const subscriptionMock = { unsubscribe: vi.fn() };
    const req = { emit: reqEmitMock, over: reqOverMock };

    const rxNostr = {
      getRelayStatus: vi.fn(() => null),
      createConnectionStateObservable: vi.fn(() => ({
        subscribe: vi.fn(() => ({ unsubscribe: vi.fn() }))
      })),
      use: vi.fn(() => ({
        subscribe: vi.fn((obs: Observer) => {
          void Promise.resolve().then(() => {
            obs.complete();
          });
          return subscriptionMock;
        })
      }))
    };

    createRxBackwardReqMock.mockReturnValue(req);
    getRxNostrMock.mockResolvedValue(rxNostr);

    const result = await fetchRelayList(PUBKEY);

    expect(result.source).toBe('none');
    expect(result.entries).toEqual([]);
  });

  it('returns null on kind:10002 error and falls through to kind3', async () => {
    const subscriptionMock = { unsubscribe: vi.fn() };
    const req = { emit: reqEmitMock, over: reqOverMock };

    let callCount = 0;
    const rxNostr = {
      getRelayStatus: vi.fn(() => null),
      createConnectionStateObservable: vi.fn(() => ({
        subscribe: vi.fn(() => ({ unsubscribe: vi.fn() }))
      })),
      use: vi.fn(() => ({
        subscribe: vi.fn((obs: Observer) => {
          callCount += 1;
          const currentCall = callCount;
          void Promise.resolve().then(() => {
            if (currentCall === 1) {
              obs.error(new Error('timeout'));
            } else {
              obs.complete();
            }
          });
          return subscriptionMock;
        })
      }))
    };

    createRxBackwardReqMock.mockReturnValue(req);
    getRxNostrMock.mockResolvedValue(rxNostr);

    const result = await fetchRelayList(PUBKEY);

    expect(result.source).toBe('none');
    // Verify kind:10002 failed and kind:3 fallback was attempted (2 subscriptions)
    expect(rxNostr.use).toHaveBeenCalledTimes(2);
    // Verify emit was called with kind:10002 filter first, then kind:3
    expect(reqEmitMock).toHaveBeenCalledTimes(2);
  });
});

describe('publishRelayList', () => {
  beforeEach(() => {
    destroyRelayStatus();
    vi.clearAllMocks();
  });

  it('calls publishRelayList action and refreshes relay list', async () => {
    publishRelayListMock.mockResolvedValue(['wss://published.relay.com']);
    const rxNostr = {
      getRelayStatus: vi.fn(() => null),
      createConnectionStateObservable: vi.fn(() => ({
        subscribe: vi.fn(() => ({ unsubscribe: vi.fn() }))
      }))
    };
    getRxNostrMock.mockResolvedValue(rxNostr);

    const entries = [{ url: 'wss://published.relay.com', read: true, write: true }];
    await publishRelayList(entries);

    expect(publishRelayListMock).toHaveBeenCalledWith(entries);
    const relays = getRelays();
    expect(relays).toHaveLength(1);
    expect(relays[0].url).toBe('wss://published.relay.com');
  });
});
