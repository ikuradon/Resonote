import { createRuntimeRequestKey, finalizeEvent } from '@auftakt/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface SubscribeCallbacks {
  next?: (packet: { event: unknown }) => void;
  complete?: () => void;
  error?: (error: unknown) => void;
}

const { createRxBackwardReqMock, dbPutMock, getRxNostrMock, subscribeMock } = vi.hoisted(() => ({
  createRxBackwardReqMock: vi.fn(() => ({
    emit: vi.fn(),
    over: vi.fn()
  })),
  dbPutMock: vi.fn(async () => true),
  getRxNostrMock: vi.fn(),
  subscribeMock: vi.fn<(callbacks: SubscribeCallbacks) => { unsubscribe(): void }>()
}));

vi.mock('@auftakt/core', async (importOriginal) => {
  const actual = await importOriginal();
  return Object.assign({}, actual, {
    createRxBackwardReq: createRxBackwardReqMock
  });
});

vi.mock('./client.js', () => ({
  getRxNostr: getRxNostrMock
}));

vi.mock('./event-db.js', () => ({
  getEventsDB: async () => ({
    put: dbPutMock
  })
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn() })
}));

import { fetchBackwardEvents } from './query.js';

const RELAY_SECRET_KEY = new Uint8Array(32).fill(2);

function signedRelayEvent(overrides: { content: string; kind: number; created_at: number }) {
  return finalizeEvent(
    {
      content: overrides.content,
      kind: overrides.kind,
      created_at: overrides.created_at,
      tags: []
    },
    RELAY_SECRET_KEY
  );
}

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
    const event = signedRelayEvent({ content: 'hello', created_at: 1, kind: 0 });
    subscribeMock.mockImplementation((callbacks) => {
      void Promise.resolve().then(() => {
        callbacks.next?.({
          event
        });
        callbacks.error?.(new Error('relay error'));
      });
      return { unsubscribe: vi.fn() };
    });

    await expect(fetchBackwardEvents([{ authors: ['pk1'], kinds: [0] }])).resolves.toEqual([event]);
    expect(createRxBackwardReqMock).toHaveBeenCalledWith({
      requestKey: createRuntimeRequestKey({
        mode: 'backward',
        filters: [{ authors: ['pk1'], kinds: [0] }],
        scope: 'resonote:coordinator:fetchBackwardEvents'
      })
    });
  });

  it('rejects on relay errors when rejectOnError is enabled', async () => {
    const event = signedRelayEvent({ content: 'hello', created_at: 1, kind: 0 });
    subscribeMock.mockImplementation((callbacks) => {
      void Promise.resolve().then(() => {
        callbacks.next?.({
          event
        });
        callbacks.error?.(new Error('relay error'));
      });
      return { unsubscribe: vi.fn() };
    });

    await expect(
      fetchBackwardEvents([{ authors: ['pk1'], kinds: [0] }], {
        rejectOnError: true
      })
    ).rejects.toThrow('relay error');
  });
});
