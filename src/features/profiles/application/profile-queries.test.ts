import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getRxNostrMock, createRxBackwardReqMock, reqEmitMock, reqOverMock, logErrorMock } =
  vi.hoisted(() => {
    const reqEmitMock = vi.fn();
    const reqOverMock = vi.fn();
    return {
      getRxNostrMock: vi.fn(),
      createRxBackwardReqMock: vi.fn(),
      reqEmitMock,
      reqOverMock,
      logErrorMock: vi.fn()
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
    error: logErrorMock
  })
}));

import { fetchProfileComments } from './profile-queries.js';

const PUBKEY = 'aabbccdd'.repeat(8);

interface Observer {
  next: (p: unknown) => void;
  complete: () => void;
  error: (e: unknown) => void;
}

/**
 * subscribe 呼び出し時は一旦 subscription オブジェクトを返してから
 * マイクロタスクで events を emit / complete するモックを構築する。
 * これにより実装側の `const sub = rxNostr.use(req).subscribe(...)` の
 * TDZ を回避できる。
 */
function makeReq(
  packets: Array<{ event: { id: string; content: string; created_at: number; tags: string[][] } }>,
  errorToThrow?: unknown
) {
  const subscriptionMock = { unsubscribe: vi.fn() };
  const req = { emit: reqEmitMock, over: reqOverMock };

  const rxNostr = {
    use: vi.fn(() => ({
      subscribe: vi.fn((obs: Observer) => {
        // Return subscription first, then drive events asynchronously
        void Promise.resolve().then(() => {
          if (errorToThrow !== undefined) {
            obs.error(errorToThrow);
          } else {
            for (const packet of packets) {
              obs.next(packet);
            }
            obs.complete();
          }
        });
        return subscriptionMock;
      })
    }))
  };

  createRxBackwardReqMock.mockReturnValue(req);
  getRxNostrMock.mockResolvedValue(rxNostr);

  return { subscriptionMock };
}

describe('fetchProfileComments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty list when no events', async () => {
    makeReq([]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.comments).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.oldestTimestamp).toBeNull();
  });

  it('returns comments sorted by createdAt descending', async () => {
    makeReq([
      { event: { id: 'a', content: 'first', created_at: 100, tags: [] } },
      { event: { id: 'b', content: 'second', created_at: 200, tags: [] } }
    ]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.comments[0].id).toBe('b');
    expect(result.comments[1].id).toBe('a');
  });

  it('extracts iTag from I tag', async () => {
    makeReq([
      {
        event: {
          id: 'x',
          content: 'hello',
          created_at: 1000,
          tags: [['I', 'spotify:track:abc']]
        }
      }
    ]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.comments[0].iTag).toBe('spotify:track:abc');
  });

  it('sets iTag to null when no I tag', async () => {
    makeReq([
      { event: { id: 'y', content: 'no tag', created_at: 500, tags: [['e', 'some-event']] } }
    ]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.comments[0].iTag).toBeNull();
  });

  it('sets oldestTimestamp to smallest createdAt', async () => {
    makeReq([
      { event: { id: 'a', content: '', created_at: 300, tags: [] } },
      { event: { id: 'b', content: '', created_at: 100, tags: [] } },
      { event: { id: 'c', content: '', created_at: 200, tags: [] } }
    ]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.oldestTimestamp).toBe(100);
  });

  it('emits filter without until when not provided', async () => {
    makeReq([]);
    await fetchProfileComments(PUBKEY);
    expect(reqEmitMock).toHaveBeenCalledWith({ kinds: [1111], authors: [PUBKEY], limit: 20 });
  });

  it('emits filter with until when provided', async () => {
    makeReq([]);
    await fetchProfileComments(PUBKEY, 9999);
    expect(reqEmitMock).toHaveBeenCalledWith({
      kinds: [1111],
      authors: [PUBKEY],
      limit: 20,
      until: 9999
    });
  });

  it('sets hasMore=true when items.length >= 20', async () => {
    const packets = Array.from({ length: 20 }, (_, i) => ({
      event: { id: `id${i}`, content: '', created_at: i, tags: [] }
    }));
    makeReq(packets);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.hasMore).toBe(true);
  });

  it('rejects and logs error when subscription errors', async () => {
    const testError = new Error('relay error');
    makeReq([], testError);

    await expect(fetchProfileComments(PUBKEY)).rejects.toThrow('relay error');
    expect(logErrorMock).toHaveBeenCalledWith('Failed to load profile comments', testError);
  });
});
