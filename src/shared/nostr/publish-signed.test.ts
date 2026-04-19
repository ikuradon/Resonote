import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PendingEvent } from './pending-publishes.js';

const mockCast = vi.fn();
const mockRxNostr = { cast: mockCast };

vi.mock('$shared/nostr/client.js', () => ({
  getRxNostr: vi.fn(async () => mockRxNostr)
}));

const mockAddPendingPublish = vi.fn();
const mockDrainPendingPublishes = vi.fn();

vi.mock('$shared/nostr/pending-publishes.js', () => ({
  addPendingPublish: (...args: unknown[]) => mockAddPendingPublish(...args),
  drainPendingPublishes: (...args: unknown[]) => mockDrainPendingPublishes(...args)
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
  mockDrainPendingPublishes.mockResolvedValue({
    emissions: [],
    settledCount: 0,
    retryingCount: 0
  });
  mockAddPendingPublish.mockResolvedValue(undefined);
  mockCast.mockResolvedValue(undefined);
});

describe('publishSignedEvent', () => {
  it('should publish via rxNostr.cast()', async () => {
    const { publishSignedEvent } = await import('./publish-signed.js');
    const event = makeEvent({ id: 'ev-1' });

    await publishSignedEvent(event);

    expect(mockCast).toHaveBeenCalledOnce();
    expect(mockCast).toHaveBeenCalledWith(event);
    expect(mockAddPendingPublish).not.toHaveBeenCalled();
  });

  it('should fall back to pending queue when cast() throws', async () => {
    const { publishSignedEvent } = await import('./publish-signed.js');
    mockCast.mockRejectedValueOnce(new Error('connection failed'));
    const event = makeEvent({ id: 'ev-fail' });

    await publishSignedEvent(event);

    expect(mockAddPendingPublish).toHaveBeenCalledOnce();
    expect(mockAddPendingPublish).toHaveBeenCalledWith(event);
  });

  it('should pass event object through to cast()', async () => {
    const { publishSignedEvent } = await import('./publish-signed.js');
    const event = makeEvent({
      id: 'ev-detail',
      kind: 1111,
      content: 'test comment',
      tags: [['e', 'parent-id']]
    });

    await publishSignedEvent(event);

    const passedArg = mockCast.mock.calls[0][0];
    expect(passedArg.id).toBe('ev-detail');
    expect(passedArg.kind).toBe(1111);
    expect(passedArg.content).toBe('test comment');
    expect(passedArg.tags).toEqual([['e', 'parent-id']]);
  });
});

describe('publishSignedEvents', () => {
  it('should return immediately for empty array', async () => {
    const { publishSignedEvents } = await import('./publish-signed.js');

    await publishSignedEvents([]);

    expect(mockCast).not.toHaveBeenCalled();
  });

  it('should publish a single event via cast()', async () => {
    const { publishSignedEvents } = await import('./publish-signed.js');
    const event = makeEvent({ id: 'single' });

    await publishSignedEvents([event]);

    expect(mockCast).toHaveBeenCalledOnce();
    expect(mockCast).toHaveBeenCalledWith(event);
  });

  it('should publish all events when all succeed', async () => {
    const { publishSignedEvents } = await import('./publish-signed.js');
    const events = [
      makeEvent({ id: 'ev-1' }),
      makeEvent({ id: 'ev-2' }),
      makeEvent({ id: 'ev-3' })
    ];

    await publishSignedEvents(events);

    expect(mockCast).toHaveBeenCalledTimes(3);
    expect(mockAddPendingPublish).not.toHaveBeenCalled();
  });

  it('should add failed events to pending queue', async () => {
    const { publishSignedEvents } = await import('./publish-signed.js');
    const events = [
      makeEvent({ id: 'ev-ok-1' }),
      makeEvent({ id: 'ev-fail' }),
      makeEvent({ id: 'ev-ok-2' })
    ];

    mockCast
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('relay down'))
      .mockResolvedValueOnce(undefined);

    await publishSignedEvents(events);

    expect(mockCast).toHaveBeenCalledTimes(3);
    expect(mockAddPendingPublish).toHaveBeenCalledOnce();
    expect(mockAddPendingPublish).toHaveBeenCalledWith(events[1]);
  });

  it('should import getRxNostr only once for batch', async () => {
    const { getRxNostr } = await import('./client.js');
    const { publishSignedEvents } = await import('./publish-signed.js');
    vi.mocked(getRxNostr).mockClear();

    const events = [makeEvent({ id: 'ev-1' }), makeEvent({ id: 'ev-2' })];

    await publishSignedEvents(events);

    expect(getRxNostr).toHaveBeenCalledOnce();
  });
});

