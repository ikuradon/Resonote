import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getEventsDBMock, logErrorMock, logInfoMock } = vi.hoisted(() => ({
  getEventsDBMock: vi.fn(),
  logErrorMock: vi.fn(),
  logInfoMock: vi.fn()
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  getEventsDB: getEventsDBMock
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
  materializeDeletedIds,
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
  it('returns the EventsDB instance from getEventsDB', async () => {
    const fakeDb = makeDb();
    getEventsDBMock.mockResolvedValue(fakeDb);

    const result = await getCommentRepository();

    expect(getEventsDBMock).toHaveBeenCalledOnce();
    expect(result).toBe(fakeDb);
  });
});

describe('restoreFromCache', () => {
  it('returns events from db.getByTagValue', async () => {
    const events = [makeEvent({ id: 'ev-1' }), makeEvent({ id: 'ev-2' })];
    const db = makeDb({ getByTagValue: vi.fn(async () => events) });

    const result = await restoreFromCache(db, 'spotify:track:abc');

    expect(db.getByTagValue).toHaveBeenCalledWith('spotify:track:abc');
    expect(result).toEqual(events);
  });

  it('returns [] when db.getByTagValue throws', async () => {
    const db = makeDb({
      getByTagValue: vi.fn(async () => {
        throw new Error('db error');
      })
    });

    const result = await restoreFromCache(db, 'spotify:track:abc');

    expect(result).toEqual([]);
    expect(logErrorMock).toHaveBeenCalled();
  });

  it('passes the tagQuery argument to db.getByTagValue', async () => {
    const db = makeDb();
    await restoreFromCache(db, 'youtube:video:xyz');
    expect(db.getByTagValue).toHaveBeenCalledWith('youtube:video:xyz');
  });
});

describe('purgeDeletedFromCache', () => {
  it('calls db.deleteByIds with provided ids', async () => {
    const db = makeDb();
    await purgeDeletedFromCache(db, ['id-1', 'id-2']);
    expect(db.deleteByIds).toHaveBeenCalledWith(['id-1', 'id-2']);
  });

  it('does not call db.deleteByIds when ids is empty', async () => {
    const db = makeDb();
    await purgeDeletedFromCache(db, []);
    expect(db.deleteByIds).not.toHaveBeenCalled();
  });

  it('logs info after successful purge', async () => {
    const db = makeDb();
    await purgeDeletedFromCache(db, ['id-1']);
    expect(logInfoMock).toHaveBeenCalled();
  });

  it('handles db.deleteByIds errors gracefully', async () => {
    const db = makeDb({
      deleteByIds: vi.fn(async () => {
        throw new Error('delete error');
      })
    });

    await expect(purgeDeletedFromCache(db, ['id-1'])).resolves.toBeUndefined();
    expect(logErrorMock).toHaveBeenCalled();
  });
});

describe('materializeDeletedIds', () => {
  it('adds deleted subjects from reconcile emissions', () => {
    const result = materializeDeletedIds(new Set(['existing']), [
      {
        subjectId: 'new-del',
        reason: 'tombstoned',
        state: 'deleted'
      },
      {
        subjectId: 'ignored',
        reason: 'repaired-replay',
        state: 'repairing'
      }
    ]);

    expect(result).toEqual(new Set(['existing', 'new-del']));
  });
});
