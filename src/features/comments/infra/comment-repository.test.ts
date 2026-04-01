import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSync, logErrorMock, logInfoMock } = vi.hoisted(() => ({
  mockGetSync: vi.fn(),
  logErrorMock: vi.fn(),
  logInfoMock: vi.fn()
}));

vi.mock('$shared/nostr/store.js', () => ({
  getStoreAsync: vi.fn().mockReturnValue({
    getSync: mockGetSync,
    fetchById: vi.fn().mockResolvedValue(null),
    dispose: vi.fn()
  })
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: logInfoMock,
    debug: vi.fn(),
    warn: vi.fn(),
    error: logErrorMock
  })
}));

import type { CachedEvent, EventsDB } from './comment-repository.js';
import {
  getCommentRepository,
  purgeDeletedFromCache,
  restoreFromCache
} from './comment-repository.js';

function makeEvent(overrides: Partial<CachedEvent> = {}): CachedEvent {
  return {
    id: overrides.id ?? 'event-1',
    pubkey: overrides.pubkey ?? 'pubkey-1',
    content: overrides.content ?? 'hello',
    created_at: overrides.created_at ?? 1000,
    tags: overrides.tags ?? [],
    kind: overrides.kind ?? 1111
  };
}

function makeDb(overrides: Partial<EventsDB> = {}): EventsDB {
  return {
    getByTagValue: vi.fn(async () => []),
    put: vi.fn(),
    deleteByIds: vi.fn(async () => {}),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getCommentRepository', () => {
  it('returns an EventsDB adapter from getStore', async () => {
    mockGetSync.mockResolvedValue([]);

    const result = await getCommentRepository();

    expect(result).toBeDefined();
    expect(typeof result.getByTagValue).toBe('function');
    expect(typeof result.put).toBe('function');
    expect(typeof result.deleteByIds).toBe('function');
  });
});

describe('restoreFromCache', () => {
  it('returns events from db.getByTagValue', async () => {
    const events = [makeEvent({ id: 'ev-1' }), makeEvent({ id: 'ev-2' })];
    const db = makeDb({ getByTagValue: vi.fn(async () => events) });

    const result = await restoreFromCache(db, 'I:spotify:track:abc');

    expect(db.getByTagValue).toHaveBeenCalledWith('I:spotify:track:abc');
    expect(result).toEqual(events);
  });

  it('returns [] when db.getByTagValue throws', async () => {
    const db = makeDb({
      getByTagValue: vi.fn(async () => {
        throw new Error('db error');
      })
    });

    const result = await restoreFromCache(db, 'I:spotify:track:abc');

    expect(result).toEqual([]);
    expect(logErrorMock).toHaveBeenCalled();
  });

  it('passes the tagQuery argument to db.getByTagValue', async () => {
    const db = makeDb();
    await restoreFromCache(db, 'I:youtube:video:xyz');
    expect(db.getByTagValue).toHaveBeenCalledWith('I:youtube:video:xyz');
  });
});

describe('purgeDeletedFromCache', () => {
  it('does not call db.deleteByIds (auftakt handles deletions via kind:5)', async () => {
    const db = makeDb();
    await purgeDeletedFromCache(db, ['id-1', 'id-2']);
    expect(db.deleteByIds).not.toHaveBeenCalled();
  });

  it('does not throw when ids is empty', async () => {
    const db = makeDb();
    await expect(purgeDeletedFromCache(db, [])).resolves.toBeUndefined();
  });

  it('does not throw when ids are provided', async () => {
    const db = makeDb();
    await expect(purgeDeletedFromCache(db, ['id-1'])).resolves.toBeUndefined();
  });

  it('is always a no-op regardless of db state', async () => {
    const db = makeDb();
    await purgeDeletedFromCache(db, ['id-1']);
    expect(db.deleteByIds).not.toHaveBeenCalled();
  });
});
