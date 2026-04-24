import { createRuntimeRequestKey } from '@auftakt/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface SubscribeCallbacks {
  next?: (packet: { event: Record<string, unknown> }) => void;
  complete?: () => void;
  error?: (error: unknown) => void;
}

const { createRxBackwardReqMock, getRxNostrMock, subscribeMock } = vi.hoisted(() => ({
  createRxBackwardReqMock: vi.fn(() => ({
    emit: vi.fn(),
    over: vi.fn()
  })),
  getRxNostrMock: vi.fn(),
  subscribeMock: vi.fn<(callbacks: SubscribeCallbacks) => { unsubscribe(): void }>()
}));

vi.mock('@auftakt/core', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createRxBackwardReq: createRxBackwardReqMock
  };
});

vi.mock('./client.js', () => ({
  getRxNostr: getRxNostrMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn() })
}));

import { fetchBackwardEvents } from './query.js';

describe('fetchBackwardEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRxNostrMock.mockResolvedValue({
      use: () => ({
        subscribe: subscribeMock
      })
    });
  });

  it('returns partial events when the relay stream errors by default', async () => {
    subscribeMock.mockImplementation((callbacks) => {
      void Promise.resolve().then(() => {
        callbacks.next?.({
          event: { id: 'evt-1', pubkey: 'pk1', created_at: 1, content: 'hello', tags: [] }
        });
        callbacks.error?.(new Error('relay error'));
      });
      return { unsubscribe: vi.fn() };
    });

    await expect(fetchBackwardEvents([{ authors: ['pk1'], kinds: [0] }])).resolves.toEqual([
      { id: 'evt-1', pubkey: 'pk1', created_at: 1, content: 'hello', tags: [] }
    ]);
    expect(createRxBackwardReqMock).toHaveBeenCalledWith({
      requestKey: createRuntimeRequestKey({
        mode: 'backward',
        filters: [{ authors: ['pk1'], kinds: [0] }],
        scope: 'shared:nostr:query:fetchBackwardEvents'
      })
    });
  });

  it('rejects on relay errors when rejectOnError is enabled', async () => {
    subscribeMock.mockImplementation((callbacks) => {
      void Promise.resolve().then(() => {
        callbacks.next?.({
          event: { id: 'evt-1', pubkey: 'pk1', created_at: 1, content: 'hello', tags: [] }
        });
        callbacks.error?.(new Error('relay error'));
      });
      return { unsubscribe: vi.fn() };
    });

    await expect(
      fetchBackwardEvents([{ authors: ['pk1'], kinds: [0] }], { rejectOnError: true })
    ).rejects.toThrow('relay error');
  });
});
