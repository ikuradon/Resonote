import { BehaviorSubject, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getRxNostrMock, createSyncedQueryMock, logErrorMock } = vi.hoisted(() => {
  return {
    getRxNostrMock: vi.fn(),
    createSyncedQueryMock: vi.fn(),
    logErrorMock: vi.fn()
  };
});

vi.mock('$shared/nostr/client.js', () => ({
  getRxNostr: getRxNostrMock
}));

vi.mock('$shared/nostr/store.js', () => ({
  getStoreAsync: vi.fn().mockResolvedValue({
    getSync: vi.fn().mockResolvedValue([]),
    fetchById: vi.fn().mockResolvedValue(null),
    dispose: vi.fn()
  })
}));

vi.mock('@ikuradon/auftakt/sync', () => ({
  createSyncedQuery: createSyncedQueryMock
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

/**
 * Set up createSyncedQuery mock to emit CachedEvent[] then complete.
 */
function setupSyncedQuery(
  cachedEvents: Array<{
    event: { id: string; content: string; created_at: number; tags: string[][] };
  }>,
  errorToThrow?: unknown
) {
  const disposeMock = vi.fn();
  getRxNostrMock.mockResolvedValue({});

  if (errorToThrow !== undefined) {
    const eventsSubject = new Subject<unknown[]>();
    const statusSubject = new Subject<string>();
    createSyncedQueryMock.mockReturnValue({
      events$: eventsSubject.asObservable(),
      status$: statusSubject.asObservable(),
      emit: vi.fn(),
      dispose: disposeMock
    });
    queueMicrotask(() => {
      eventsSubject.error(errorToThrow);
    });
    return { disposeMock, eventsSubject, statusSubject };
  } else if (cachedEvents.length > 0) {
    // Use BehaviorSubject with pre-loaded events so they're available when subscribed
    const mappedEvents = cachedEvents.map((ce) => ({
      event: ce.event,
      seenOn: ['wss://relay.test'],
      firstSeen: Date.now()
    }));
    const eventsSubject = new BehaviorSubject<unknown[]>(mappedEvents);
    const statusSubject = new BehaviorSubject<string>('cached');
    createSyncedQueryMock.mockReturnValue({
      events$: eventsSubject.asObservable(),
      status$: statusSubject.asObservable(),
      emit: vi.fn(),
      dispose: disposeMock
    });
    queueMicrotask(() => {
      statusSubject.next('complete');
    });
    return { disposeMock, eventsSubject, statusSubject };
  } else {
    // Empty case: complete the backward query explicitly
    const eventsSubject = new Subject<unknown[]>();
    const statusSubject = new BehaviorSubject<string>('cached');
    createSyncedQueryMock.mockReturnValue({
      events$: eventsSubject.asObservable(),
      status$: statusSubject.asObservable(),
      emit: vi.fn(),
      dispose: disposeMock
    });
    queueMicrotask(() => {
      statusSubject.next('complete');
    });
    return { disposeMock, eventsSubject, statusSubject };
  }
}

describe('fetchProfileComments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty list when no events', async () => {
    setupSyncedQuery([]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.comments).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.oldestTimestamp).toBeNull();
  });

  it('returns comments sorted by createdAt descending', async () => {
    setupSyncedQuery([
      { event: { id: 'a', content: 'first', created_at: 100, tags: [] } },
      { event: { id: 'b', content: 'second', created_at: 200, tags: [] } }
    ]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.comments[0].id).toBe('b');
    expect(result.comments[1].id).toBe('a');
  });

  it('waits for backward completion and returns the final accumulated snapshot', async () => {
    const disposeMock = vi.fn();
    getRxNostrMock.mockResolvedValue({});
    const eventsSubject = new BehaviorSubject<unknown[]>([]);
    const statusSubject = new BehaviorSubject<string>('cached');

    createSyncedQueryMock.mockReturnValue({
      events$: eventsSubject.asObservable(),
      status$: statusSubject.asObservable(),
      emit: vi.fn(),
      dispose: disposeMock
    });

    const resultPromise = fetchProfileComments(PUBKEY);

    eventsSubject.next([
      {
        event: { id: 'a', content: 'first', created_at: 100, tags: [] },
        seenOn: ['wss://relay.test'],
        firstSeen: Date.now()
      }
    ]);
    eventsSubject.next([
      {
        event: { id: 'a', content: 'first', created_at: 100, tags: [] },
        seenOn: ['wss://relay.test'],
        firstSeen: Date.now()
      },
      {
        event: { id: 'b', content: 'second', created_at: 200, tags: [] },
        seenOn: ['wss://relay.test'],
        firstSeen: Date.now()
      }
    ]);
    statusSubject.next('complete');

    const result = await resultPromise;
    expect(result.comments.map((comment) => comment.id)).toEqual(['b', 'a']);
    expect(disposeMock).toHaveBeenCalled();
  });

  it('extracts iTag from I tag', async () => {
    setupSyncedQuery([
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
    setupSyncedQuery([
      { event: { id: 'y', content: 'no tag', created_at: 500, tags: [['e', 'some-event']] } }
    ]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.comments[0].iTag).toBeNull();
  });

  it('sets oldestTimestamp to smallest createdAt', async () => {
    setupSyncedQuery([
      { event: { id: 'a', content: '', created_at: 300, tags: [] } },
      { event: { id: 'b', content: '', created_at: 100, tags: [] } },
      { event: { id: 'c', content: '', created_at: 200, tags: [] } }
    ]);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.oldestTimestamp).toBe(100);
  });

  it('creates synced query with correct filter without until', async () => {
    setupSyncedQuery([]);
    await fetchProfileComments(PUBKEY);
    expect(createSyncedQueryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        filter: { kinds: [1111], authors: [PUBKEY], limit: 20 },
        strategy: 'backward'
      })
    );
  });

  it('creates synced query with until when provided', async () => {
    setupSyncedQuery([]);
    await fetchProfileComments(PUBKEY, 9999);
    expect(createSyncedQueryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        filter: { kinds: [1111], authors: [PUBKEY], limit: 20, until: 9999 },
        strategy: 'backward'
      })
    );
  });

  it('sets hasMore=true when items.length >= 20', async () => {
    const events = Array.from({ length: 20 }, (_, i) => ({
      event: { id: `id${i}`, content: '', created_at: i, tags: [] as string[][] }
    }));
    setupSyncedQuery(events);
    const result = await fetchProfileComments(PUBKEY);
    expect(result.hasMore).toBe(true);
  });

  it('returns empty result when subscription errors (caught by rxjs catchError)', async () => {
    const testError = new Error('relay error');
    setupSyncedQuery([], testError);

    // The rxjs pipe has catchError(() => of(null)), so errors are caught gracefully
    const result = await fetchProfileComments(PUBKEY);
    expect(result.comments).toEqual([]);
    expect(result.hasMore).toBe(false);
  });
});
