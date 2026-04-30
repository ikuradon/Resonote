import { finalizeEvent } from '@auftakt/core';
import { describe, expect, it, vi } from 'vitest';

import { cachedFetchById } from './cached-read.js';

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
