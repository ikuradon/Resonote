import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildCommentContentFiltersMock,
  loadCommentSubscriptionDepsMock,
  startCommentDeletionReconcileMock,
  startCommentSubscriptionMock,
  startMergedCommentSubscriptionMock,
  logErrorMock
} = vi.hoisted(() => ({
  buildCommentContentFiltersMock: vi.fn(),
  loadCommentSubscriptionDepsMock: vi.fn(),
  startCommentDeletionReconcileMock: vi.fn(),
  startCommentSubscriptionMock: vi.fn(),
  startMergedCommentSubscriptionMock: vi.fn(),
  logErrorMock: vi.fn()
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  buildCommentContentFilters: buildCommentContentFiltersMock,
  loadCommentSubscriptionDeps: loadCommentSubscriptionDepsMock,
  startCommentDeletionReconcile: startCommentDeletionReconcileMock,
  startCommentSubscription: startCommentSubscriptionMock,
  startMergedCommentSubscription: startMergedCommentSubscriptionMock
}));

vi.mock('$shared/nostr/events.js', () => ({
  COMMENT_KIND: 1111,
  REACTION_KIND: 7,
  DELETION_KIND: 5,
  CONTENT_REACTION_KIND: 17
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: logErrorMock
  })
}));

import {
  buildContentFilters,
  loadSubscriptionDeps,
  startDeletionReconcile,
  startMergedSubscription,
  startSubscription
} from './comment-subscription.js';

describe('comment-subscription wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buildContentFilters delegates kind mapping to resonote helper', () => {
    const filters = [{ kinds: [1111] }];
    buildCommentContentFiltersMock.mockReturnValue(filters);

    expect(buildContentFilters('spotify:track:abc')).toBe(filters);
    expect(buildCommentContentFiltersMock).toHaveBeenCalledWith('spotify:track:abc', {
      comment: 1111,
      reaction: 7,
      deletion: 5,
      contentReaction: 17
    });
  });

  it('loadSubscriptionDeps forwards resonote deps unchanged', async () => {
    const deps = { relaySession: {}, relaySessionMod: {}, rxjsMerge: vi.fn() };
    loadCommentSubscriptionDepsMock.mockResolvedValue(deps);

    await expect(loadSubscriptionDeps()).resolves.toBe(deps);
  });

  it('startSubscription delegates with backward error logger', () => {
    const refs = { token: 'refs' };
    const filters = [{ kinds: [1111] }];
    const handles = [{ unsubscribe: vi.fn() }, { unsubscribe: vi.fn() }];
    const onPacket = vi.fn();
    const onBackwardComplete = vi.fn();
    startCommentSubscriptionMock.mockReturnValue(handles);

    const result = startSubscription(refs as never, filters, 1000, onPacket, onBackwardComplete);

    expect(result).toBe(handles);
    expect(startCommentSubscriptionMock).toHaveBeenCalledWith(
      refs,
      filters,
      1000,
      onPacket,
      onBackwardComplete,
      expect.any(Function)
    );

    const onError = startCommentSubscriptionMock.mock.calls[0][5] as (error: unknown) => void;
    const error = new Error('backward failed');
    onError(error);
    expect(logErrorMock).toHaveBeenCalledWith('Backward fetch error', error);
  });

  it('startMergedSubscription delegates with merged error logger', () => {
    const refs = { token: 'refs' };
    const filters = [{ kinds: [1111] }];
    const handle = { unsubscribe: vi.fn() };
    const onPacket = vi.fn();
    startMergedCommentSubscriptionMock.mockReturnValue(handle);

    const result = startMergedSubscription(refs as never, filters, onPacket);

    expect(result).toBe(handle);
    expect(startMergedCommentSubscriptionMock).toHaveBeenCalledWith(
      refs,
      filters,
      onPacket,
      expect.any(Function)
    );

    const onError = startMergedCommentSubscriptionMock.mock.calls[0][3] as (error: unknown) => void;
    const error = new Error('merged failed');
    onError(error);
    expect(logErrorMock).toHaveBeenCalledWith('Merged subscription error', error);
  });

  it('startDeletionReconcile forwards DELETION_KIND and callbacks', () => {
    const refs = { token: 'refs' };
    const cachedIds = ['a', 'b'];
    const reconcileResult = { sub: { unsubscribe: vi.fn() }, timeout: setTimeout(() => {}, 0) };
    const onDeletionEvent = vi.fn();
    const onComplete = vi.fn();
    startCommentDeletionReconcileMock.mockReturnValue(reconcileResult);

    const result = startDeletionReconcile(refs as never, cachedIds, onDeletionEvent, onComplete);

    expect(result).toBe(reconcileResult);
    expect(startCommentDeletionReconcileMock).toHaveBeenCalledWith(
      refs,
      cachedIds,
      5,
      onDeletionEvent,
      onComplete
    );
    clearTimeout(reconcileResult.timeout);
  });
});