describe('retryPendingPublishes', () => {
  it('delegates retry lifecycle to pending queue owner', async () => {
    const { retryPendingPublishes } = await import('./publish-signed.js');

    await retryPendingPublishes();

    expect(mockDrainPendingPublishes).toHaveBeenCalledOnce();
  });

  it('returns confirmed decision when cast succeeds', async () => {
    const { retryPendingPublishes } = await import('./publish-signed.js');
    let capturedDeliver: ((event: PendingEvent) => Promise<'confirmed' | 'retrying'>) | undefined;
    mockDrainPendingPublishes.mockImplementationOnce(async (deliver) => {
      capturedDeliver = deliver as (event: PendingEvent) => Promise<'confirmed' | 'retrying'>;
      return { emissions: [], settledCount: 0, retryingCount: 0 };
    });

    await retryPendingPublishes();

    expect(capturedDeliver).toBeTypeOf('function');
    const decision = await capturedDeliver!(makeEvent({ id: 'retry-1' }));
    expect(decision).toBe('confirmed');
  });

  it('returns retrying decision when cast fails', async () => {
    const { retryPendingPublishes } = await import('./publish-signed.js');
    let capturedDeliver: ((event: PendingEvent) => Promise<'confirmed' | 'retrying'>) | undefined;
    mockDrainPendingPublishes.mockImplementationOnce(async (deliver) => {
      capturedDeliver = deliver as (event: PendingEvent) => Promise<'confirmed' | 'retrying'>;
      return { emissions: [], settledCount: 0, retryingCount: 0 };
    });
    mockCast.mockRejectedValueOnce(new Error('still offline'));

    await retryPendingPublishes();

    expect(capturedDeliver).toBeTypeOf('function');
    const decision = await capturedDeliver!(makeEvent({ id: 'retry-fail' }));
    expect(decision).toBe('retrying');
  });

  it('does not re-queue inside retry path', async () => {
    const { retryPendingPublishes } = await import('./publish-signed.js');
    let capturedDeliver: ((event: PendingEvent) => Promise<'confirmed' | 'retrying'>) | undefined;
    mockDrainPendingPublishes.mockImplementationOnce(async (deliver) => {
      capturedDeliver = deliver as (event: PendingEvent) => Promise<'confirmed' | 'retrying'>;
      return { emissions: [], settledCount: 0, retryingCount: 0 };
    });
    mockCast.mockRejectedValueOnce(new Error('still offline'));

    await retryPendingPublishes();

    await capturedDeliver!(makeEvent({ id: 'retry-fail' }));
    expect(mockAddPendingPublish).not.toHaveBeenCalled();
  });

  it('passes events to session runtime cast in retry path', async () => {
    const { retryPendingPublishes } = await import('./publish-signed.js');
    const pending = makeEvent({ id: 'retry-pass-through' });
    mockDrainPendingPublishes.mockImplementationOnce(async (deliver) => {
      await (deliver as (event: PendingEvent) => Promise<'confirmed' | 'retrying'>)(pending);
      return { emissions: [], settledCount: 1, retryingCount: 0 };
    });

    await retryPendingPublishes();

    expect(mockCast).toHaveBeenCalledWith(pending);
  });
});
