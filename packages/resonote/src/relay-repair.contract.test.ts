import type { RequestKey, StoredEvent } from '@auftakt/core';
import { describe, expect, it } from 'vitest';

import { repairEventsFromRelay, type ResonoteRuntime } from './runtime.js';

function hexId(seed: string): string {
  return seed.repeat(64);
}

function makeEvent(id: string, overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id,
    pubkey: overrides.pubkey ?? 'pubkey-a',
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [['p', 'pubkey-a']],
    content: overrides.content ?? 'hello',
    created_at: overrides.created_at ?? 100
  };
}

function encodeNegentropyIdList(ids: readonly string[]): string {
  return `61000002${ids.length.toString(16).padStart(2, '0')}${ids.join('')}`;
}

class FakeBackwardRequest {
  readonly emitted: Array<Record<string, unknown>> = [];

  emit(input: unknown): void {
    this.emitted.push(input as Record<string, unknown>);
  }

  over(): void {}
}

function createRuntimeFixture(options: {
  localRefs: Array<Pick<StoredEvent, 'id' | 'pubkey' | 'created_at' | 'kind' | 'tags'>>;
  negentropyResult?: {
    capability: 'supported' | 'unsupported' | 'failed';
    reason?: string;
    messageHex?: string;
  };
  fallbackEvents?: StoredEvent[];
  relayEventsById?: Record<string, StoredEvent>;
}) {
  const createdRequestKeys: RequestKey[] = [];
  const materialized: StoredEvent[] = [];

  const session = {
    requestNegentropySync: options.negentropyResult
      ? async () => options.negentropyResult
      : undefined,
    use(req: FakeBackwardRequest) {
      return {
        subscribe(observer: {
          next?: (packet: { event: StoredEvent }) => void;
          complete?: () => void;
        }) {
          queueMicrotask(() => {
            const ids = req.emitted.flatMap((filter) =>
              Array.isArray(filter.ids)
                ? filter.ids.filter((value): value is string => typeof value === 'string')
                : []
            );

            const events =
              ids.length > 0
                ? ids
                    .map((id) => options.relayEventsById?.[id])
                    .filter((event): event is StoredEvent => event !== undefined)
                : (options.fallbackEvents ?? []);

            for (const event of events) {
              observer.next?.({ event });
            }
            observer.complete?.();
          });

          return {
            unsubscribe() {}
          };
        }
      };
    }
  };

  const runtime: ResonoteRuntime = {
    async fetchBackwardEvents() {
      return [];
    },
    async fetchBackwardFirst() {
      return null;
    },
    async fetchLatestEvent() {
      return null;
    },
    async getEventsDB() {
      return {
        async getByPubkeyAndKind() {
          return null;
        },
        async getManyByPubkeysAndKind() {
          return [];
        },
        async getByReplaceKey() {
          return null;
        },
        async getByTagValue() {
          return [];
        },
        async getById() {
          return null;
        },
        async listNegentropyEventRefs() {
          return options.localRefs;
        },
        async put(event: StoredEvent) {
          materialized.push(event);
          return true;
        },
        async putWithReconcile(event: StoredEvent) {
          materialized.push(event);
          return {
            stored: true,
            emissions: [
              {
                subjectId: event.id,
                reason: 'accepted-new' as const,
                state: 'confirmed' as const
              }
            ]
          };
        }
      };
    },
    async getRxNostr() {
      return session as unknown;
    },
    createRxBackwardReq(options) {
      if (options?.requestKey) {
        createdRequestKeys.push(options.requestKey);
      }
      return new FakeBackwardRequest() as unknown;
    },
    createRxForwardReq() {
      throw new Error('not used in relay repair contract tests');
    },
    uniq() {
      return {};
    },
    merge() {
      return {
        subscribe() {
          return { unsubscribe() {} };
        }
      };
    },
    async getRelayConnectionState() {
      return null;
    },
    async observeRelayConnectionStates() {
      return { unsubscribe() {} };
    }
  };

  return {
    createdRequestKeys,
    materialized,
    runtime
  };
}

describe('@auftakt/resonote relay repair contract', () => {
  it('falls back to canonical backward repair when negentropy is unsupported', async () => {
    const missingEvent = makeEvent(hexId('b'), { created_at: 200 });
    const fixture = createRuntimeFixture({
      localRefs: [makeEvent(hexId('a'))],
      negentropyResult: {
        capability: 'unsupported',
        reason: 'unsupported: relay disabled negentropy'
      },
      fallbackEvents: [missingEvent]
    });

    await expect(
      repairEventsFromRelay(fixture.runtime, {
        filters: [{ authors: ['pubkey-a'], kinds: [1] }],
        relayUrl: 'wss://relay.contract.test'
      })
    ).resolves.toEqual({
      strategy: 'fallback',
      capability: 'unsupported',
      repairedIds: [missingEvent.id],
      materializationEmissions: [
        {
          subjectId: missingEvent.id,
          reason: 'accepted-new',
          state: 'confirmed'
        }
      ],
      repairEmissions: [
        {
          subjectId: missingEvent.id,
          reason: 'repaired-replay',
          state: 'repairing'
        }
      ]
    });

    expect(fixture.createdRequestKeys).toHaveLength(1);
    expect(fixture.materialized).toEqual([missingEvent]);
  });

  it('materializes negentropy-discovered events through reconcile and emits repaired-negentropy', async () => {
    const localEvent = makeEvent(hexId('a'), { created_at: 100 });
    const missingEvent = makeEvent(hexId('b'), { created_at: 200 });
    const fixture = createRuntimeFixture({
      localRefs: [localEvent],
      negentropyResult: {
        capability: 'supported',
        messageHex: encodeNegentropyIdList([localEvent.id, missingEvent.id])
      },
      relayEventsById: {
        [missingEvent.id]: missingEvent
      }
    });

    await expect(
      repairEventsFromRelay(fixture.runtime, {
        filters: [{ authors: ['pubkey-a'], kinds: [1] }],
        relayUrl: 'wss://relay.contract.test'
      })
    ).resolves.toEqual({
      strategy: 'negentropy',
      capability: 'supported',
      repairedIds: [missingEvent.id],
      materializationEmissions: [
        {
          subjectId: missingEvent.id,
          reason: 'accepted-new',
          state: 'confirmed'
        }
      ],
      repairEmissions: [
        {
          subjectId: missingEvent.id,
          reason: 'repaired-negentropy',
          state: 'repairing'
        }
      ]
    });

    expect(fixture.createdRequestKeys).toHaveLength(1);
    expect(fixture.materialized).toEqual([missingEvent]);
  });
});
