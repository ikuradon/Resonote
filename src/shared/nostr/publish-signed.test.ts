import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PendingEvent } from './pending-publishes.js';

const publishSignedEventMock = vi.fn<(event: unknown) => Promise<void>>(async () => undefined);
const publishSignedEventsMock = vi.fn<(events: unknown[]) => Promise<void>>(async () => undefined);
const retryQueuedPublishesMock = vi.fn<() => Promise<void>>(async () => undefined);

vi.mock('$shared/auftakt/resonote.js', () => ({
  publishSignedEvent: (event: unknown) => publishSignedEventMock(event),
  publishSignedEvents: (events: unknown[]) => publishSignedEventsMock(events),
  retryQueuedPublishes: () => retryQueuedPublishesMock()
}));

function makeEvent(overrides: Partial<PendingEvent> = {}): PendingEvent {
  return {
    id: overrides.id ?? 'event-1',
    kind: overrides.kind ?? 1,
    pubkey: overrides.pubkey ?? 'pk-1',
    created_at: overrides.created_at ?? Math.floor(Date.now() / 1000),
    tags: overrides.tags ?? [],
    content: overrides.content ?? 'hello',
    sig: overrides.sig ?? 'sig-1'
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  publishSignedEventMock.mockResolvedValue(undefined);
  publishSignedEventsMock.mockResolvedValue(undefined);
  retryQueuedPublishesMock.mockResolvedValue(undefined);
});

describe('publishSignedEvent', () => {
  it('delegates to the auftakt facade', async () => {
    const { publishSignedEvent } = await import('./publish-signed.js');
    const event = makeEvent({ id: 'ev-1' });

    await publishSignedEvent(event);

    expect(publishSignedEventMock).toHaveBeenCalledOnce();
    expect(publishSignedEventMock).toHaveBeenCalledWith(event);
  });

  it('passes event object through unchanged', async () => {
    const { publishSignedEvent } = await import('./publish-signed.js');
    const event = makeEvent({
      id: 'ev-detail',
      kind: 1111,
      content: 'test comment',
      tags: [['e', 'parent-id']]
    });

    await publishSignedEvent(event);

    expect(publishSignedEventMock).toHaveBeenCalledTimes(1);
    const passedArg = publishSignedEventMock.mock.calls[0][0] as PendingEvent;
    expect(passedArg.id).toBe('ev-detail');
    expect(passedArg.kind).toBe(1111);
    expect(passedArg.content).toBe('test comment');
    expect(passedArg.tags).toEqual([['e', 'parent-id']]);
  });
});

describe('publishSignedEvents', () => {
  it('delegates empty array to the facade unchanged', async () => {
    const { publishSignedEvents } = await import('./publish-signed.js');

    await publishSignedEvents([]);

    expect(publishSignedEventsMock).toHaveBeenCalledOnce();
    expect(publishSignedEventsMock).toHaveBeenCalledWith([]);
  });

  it('delegates a single event array to the facade', async () => {
    const { publishSignedEvents } = await import('./publish-signed.js');
    const event = makeEvent({ id: 'single' });

    await publishSignedEvents([event]);

    expect(publishSignedEventsMock).toHaveBeenCalledOnce();
    expect(publishSignedEventsMock).toHaveBeenCalledWith([event]);
  });

  it('delegates all events to the facade', async () => {
    const { publishSignedEvents } = await import('./publish-signed.js');
    const events = [
      makeEvent({ id: 'ev-1' }),
      makeEvent({ id: 'ev-2' }),
      makeEvent({ id: 'ev-3' })
    ];

    await publishSignedEvents(events);

    expect(publishSignedEventsMock).toHaveBeenCalledOnce();
    expect(publishSignedEventsMock).toHaveBeenCalledWith(events);
  });
});

describe('retryPendingPublishes', () => {
  it('delegates retry lifecycle to the auftakt facade', async () => {
    const { retryPendingPublishes } = await import('./publish-signed.js');

    await retryPendingPublishes();

    expect(retryQueuedPublishesMock).toHaveBeenCalledOnce();
  });
});
