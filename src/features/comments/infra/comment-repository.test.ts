import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  readCommentEventsByTagMock,
  storeCommentEventMock,
  deleteCommentEventsByIdsMock,
  logErrorMock,
  logInfoMock
} = vi.hoisted(() => ({
  readCommentEventsByTagMock: vi.fn(),
  storeCommentEventMock: vi.fn(),
  deleteCommentEventsByIdsMock: vi.fn(),
  logErrorMock: vi.fn(),
  logInfoMock: vi.fn()
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  readCommentEventsByTag: readCommentEventsByTagMock,
  storeCommentEvent: storeCommentEventMock,
  deleteCommentEventsByIds: deleteCommentEventsByIdsMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: logInfoMock,
    debug: vi.fn(),
    warn: vi.fn(),
    error: logErrorMock
  })
}));

import type { CachedEvent } from './comment-repository.js';
import {
  cacheCommentEvent,
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cacheCommentEvent', () => {
  it('stores events through the façade helper', async () => {
    const event = makeEvent();
    storeCommentEventMock.mockResolvedValue(true);

    const result = await cacheCommentEvent(event);

    expect(storeCommentEventMock).toHaveBeenCalledWith(event);
    expect(result).toBe(true);
  });
});

describe('restoreFromCache', () => {
  it('returns events from the façade helper', async () => {
    const events = [makeEvent({ id: 'ev-1' }), makeEvent({ id: 'ev-2' })];
    readCommentEventsByTagMock.mockResolvedValue(events);

    const result = await restoreFromCache('spotify:track:abc');

    expect(readCommentEventsByTagMock).toHaveBeenCalledWith('spotify:track:abc');
    expect(result).toEqual(events);
  });

  it('returns [] when the façade helper throws', async () => {
    readCommentEventsByTagMock.mockRejectedValue(new Error('db error'));

    const result = await restoreFromCache('spotify:track:abc');

    expect(result).toEqual([]);
    expect(logErrorMock).toHaveBeenCalled();
  });
});

describe('purgeDeletedFromCache', () => {
  it('calls deleteCommentEventsByIds with provided ids', async () => {
    await purgeDeletedFromCache(['id-1', 'id-2']);
    expect(deleteCommentEventsByIdsMock).toHaveBeenCalledWith(['id-1', 'id-2']);
  });

  it('does not call deleteCommentEventsByIds when ids is empty', async () => {
    await purgeDeletedFromCache([]);
    expect(deleteCommentEventsByIdsMock).not.toHaveBeenCalled();
  });

  it('logs info after successful purge', async () => {
    await purgeDeletedFromCache(['id-1']);
    expect(logInfoMock).toHaveBeenCalled();
  });

  it('handles deleteCommentEventsByIds errors gracefully', async () => {
    deleteCommentEventsByIdsMock.mockRejectedValue(new Error('delete error'));

    await expect(purgeDeletedFromCache(['id-1'])).resolves.toBeUndefined();
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
