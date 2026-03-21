import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PendingEvent } from './pending-publishes.js';

const mockCast = vi.fn();
const mockRxNostr = { cast: mockCast };

vi.mock('$shared/nostr/client.js', () => ({
  getRxNostr: vi.fn(async () => mockRxNostr)
}));

const mockAddPendingPublish = vi.fn();
const mockGetPendingPublishes = vi.fn();
const mockRemovePendingPublish = vi.fn();
const mockCleanExpired = vi.fn();

vi.mock('$shared/nostr/pending-publishes.js', () => ({
  addPendingPublish: (...args: unknown[]) => mockAddPendingPublish(...args),
  getPendingPublishes: (...args: unknown[]) => mockGetPendingPublishes(...args),
  removePendingPublish: (...args: unknown[]) => mockRemovePendingPublish(...args),
  cleanExpired: (...args: unknown[]) => mockCleanExpired(...args)
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
  mockGetPendingPublishes.mockResolvedValue([]);
  mockAddPendingPublish.mockResolvedValue(undefined);
  mockRemovePendingPublish.mockResolvedValue(undefined);
  mockCleanExpired.mockResolvedValue(undefined);
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
  it('should do nothing when queue is empty', async () => {
    const { retryPendingPublishes } = await import('./publish-signed.js');
    mockGetPendingPublishes.mockResolvedValueOnce([]);

    await retryPendingPublishes();

    expect(mockCleanExpired).toHaveBeenCalledOnce();
    expect(mockGetPendingPublishes).toHaveBeenCalledOnce();
    expect(mockCast).not.toHaveBeenCalled();
  });

  it('should retry pending events and remove successful ones', async () => {
    const { retryPendingPublishes } = await import('./publish-signed.js');
    const pending = [makeEvent({ id: 'retry-1' }), makeEvent({ id: 'retry-2' })];
    mockGetPendingPublishes.mockResolvedValueOnce(pending);

    await retryPendingPublishes();

    expect(mockCast).toHaveBeenCalledTimes(2);
    expect(mockRemovePendingPublish).toHaveBeenCalledTimes(2);
    expect(mockRemovePendingPublish).toHaveBeenCalledWith('retry-1');
    expect(mockRemovePendingPublish).toHaveBeenCalledWith('retry-2');
  });

  it('should re-queue failed events via addPendingPublish', async () => {
    const { retryPendingPublishes } = await import('./publish-signed.js');
    const pending = [
      makeEvent({ id: 'ok-1' }),
      makeEvent({ id: 'fail-1' }),
      makeEvent({ id: 'ok-2' })
    ];
    mockGetPendingPublishes.mockResolvedValueOnce(pending);
    mockCast
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('still down'))
      .mockResolvedValueOnce(undefined);

    await retryPendingPublishes();

    // publishSignedEvent catches cast() errors internally and adds to pending,
    // so removePendingPublish is called for all events (publishSignedEvent never throws)
    expect(mockRemovePendingPublish).toHaveBeenCalledTimes(3);
    // The failed event is re-added to the pending queue by publishSignedEvent's catch
    expect(mockAddPendingPublish).toHaveBeenCalledOnce();
    expect(mockAddPendingPublish).toHaveBeenCalledWith(pending[1]);
  });

  it('should call cleanExpired before processing', async () => {
    const { retryPendingPublishes } = await import('./publish-signed.js');
    const callOrder: string[] = [];
    mockCleanExpired.mockImplementation(async () => {
      callOrder.push('cleanExpired');
    });
    mockGetPendingPublishes.mockImplementation(async () => {
      callOrder.push('getPendingPublishes');
      return [];
    });

    await retryPendingPublishes();

    expect(callOrder).toEqual(['cleanExpired', 'getPendingPublishes']);
  });
});
