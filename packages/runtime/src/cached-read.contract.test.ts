import { finalizeEvent } from '@auftakt/core';
import { describe, expect, it, vi } from 'vitest';

import { cachedFetchById, useCachedLatest } from './cached-read.js';

const RELAY_SECRET_KEY = new Uint8Array(32).fill(7);

describe('@auftakt/runtime cached by-id reads', () => {
  it('treats DB open failures as cache misses and keeps relay fallback', async () => {
    const relayEvent = finalizeEvent(
      {
        kind: 1,
        content: 'from relay fallback',
        tags: [],
        created_at: 123
      },
      RELAY_SECRET_KEY
    );
    const emitted: unknown[] = [];
    const runtime = {
      getEventsDB: vi.fn(async () => {
        throw new Error('db unavailable');
      }),
      async getRelaySession() {
        return {
          use() {
            return {
              subscribe(observer: {
                next?: (packet: { event?: unknown; from?: string }) => void;
                complete?: () => void;
              }) {
                queueMicrotask(() => {
                  observer.next?.({ event: relayEvent, from: 'wss://relay.example' });
                  observer.complete?.();
                });
                return { unsubscribe() {} };
              }
            };
          }
        };
      },
      createBackwardReq() {
        return {
          emit(input: unknown) {
            emitted.push(input);
          },
          over() {}
        };
      }
    };

    const result = await cachedFetchById(runtime, relayEvent.id);

    expect(result.event).toMatchObject({
      id: relayEvent.id,
      content: 'from relay fallback'
    });
    expect(emitted).toEqual([{ ids: [relayEvent.id] }]);
  });
});

describe('@auftakt/runtime cached latest reads', () => {
  it('keeps newer kind10002 relay list when an older relay event arrives late', async () => {
    const newerRelayList = finalizeEvent(
      {
        kind: 10002,
        content: '',
        tags: [['r', 'wss://new.example.test']],
        created_at: 1000
      },
      RELAY_SECRET_KEY
    );
    const olderRelayList = finalizeEvent(
      {
        kind: 10002,
        content: '',
        tags: [['r', 'wss://old.example.test']],
        created_at: 500
      },
      RELAY_SECRET_KEY
    );
    const emitted: unknown[] = [];
    const runtime = {
      getEventsDB: vi.fn(async () => ({
        getById: vi.fn(async () => null),
        getByPubkeyAndKind: vi.fn(async () => newerRelayList),
        put: vi.fn(async () => true),
        putWithReconcile: vi.fn(async (candidate: typeof newerRelayList) => ({
          stored: candidate.created_at > 500
        }))
      })),
      async getRelaySession() {
        return {
          use() {
            return {
              subscribe(observer: {
                next?: (packet: { event?: unknown; from?: string }) => void;
                complete?: () => void;
              }) {
                queueMicrotask(() => {
                  observer.next?.({ event: olderRelayList, from: 'wss://old-relay.example.test' });
                  observer.complete?.();
                });
                return { unsubscribe() {} };
              }
            };
          }
        };
      },
      createBackwardReq() {
        return {
          emit(input: unknown) {
            emitted.push(input);
          },
          over() {}
        };
      }
    };

    const driver = useCachedLatest<typeof newerRelayList>(runtime, newerRelayList.pubkey, 10002);

    await vi.waitFor(() => {
      expect(driver.getSnapshot().event?.tags).toEqual([['r', 'wss://new.example.test']]);
      expect(driver.getSnapshot().settlement.phase).toBe('settled');
    });

    expect(emitted).toEqual([{ kinds: [10002], authors: [newerRelayList.pubkey], limit: 1 }]);
    driver.destroy();
  });
});
