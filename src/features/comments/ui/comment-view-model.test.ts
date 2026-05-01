import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  loadSubscriptionDepsMock,
  cacheCommentEventMock,
  restoreFromCacheMock,
  buildContentFiltersMock,
  startSubscriptionMock,
  startDeletionReconcileMock,
  startMergedSubscriptionMock,
  purgeDeletedFromCacheMock,
  materializeDeletedIdsMock,
  commentFromEventMock,
  reactionFromEventMock,
  contentReactionFromEventMock,
  placeholderFromOrphanMock,
  emptyStatsMock,
  applyReactionMock,
  buildReactionIndexMock,
  isLikeReactionMock,
  verifyDeletionTargetsMock,
  reconcileDeletionTargetsMock,
  cachedFetchByIdMock,
  invalidateFetchByIdCacheMock,
  logInfoMock,
  logDebugMock,
  logErrorMock
} = vi.hoisted(() => {
  const mockSub = { unsubscribe: vi.fn() };
  return {
    loadSubscriptionDepsMock: vi.fn().mockResolvedValue({
      relaySession: {},
      relaySessionMod: {},
      rxjsMerge: vi.fn()
    }),
    cacheCommentEventMock: vi.fn().mockReturnValue(undefined),
    restoreFromCacheMock: vi.fn().mockResolvedValue([]),
    buildContentFiltersMock: vi.fn().mockReturnValue([]),
    startSubscriptionMock: vi.fn().mockReturnValue([mockSub, mockSub]),
    startDeletionReconcileMock: vi.fn().mockReturnValue({ sub: mockSub, timeout: undefined }),
    startMergedSubscriptionMock: vi.fn().mockReturnValue(mockSub),
    purgeDeletedFromCacheMock: vi.fn().mockResolvedValue(undefined),
    materializeDeletedIdsMock: vi.fn(
      (current: Set<string>, emissions: Array<{ subjectId: string; state: string }>) => {
        const next = new Set(current);
        for (const emission of emissions) {
          if (emission.state === 'deleted') next.add(emission.subjectId);
        }
        return next;
      }
    ),
    commentFromEventMock: vi.fn(
      (event: {
        id: string;
        pubkey: string;
        content: string;
        created_at: number;
        tags: string[][];
      }) => ({
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        createdAt: event.created_at,
        positionMs: null,
        emojiTags: [],
        replyTo: null,
        contentWarning: null
      })
    ),
    reactionFromEventMock: vi.fn().mockReturnValue(null),
    contentReactionFromEventMock: vi.fn(
      (event: { id: string; pubkey: string; created_at: number }) => ({
        id: event.id,
        pubkey: event.pubkey,
        createdAt: event.created_at
      })
    ),
    placeholderFromOrphanMock: vi.fn((id: string, positionMs: number | null) => ({
      id,
      status: 'loading' as const,
      positionMs
    })),
    emptyStatsMock: vi.fn().mockReturnValue({ likes: 0, emojis: [], reactors: new Set() }),
    applyReactionMock: vi.fn((stats: unknown) => stats),
    buildReactionIndexMock: vi.fn().mockReturnValue(new Map()),
    isLikeReactionMock: vi.fn().mockReturnValue(true),
    verifyDeletionTargetsMock: vi.fn().mockReturnValue([]),
    reconcileDeletionTargetsMock: vi.fn().mockReturnValue({ verifiedTargetIds: [], emissions: [] }),
    cachedFetchByIdMock: vi.fn().mockResolvedValue({
      event: null,
      settlement: { phase: 'settled', provenance: 'none', reason: 'settled-miss' } as const
    }),
    invalidateFetchByIdCacheMock: vi.fn(),
    logInfoMock: vi.fn(),
    logDebugMock: vi.fn(),
    logErrorMock: vi.fn()
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('../application/comment-subscription.js', () => ({
  loadSubscriptionDeps: loadSubscriptionDepsMock,
  cacheCommentEvent: cacheCommentEventMock,
  restoreFromCache: restoreFromCacheMock,
  buildContentFilters: buildContentFiltersMock,
  startSubscription: startSubscriptionMock,
  startDeletionReconcile: startDeletionReconcileMock,
  startMergedSubscription: startMergedSubscriptionMock,
  purgeDeletedFromCache: purgeDeletedFromCacheMock,
  materializeDeletedIds: materializeDeletedIdsMock
}));

vi.mock('../domain/comment-mappers.js', () => ({
  commentFromEvent: commentFromEventMock,
  reactionFromEvent: reactionFromEventMock,
  contentReactionFromEvent: contentReactionFromEventMock,
  placeholderFromOrphan: placeholderFromOrphanMock
}));

vi.mock('../domain/reaction-rules.js', () => ({
  emptyStats: emptyStatsMock,
  applyReaction: applyReactionMock,
  buildReactionIndex: buildReactionIndexMock,
  isLikeReaction: isLikeReactionMock
}));

vi.mock('../domain/deletion-rules.js', () => ({
  verifyDeletionTargets: verifyDeletionTargetsMock,
  reconcileDeletionTargets: reconcileDeletionTargetsMock
}));

vi.mock('$shared/nostr/events.js', () => ({
  COMMENT_KIND: 1111,
  REACTION_KIND: 7,
  CONTENT_REACTION_KIND: 17,
  DELETION_KIND: 5,
  extractDeletionTargets: vi.fn().mockReturnValue([]),
  parsePosition: vi.fn().mockReturnValue(null)
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  fetchNostrEventById: cachedFetchByIdMock,
  invalidateFetchByIdCache: invalidateFetchByIdCacheMock
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: logInfoMock,
    debug: logDebugMock,
    error: logErrorMock
  }),
  shortHex: (id: string) => id.slice(0, 8)
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------
import { createCommentViewModel } from './comment-view-model.svelte.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const contentId = { platform: 'spotify', type: 'track', id: 'track-1' };
const provider = {
  platform: 'spotify',
  displayName: 'Spotify',
  requiresExtension: false,
  parseUrl: () => null,
  toNostrTag: (): [string, string] => ['spotify:track:track-1', ''],
  contentKind: () => 'spotify:track',
  embedUrl: () => null,
  openUrl: () => 'https://open.spotify.com/track/track-1'
};

function makeCommentEvent(
  id: string,
  overrides: Partial<{
    pubkey: string;
    content: string;
    created_at: number;
    positionMs: number | null;
    kind: number;
  }> = {}
) {
  return {
    id,
    pubkey: overrides.pubkey ?? `pubkey-${id}`,
    content: overrides.content ?? `content-${id}`,
    created_at: overrides.created_at ?? 1000,
    tags: overrides.positionMs != null ? [['position', String(overrides.positionMs)]] : [],
    kind: overrides.kind ?? 1111
  };
}

function makeCachedFetchByIdResult(
  event: ReturnType<typeof makeCommentEvent> | null,
  settlement: {
    phase: 'pending' | 'partial' | 'settled';
    provenance: 'memory' | 'store' | 'relay' | 'mixed' | 'none';
    reason:
      | 'settled-hit'
      | 'settled-miss'
      | 'timeout'
      | 'empty-relay'
      | 'cache-hit'
      | 'invalidated-during-fetch'
      | 'error'
      | 'degraded';
  } = { phase: 'settled', provenance: 'none', reason: 'settled-miss' }
) {
  return { event, settlement };
}

type PacketHandler = (event: {
  id: string;
  pubkey: string;
  kind: number;
  tags: string[][];
  content: string;
  created_at: number;
}) => void;

/**
 * Mock startSubscription to capture onPacket callback for live event simulation.
 * Returns a getter for the captured handler.
 */
function captureOnPacket(): { getOnPacket: () => PacketHandler } {
  let captured!: PacketHandler;
  startSubscriptionMock.mockImplementation(
    (
      _refs: unknown,
      _filters: unknown,
      _maxCreatedAt: unknown,
      onPacket: PacketHandler,
      onBackwardComplete: () => void
    ) => {
      captured = onPacket;
      onBackwardComplete();
      return [{ unsubscribe: vi.fn() }, { unsubscribe: vi.fn() }];
    }
  );
  return { getOnPacket: () => captured };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('createCommentViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-apply default return values after clearAllMocks
    const mockSub = { unsubscribe: vi.fn() };
    loadSubscriptionDepsMock.mockResolvedValue({
      relaySession: {},
      relaySessionMod: {},
      rxjsMerge: vi.fn()
    });
    cacheCommentEventMock.mockReturnValue(undefined);
    restoreFromCacheMock.mockResolvedValue([]);
    buildContentFiltersMock.mockReturnValue([]);
    startSubscriptionMock.mockReturnValue([mockSub, mockSub]);
    startDeletionReconcileMock.mockReturnValue({ sub: mockSub, timeout: undefined });
    startMergedSubscriptionMock.mockReturnValue(mockSub);
    purgeDeletedFromCacheMock.mockResolvedValue(undefined);
    materializeDeletedIdsMock.mockImplementation(
      (current: Set<string>, emissions: Array<{ subjectId: string; state: string }>) => {
        const next = new Set(current);
        for (const emission of emissions) {
          if (emission.state === 'deleted') next.add(emission.subjectId);
        }
        return next;
      }
    );
    commentFromEventMock.mockImplementation(
      (event: {
        id: string;
        pubkey: string;
        content: string;
        created_at: number;
        tags: string[][];
      }) => ({
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        createdAt: event.created_at,
        positionMs: null,
        emojiTags: [],
        replyTo: null,
        contentWarning: null
      })
    );
    reactionFromEventMock.mockReturnValue(null);
    placeholderFromOrphanMock.mockImplementation((id: string, positionMs: number | null) => ({
      id,
      status: 'loading' as const,
      positionMs
    }));
    emptyStatsMock.mockReturnValue({ likes: 0, emojis: [], reactors: new Set() });
    applyReactionMock.mockImplementation((stats: unknown) => stats);
    buildReactionIndexMock.mockReturnValue(new Map());
    isLikeReactionMock.mockReturnValue(true);
    verifyDeletionTargetsMock.mockReturnValue([]);
    reconcileDeletionTargetsMock.mockImplementation(
      (event: { pubkey: string; tags: string[][] }, eventPubkeys: Map<string, string>) => {
        const verifiedTargetIds = verifyDeletionTargetsMock(event, eventPubkeys) as string[];
        return {
          verifiedTargetIds,
          emissions: verifiedTargetIds.map((subjectId) => ({
            subjectId,
            reason: 'tombstoned' as const,
            state: 'deleted' as const
          }))
        };
      }
    );
    cachedFetchByIdMock.mockResolvedValue(makeCachedFetchByIdResult(null));
    invalidateFetchByIdCacheMock.mockReturnValue(undefined);
  });

  // -------------------------------------------------------------------------
  // 1. Initial state
  // -------------------------------------------------------------------------
  describe('initial state', () => {
    it('returns correct API shape', () => {
      const vm = createCommentViewModel(contentId, provider);
      expect(vm).toHaveProperty('comments');
      expect(vm).toHaveProperty('reactionIndex');
      expect(vm).toHaveProperty('deletedIds');
      expect(vm).toHaveProperty('loading');
      expect(vm).toHaveProperty('placeholders');
      expect(vm).toHaveProperty('subscribe');
      expect(vm).toHaveProperty('addSubscription');
      expect(vm).toHaveProperty('fetchOrphanParent');
      expect(vm).toHaveProperty('destroy');
    });

    it('starts with loading=true and empty comments', () => {
      const vm = createCommentViewModel(contentId, provider);
      expect(vm.loading).toBe(true);
      expect(vm.comments).toEqual([]);
      expect(vm.reactionIndex.size).toBe(0);
      expect(vm.deletedIds.size).toBe(0);
      expect(vm.placeholders.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. subscribe()
  // -------------------------------------------------------------------------
  describe('subscribe()', () => {
    it('calls loadSubscriptionDeps', async () => {
      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();
      expect(loadSubscriptionDepsMock).toHaveBeenCalledOnce();
    });

    it('calls restoreFromCache with tag query derived from provider', async () => {
      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();
      expect(restoreFromCacheMock).toHaveBeenCalledWith('I:spotify:track:track-1');
    });

    it('calls startSubscription after loading deps', async () => {
      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();
      expect(startSubscriptionMock).toHaveBeenCalledOnce();
    });

    it('sets loading=false when backward complete callback fires', async () => {
      startSubscriptionMock.mockImplementation(
        (
          _refs: unknown,
          _filters: unknown,
          _maxCreatedAt: unknown,
          _onPacket: unknown,
          onBackwardComplete: () => void
        ) => {
          onBackwardComplete();
          return [{ unsubscribe: vi.fn() }, { unsubscribe: vi.fn() }];
        }
      );
      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();
      expect(vm.loading).toBe(false);
    });

    it('restores comments from cache and sets loading=false when cache is non-empty', async () => {
      const cachedEvent = makeCommentEvent('cached-1');
      restoreFromCacheMock.mockResolvedValue([cachedEvent]);
      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();
      expect(commentFromEventMock).toHaveBeenCalledWith(cachedEvent);
      expect(vm.comments).toHaveLength(1);
      expect(vm.loading).toBe(false);
    });

    it('sets loading=false on subscription error', async () => {
      loadSubscriptionDepsMock.mockRejectedValue(new Error('network error'));
      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();
      expect(vm.loading).toBe(false);
    });

    it('starts deletion reconcile when cache is non-empty', async () => {
      const cachedEvent = makeCommentEvent('cached-c1');
      restoreFromCacheMock.mockResolvedValue([cachedEvent]);
      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();
      expect(startDeletionReconcileMock).toHaveBeenCalledOnce();
    });

    it('skips deletion reconcile when cache is empty', async () => {
      restoreFromCacheMock.mockResolvedValue([]);
      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();
      expect(startDeletionReconcileMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. destroy()
  // -------------------------------------------------------------------------
  describe('destroy()', () => {
    it('clears all state and calls unsubscribe on subscriptions', async () => {
      const sub1 = { unsubscribe: vi.fn() };
      const sub2 = { unsubscribe: vi.fn() };
      startSubscriptionMock.mockReturnValue([sub1, sub2]);

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      vm.destroy();

      expect(sub1.unsubscribe).toHaveBeenCalledOnce();
      expect(sub2.unsubscribe).toHaveBeenCalledOnce();
      expect(vm.comments).toEqual([]);
      expect(vm.reactionIndex.size).toBe(0);
      expect(vm.deletedIds.size).toBe(0);
      expect(vm.placeholders.size).toBe(0);
    });

    it('unsubscribes reconcile sub when active', async () => {
      const reconcileSub = { unsubscribe: vi.fn() };
      // startDeletionReconcile is called when cache has items
      const cachedEvent = makeCommentEvent('cached-r1');
      restoreFromCacheMock.mockResolvedValue([cachedEvent]);
      startDeletionReconcileMock.mockReturnValue({ sub: reconcileSub, timeout: undefined });

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();
      vm.destroy();

      expect(reconcileSub.unsubscribe).toHaveBeenCalledOnce();
    });

    it('is safe to call destroy before subscribe', () => {
      const vm = createCommentViewModel(contentId, provider);
      expect(() => vm.destroy()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 4. fetchOrphanParent — loading → success
  // -------------------------------------------------------------------------
  describe('fetchOrphanParent: success case', () => {
    it('creates a loading placeholder then removes it on success', async () => {
      const parentEvent = makeCommentEvent('parent-1');
      cachedFetchByIdMock.mockResolvedValue(makeCachedFetchByIdResult(parentEvent));

      const vm = createCommentViewModel(contentId, provider);

      const promise = vm.fetchOrphanParent('parent-1', null);

      // Loading placeholder should be visible synchronously after first tick
      // (placeholderFromOrphan is called before await)
      await promise;

      expect(placeholderFromOrphanMock).toHaveBeenCalledWith('parent-1', null);
      // Placeholder is removed after success
      expect(vm.placeholders.has('parent-1')).toBe(false);
    });

    it('adds the fetched parent to comments on success', async () => {
      const parentEvent = makeCommentEvent('parent-1');
      cachedFetchByIdMock.mockResolvedValue(makeCachedFetchByIdResult(parentEvent));

      const vm = createCommentViewModel(contentId, provider);
      await vm.fetchOrphanParent('parent-1', null);

      expect(commentFromEventMock).toHaveBeenCalledWith(parentEvent);
      expect(vm.comments).toHaveLength(1);
      expect(vm.comments[0].id).toBe('parent-1');
    });

    it('passes estimatedPositionMs to placeholderFromOrphan', async () => {
      const parentEvent = makeCommentEvent('parent-1');
      cachedFetchByIdMock.mockResolvedValue(makeCachedFetchByIdResult(parentEvent));

      const vm = createCommentViewModel(contentId, provider);
      await vm.fetchOrphanParent('parent-1', 12_000);

      expect(placeholderFromOrphanMock).toHaveBeenCalledWith('parent-1', 12_000);
    });
  });

  // -------------------------------------------------------------------------
  // 5. fetchOrphanParent — loading → not-found
  // -------------------------------------------------------------------------
  describe('fetchOrphanParent: not-found case', () => {
    it('sets placeholder status to not-found when fetch returns null', async () => {
      cachedFetchByIdMock.mockResolvedValue(makeCachedFetchByIdResult(null));

      const vm = createCommentViewModel(contentId, provider);
      await vm.fetchOrphanParent('missing-parent', null);

      const ph = vm.placeholders.get('missing-parent');
      expect(ph).toBeDefined();
      expect(ph?.status).toBe('not-found');
    });

    it('sets placeholder status to not-found when fetch returns non-comment kind event', async () => {
      cachedFetchByIdMock.mockResolvedValue(
        makeCachedFetchByIdResult({ ...makeCommentEvent('kind0-event'), kind: 0 })
      );

      const vm = createCommentViewModel(contentId, provider);
      await vm.fetchOrphanParent('kind0-event', 5_000);

      const ph = vm.placeholders.get('kind0-event');
      expect(ph?.status).toBe('not-found');
    });

    it('sets placeholder to not-found when settlement marks result as invalidated', async () => {
      const parentEvent = makeCommentEvent('invalidated-parent');
      cachedFetchByIdMock.mockResolvedValue(
        makeCachedFetchByIdResult(parentEvent, {
          phase: 'settled',
          provenance: 'relay',
          reason: 'invalidated-during-fetch'
        })
      );

      const vm = createCommentViewModel(contentId, provider);
      await vm.fetchOrphanParent('invalidated-parent', null);

      expect(vm.comments.find((c) => c.id === 'invalidated-parent')).toBeUndefined();
      expect(vm.placeholders.get('invalidated-parent')?.status).toBe('not-found');
    });
  });

  // -------------------------------------------------------------------------
  // 6. fetchOrphanParent — deleted parent (pre-existing in deletedIds)
  // -------------------------------------------------------------------------
  describe('fetchOrphanParent: deleted parent (already in deletedIds)', () => {
    it('creates deleted placeholder immediately without fetching', async () => {
      // Simulate parent already being in deletedIds via a deletion event during subscribe
      // We reach into internal state by calling subscribe with a cached deletion event
      // that verifyDeletionTargets returns the parent id for.
      // Simpler: call the delete path via dispatchPacket which is internal — instead
      // we manipulate via the handleDeletionPacket path indirectly through startSubscription.
      // Easiest approach: mock startSubscription to call onPacket with a deletion event
      // that targets our parent, with verifyDeletionTargets returning the parent id.

      const parentId = 'deleted-parent';
      verifyDeletionTargetsMock.mockReturnValue([parentId]);

      startSubscriptionMock.mockImplementation(
        (
          _refs: unknown,
          _filters: unknown,
          _maxCreatedAt: unknown,
          onPacket: (event: {
            id: string;
            pubkey: string;
            kind: number;
            tags: string[][];
            content: string;
            created_at: number;
          }) => void,
          onBackwardComplete: () => void
        ) => {
          onPacket({
            id: 'del-event',
            pubkey: 'author',
            kind: 5,
            tags: [['e', parentId]],
            content: '',
            created_at: 2000
          });
          onBackwardComplete();
          return [{ unsubscribe: vi.fn() }, { unsubscribe: vi.fn() }];
        }
      );

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      // Now parentId is in deletedIds
      expect(vm.deletedIds.has(parentId)).toBe(true);

      // fetchOrphanParent should create deleted placeholder immediately
      await vm.fetchOrphanParent(parentId, 8_000);

      const ph = vm.placeholders.get(parentId);
      expect(ph).toBeDefined();
      expect(ph?.status).toBe('deleted');
      expect(ph?.positionMs).toBe(8_000);
      // cachedFetchById should NOT be called
      expect(cachedFetchByIdMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 7. fetchOrphanParent — deleted during await
  // -------------------------------------------------------------------------
  describe('fetchOrphanParent: deleted during fetch await', () => {
    it('shows deleted placeholder when deletion arrives while fetch is pending', async () => {
      const parentId = 'race-parent';
      const { getOnPacket } = captureOnPacket();

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      // At this point deletedIds does NOT contain parentId
      // Make cachedFetchById block until we manually resolve it
      let resolveFetch!: (val: ReturnType<typeof makeCachedFetchByIdResult>) => void;
      cachedFetchByIdMock.mockImplementation(
        () =>
          new Promise((r) => {
            resolveFetch = r;
          })
      );

      // Start fetch — this enters the fetch path (deletedIds.has is false)
      const fetchPromise = vm.fetchOrphanParent(parentId, null);

      // While fetch is pending, simulate deletion event arriving via live subscription
      verifyDeletionTargetsMock.mockReturnValue([parentId]);
      getOnPacket()({
        id: 'del-during-fetch',
        pubkey: 'author',
        kind: 5,
        tags: [['e', parentId]],
        content: '',
        created_at: 3000
      });

      // Now resolve the fetch with a valid comment event
      resolveFetch(makeCachedFetchByIdResult(makeCommentEvent(parentId)));
      await fetchPromise;

      // Result: deleted placeholder (NOT added to commentsRaw)
      const ph = vm.placeholders.get(parentId);
      expect(ph).toBeDefined();
      expect(ph?.status).toBe('deleted');
      expect(vm.comments.find((c) => c.id === parentId)).toBeUndefined();
      // cachedFetchById WAS called (unlike the early-return path)
      expect(cachedFetchByIdMock).toHaveBeenCalledWith(parentId, []);
    });
  });

  // -------------------------------------------------------------------------
  // 8. fetchOrphanParent — dedup (fetchedParentIds guard)
  // -------------------------------------------------------------------------
  describe('fetchOrphanParent: dedup guard', () => {
    it('does not fetch a second time for the same parentId', async () => {
      cachedFetchByIdMock.mockResolvedValue(
        makeCachedFetchByIdResult(makeCommentEvent('dup-parent'))
      );

      const vm = createCommentViewModel(contentId, provider);
      await vm.fetchOrphanParent('dup-parent', null);
      await vm.fetchOrphanParent('dup-parent', null);

      expect(cachedFetchByIdMock).toHaveBeenCalledOnce();
    });

    it('updates positionMs on second call if existing placeholder has null positionMs', async () => {
      // First call: fetch resolves to null → not-found placeholder with positionMs=null
      cachedFetchByIdMock.mockResolvedValue(makeCachedFetchByIdResult(null));

      const vm = createCommentViewModel(contentId, provider);
      await vm.fetchOrphanParent('dedup-ph', null);

      // Placeholder should be not-found with positionMs null
      expect(vm.placeholders.get('dedup-ph')?.positionMs).toBeNull();

      // Second call with a better estimate
      await vm.fetchOrphanParent('dedup-ph', 20_000);

      // positionMs should be updated
      expect(vm.placeholders.get('dedup-ph')?.positionMs).toBe(20_000);
      // fetch was only called once
      expect(cachedFetchByIdMock).toHaveBeenCalledOnce();
    });

    it('does not update positionMs if already non-null on second call', async () => {
      cachedFetchByIdMock.mockResolvedValue(makeCachedFetchByIdResult(null));

      const vm = createCommentViewModel(contentId, provider);
      await vm.fetchOrphanParent('dedup-ph2', 5_000);
      await vm.fetchOrphanParent('dedup-ph2', 10_000);

      expect(vm.placeholders.get('dedup-ph2')?.positionMs).toBe(5_000);
    });

    it('skips fetch when parent already exists in comments', async () => {
      // Populate comments via subscribe with cached event
      const cachedEvent = makeCommentEvent('known-parent');
      restoreFromCacheMock.mockResolvedValue([cachedEvent]);

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      await vm.fetchOrphanParent('known-parent', null);

      expect(cachedFetchByIdMock).not.toHaveBeenCalled();
      expect(placeholderFromOrphanMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 9. addSubscription()
  // -------------------------------------------------------------------------
  describe('addSubscription()', () => {
    it('returns early when subscribe() has not been called (no refs)', async () => {
      const vm = createCommentViewModel(contentId, provider);
      await vm.addSubscription('spotify:track:other-1');
      expect(startMergedSubscriptionMock).not.toHaveBeenCalled();
    });

    it('starts merged subscription after subscribe()', async () => {
      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();
      await vm.addSubscription('spotify:track:other-1');
      expect(startMergedSubscriptionMock).toHaveBeenCalledOnce();
    });

    it('restores cached comments for the new tag', async () => {
      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      const additionalEvent = makeCommentEvent('add-c1');
      restoreFromCacheMock.mockResolvedValue([additionalEvent]);

      await vm.addSubscription('spotify:track:other-1');
      expect(restoreFromCacheMock).toHaveBeenCalledWith('I:spotify:track:other-1');
      expect(vm.comments).toHaveLength(1);
      expect(vm.comments[0].id).toBe('add-c1');
    });

    it('does not add duplicate comments from cache', async () => {
      const cachedEvent = makeCommentEvent('shared-c');
      restoreFromCacheMock.mockResolvedValue([cachedEvent]);

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();
      // shared-c is already in comments from subscribe()
      expect(vm.comments).toHaveLength(1);

      restoreFromCacheMock.mockResolvedValue([cachedEvent]);
      await vm.addSubscription('spotify:track:other-1');
      // Should still be 1, not duplicated
      expect(vm.comments).toHaveLength(1);
    });

    it('processes cached deletions before restoring comments', async () => {
      const commentEvent = makeCommentEvent('del-target');
      const deletionEvent = {
        id: 'del-ev',
        pubkey: 'pubkey-del-target',
        content: '',
        created_at: 2000,
        tags: [['e', 'del-target']],
        kind: 5
      };
      verifyDeletionTargetsMock.mockReturnValue(['del-target']);

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      restoreFromCacheMock.mockResolvedValue([deletionEvent, commentEvent]);
      await vm.addSubscription('spotify:track:other-1');
      // del-target should be in deletedIds so comment is excluded from visible
      expect(vm.deletedIds.has('del-target')).toBe(true);
    });

    it('restores cached reactions for the new tag', async () => {
      const reactionEvent = {
        id: 'react-1',
        pubkey: 'reactor',
        content: '+',
        created_at: 1000,
        tags: [['e', 'some-comment']],
        kind: 7
      };
      reactionFromEventMock.mockReturnValue({
        id: 'react-1',
        pubkey: 'reactor',
        content: '+',
        targetEventId: 'some-comment'
      });

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      restoreFromCacheMock.mockResolvedValue([reactionEvent]);
      await vm.addSubscription('spotify:track:other-1');
      // Reaction was processed (applyReaction called)
      expect(applyReactionMock).toHaveBeenCalled();
    });

    it('does not start merged subscription if destroyed during cache restore', async () => {
      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      restoreFromCacheMock.mockImplementation(async () => {
        vm.destroy();
        return [];
      });
      await vm.addSubscription('spotify:track:other-1');
      expect(startMergedSubscriptionMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 10. Deletion event processing
  // -------------------------------------------------------------------------
  describe('deletion event processing', () => {
    it('adds verified targets to deletedIds and rebuilds reaction index', async () => {
      const { getOnPacket } = captureOnPacket();

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      verifyDeletionTargetsMock.mockReturnValue(['target-1', 'target-2']);
      getOnPacket()({
        id: 'del-1',
        pubkey: 'author',
        kind: 5,
        tags: [
          ['e', 'target-1'],
          ['e', 'target-2']
        ],
        content: '',
        created_at: 2000
      });

      expect(vm.deletedIds.has('target-1')).toBe(true);
      expect(vm.deletedIds.has('target-2')).toBe(true);
      expect(buildReactionIndexMock).toHaveBeenCalled();
    });

    it('purges deleted events from cache', async () => {
      // Set up a comment first so commentIds has 'c1'
      const cachedComment = makeCommentEvent('c1');
      restoreFromCacheMock.mockResolvedValue([cachedComment]);

      const { getOnPacket } = captureOnPacket();

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      verifyDeletionTargetsMock.mockReturnValue(['c1']);
      getOnPacket()({
        id: 'del-c1',
        pubkey: 'pubkey-c1',
        kind: 5,
        tags: [['e', 'c1']],
        content: '',
        created_at: 2000
      });

      expect(purgeDeletedFromCacheMock).toHaveBeenCalledWith(['c1']);
    });

    it('invalidates fetch cache for deleted events', async () => {
      const { getOnPacket } = captureOnPacket();

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      verifyDeletionTargetsMock.mockReturnValue(['inv-1']);
      getOnPacket()({
        id: 'del-inv',
        pubkey: 'author',
        kind: 5,
        tags: [['e', 'inv-1']],
        content: '',
        created_at: 2000
      });

      expect(invalidateFetchByIdCacheMock).toHaveBeenCalledWith('inv-1');
    });

    it('ignores deletion event with no verified targets', async () => {
      const { getOnPacket } = captureOnPacket();

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      verifyDeletionTargetsMock.mockReturnValue([]);
      getOnPacket()({
        id: 'del-none',
        pubkey: 'author',
        kind: 5,
        tags: [],
        content: '',
        created_at: 2000
      });

      expect(vm.deletedIds.size).toBe(0);
      expect(buildReactionIndexMock).not.toHaveBeenCalled();
    });

    it('updates orphan placeholder to deleted when deletion arrives', async () => {
      // Set up: fetch orphan parent that returns null → not-found placeholder
      cachedFetchByIdMock.mockResolvedValue(makeCachedFetchByIdResult(null));

      const { getOnPacket } = captureOnPacket();

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      await vm.fetchOrphanParent('orphan-ph', 5_000);
      expect(vm.placeholders.get('orphan-ph')?.status).toBe('not-found');

      // Now deletion arrives for that orphan
      verifyDeletionTargetsMock.mockReturnValue(['orphan-ph']);
      getOnPacket()({
        id: 'del-orphan',
        pubkey: 'author',
        kind: 5,
        tags: [['e', 'orphan-ph']],
        content: '',
        created_at: 3000
      });

      expect(vm.placeholders.get('orphan-ph')?.status).toBe('deleted');
    });

    it('creates deleted placeholder for fetched parent that gets deleted', async () => {
      const parentEvent = makeCommentEvent('fetched-then-del');
      cachedFetchByIdMock.mockResolvedValue(makeCachedFetchByIdResult(parentEvent));

      const { getOnPacket } = captureOnPacket();

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      // Fetch orphan parent successfully → it gets added to comments
      await vm.fetchOrphanParent('fetched-then-del', null);
      expect(vm.comments.find((c) => c.id === 'fetched-then-del')).toBeDefined();

      // Now deletion arrives for that parent
      verifyDeletionTargetsMock.mockReturnValue(['fetched-then-del']);
      getOnPacket()({
        id: 'del-fetched',
        pubkey: 'pubkey-fetched-then-del',
        kind: 5,
        tags: [['e', 'fetched-then-del']],
        content: '',
        created_at: 3000
      });

      // Parent should be hidden from visible comments
      expect(vm.comments.find((c) => c.id === 'fetched-then-del')).toBeUndefined();
      // A deleted placeholder should be created
      expect(vm.placeholders.get('fetched-then-del')?.status).toBe('deleted');
    });
  });

  // -------------------------------------------------------------------------
  // 11. Reaction event processing
  // -------------------------------------------------------------------------
  describe('reaction event processing', () => {
    it('adds reaction to reactionIndex via dispatchPacket', async () => {
      const { getOnPacket } = captureOnPacket();

      reactionFromEventMock.mockReturnValue({
        id: 'r1',
        pubkey: 'reactor',
        content: '+',
        targetEventId: 'comment-1'
      });

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      getOnPacket()({
        id: 'r1',
        pubkey: 'reactor',
        content: '+',
        created_at: 1500,
        tags: [['e', 'comment-1']],
        kind: 7
      });

      expect(reactionFromEventMock).toHaveBeenCalled();
      expect(applyReactionMock).toHaveBeenCalled();
    });

    it('deduplicates reactions with same id', async () => {
      const { getOnPacket } = captureOnPacket();

      reactionFromEventMock.mockReturnValue({
        id: 'r-dup',
        pubkey: 'reactor',
        content: '+',
        targetEventId: 'comment-1'
      });

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      getOnPacket()({
        id: 'r-dup',
        pubkey: 'reactor',
        content: '+',
        created_at: 1500,
        tags: [['e', 'comment-1']],
        kind: 7
      });
      getOnPacket()({
        id: 'r-dup',
        pubkey: 'reactor',
        content: '+',
        created_at: 1500,
        tags: [['e', 'comment-1']],
        kind: 7
      });

      // applyReaction called only once due to dedup
      expect(applyReactionMock).toHaveBeenCalledTimes(1);
    });

    it('does not apply reaction that is already in deletedIds', async () => {
      const { getOnPacket } = captureOnPacket();

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      // First, create a deletion for the reaction id
      verifyDeletionTargetsMock.mockReturnValue(['r-del']);
      getOnPacket()({
        id: 'del-r',
        pubkey: 'reactor',
        kind: 5,
        tags: [['e', 'r-del']],
        content: '',
        created_at: 2000
      });

      // Now the reaction arrives
      reactionFromEventMock.mockReturnValue({
        id: 'r-del',
        pubkey: 'reactor',
        content: '+',
        targetEventId: 'comment-1'
      });
      getOnPacket()({
        id: 'r-del',
        pubkey: 'reactor',
        content: '+',
        created_at: 1000,
        tags: [['e', 'comment-1']],
        kind: 7
      });

      // applyReaction should not be called because reaction id is in deletedIds
      expect(applyReactionMock).not.toHaveBeenCalled();
    });

    it('ignores reaction event where reactionFromEvent returns null', async () => {
      const { getOnPacket } = captureOnPacket();

      reactionFromEventMock.mockReturnValue(null);

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      getOnPacket()({
        id: 'r-null',
        pubkey: 'reactor',
        content: '+',
        created_at: 1500,
        tags: [],
        kind: 7
      });

      expect(applyReactionMock).not.toHaveBeenCalled();
    });

    it('sorts custom emoji reactions by count', async () => {
      const { getOnPacket } = captureOnPacket();

      isLikeReactionMock.mockReturnValue(false);
      applyReactionMock.mockReturnValue({
        likes: 0,
        emojis: [
          { content: ':fire:', count: 1 },
          { content: ':star:', count: 3 }
        ],
        reactors: new Set(['reactor'])
      });

      reactionFromEventMock.mockReturnValue({
        id: 'r-emoji',
        pubkey: 'reactor',
        content: ':fire:',
        targetEventId: 'comment-1'
      });

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      getOnPacket()({
        id: 'r-emoji',
        pubkey: 'reactor',
        content: ':fire:',
        created_at: 1500,
        tags: [['e', 'comment-1']],
        kind: 7
      });

      // The VM sorts emojis by count descending
      const stats = vm.reactionIndex.get('comment-1');
      expect(stats).toBeDefined();
      expect(stats!.emojis[0].count).toBeGreaterThanOrEqual(stats!.emojis[1].count);
    });
  });

  // -------------------------------------------------------------------------
  // 12. Content reaction event processing (kind:17)
  // -------------------------------------------------------------------------
  describe('content reaction event processing (kind:17)', () => {
    it('adds content reaction to contentReactions via dispatchPacket', async () => {
      const { getOnPacket } = captureOnPacket();

      contentReactionFromEventMock.mockReturnValue({
        id: 'cr1',
        pubkey: 'reactor',
        createdAt: 1500
      });

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      getOnPacket()({
        id: 'cr1',
        pubkey: 'reactor',
        content: '',
        created_at: 1500,
        tags: [],
        kind: 17
      });

      expect(contentReactionFromEventMock).toHaveBeenCalled();
      expect(vm.contentReactions).toHaveLength(1);
      expect(vm.contentReactions[0].id).toBe('cr1');
    });

    it('deduplicates content reactions with same id', async () => {
      const { getOnPacket } = captureOnPacket();

      contentReactionFromEventMock.mockReturnValue({
        id: 'cr-dup',
        pubkey: 'reactor',
        createdAt: 1500
      });

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      const event = {
        id: 'cr-dup',
        pubkey: 'reactor',
        content: '',
        created_at: 1500,
        tags: [],
        kind: 17
      };
      getOnPacket()(event);
      getOnPacket()(event);

      // Should only appear once due to dedup
      expect(vm.contentReactions).toHaveLength(1);
      expect(contentReactionFromEventMock).toHaveBeenCalledTimes(1);
    });

    it('does not include content reaction that is in deletedIds', async () => {
      const { getOnPacket } = captureOnPacket();

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      // First, create a deletion for the content reaction id
      verifyDeletionTargetsMock.mockReturnValue(['cr-del']);
      getOnPacket()({
        id: 'del-cr',
        pubkey: 'reactor',
        kind: 5,
        tags: [['e', 'cr-del']],
        content: '',
        created_at: 2000
      });

      // Now the content reaction arrives
      contentReactionFromEventMock.mockReturnValue({
        id: 'cr-del',
        pubkey: 'reactor',
        createdAt: 1000
      });
      getOnPacket()({
        id: 'cr-del',
        pubkey: 'reactor',
        content: '',
        created_at: 1000,
        tags: [],
        kind: 17
      });

      // contentReactions should be empty because cr-del is in deletedIds
      expect(vm.contentReactions).toHaveLength(0);
    });

    it('restores kind:17 content reactions from cache', async () => {
      const contentReactionEvent = {
        id: 'cached-cr',
        pubkey: 'reactor',
        content: '',
        created_at: 1000,
        tags: [],
        kind: 17
      };
      contentReactionFromEventMock.mockReturnValue({
        id: 'cached-cr',
        pubkey: 'reactor',
        createdAt: 1000
      });
      restoreFromCacheMock.mockResolvedValue([contentReactionEvent]);

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      expect(contentReactionFromEventMock).toHaveBeenCalledWith(contentReactionEvent);
      expect(vm.contentReactions).toHaveLength(1);
      expect(vm.contentReactions[0].id).toBe('cached-cr');
    });
  });

  // -------------------------------------------------------------------------
  // 14. Comment event processing
  // -------------------------------------------------------------------------
  describe('comment event processing', () => {
    it('adds new comment via live subscription', async () => {
      const { getOnPacket } = captureOnPacket();

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      getOnPacket()(makeCommentEvent('live-c1'));

      expect(vm.comments).toHaveLength(1);
      expect(vm.comments[0].id).toBe('live-c1');
    });

    it('DB 書き込みが reject しても live コメントを処理する', async () => {
      const { getOnPacket } = captureOnPacket();
      cacheCommentEventMock.mockRejectedValueOnce(new Error('quota exceeded'));

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      getOnPacket()(makeCommentEvent('live-cache-fail'));
      await flushPromises();

      expect(vm.comments).toHaveLength(1);
      expect(vm.comments[0].id).toBe('live-cache-fail');
    });

    it('deduplicates comments with same id', async () => {
      const { getOnPacket } = captureOnPacket();

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      getOnPacket()(makeCommentEvent('dup-c'));
      getOnPacket()(makeCommentEvent('dup-c'));

      expect(vm.comments).toHaveLength(1);
    });

    it('excludes deleted comments from visible list', async () => {
      const { getOnPacket } = captureOnPacket();

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      // Add comment
      getOnPacket()(makeCommentEvent('visible-c'));
      expect(vm.comments).toHaveLength(1);

      // Delete the comment
      verifyDeletionTargetsMock.mockReturnValue(['visible-c']);
      getOnPacket()({
        id: 'del-visible',
        pubkey: 'pubkey-visible-c',
        kind: 5,
        tags: [['e', 'visible-c']],
        content: '',
        created_at: 2000
      });

      expect(vm.comments).toHaveLength(0);
      expect(vm.deletedIds.has('visible-c')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 15. Cache restore edge cases
  // -------------------------------------------------------------------------
  describe('cache restore', () => {
    it('restores reactions from cache', async () => {
      const reactionEvent = {
        id: 'cached-r',
        pubkey: 'reactor',
        content: '+',
        created_at: 1000,
        tags: [['e', 'c1']],
        kind: 7
      };
      reactionFromEventMock.mockReturnValue({
        id: 'cached-r',
        pubkey: 'reactor',
        content: '+',
        targetEventId: 'c1'
      });
      restoreFromCacheMock.mockResolvedValue([reactionEvent]);

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      expect(reactionFromEventMock).toHaveBeenCalledWith(reactionEvent);
    });

    it('restores deletions from cache and rebuilds reaction index', async () => {
      const commentEvent = makeCommentEvent('cached-del-target');
      const deletionEvent = {
        id: 'cached-del',
        pubkey: 'pubkey-cached-del-target',
        content: '',
        created_at: 2000,
        tags: [['e', 'cached-del-target']],
        kind: 5
      };
      verifyDeletionTargetsMock.mockReturnValue(['cached-del-target']);
      restoreFromCacheMock.mockResolvedValue([commentEvent, deletionEvent]);

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      expect(vm.deletedIds.has('cached-del-target')).toBe(true);
      expect(buildReactionIndexMock).toHaveBeenCalled();
    });

    it('passes maxCreatedAt from cache to startSubscription', async () => {
      const event1 = { ...makeCommentEvent('e1'), created_at: 100 };
      const event2 = { ...makeCommentEvent('e2'), created_at: 200 };
      restoreFromCacheMock.mockResolvedValue([event1, event2]);

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      expect(startSubscriptionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        200,
        expect.anything(),
        expect.anything()
      );
    });

    it('passes null maxCreatedAt when cache is empty', async () => {
      restoreFromCacheMock.mockResolvedValue([]);

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      expect(startSubscriptionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        null,
        expect.anything(),
        expect.anything()
      );
    });

    it('purges deleted events from cache after restore', async () => {
      const commentEvent = makeCommentEvent('purge-target');
      const deletionEvent = {
        id: 'del-purge',
        pubkey: 'pubkey-purge-target',
        content: '',
        created_at: 2000,
        tags: [['e', 'purge-target']],
        kind: 5
      };
      verifyDeletionTargetsMock.mockReturnValue(['purge-target']);
      restoreFromCacheMock.mockResolvedValue([commentEvent, deletionEvent]);

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      expect(purgeDeletedFromCacheMock).toHaveBeenCalledWith(['purge-target']);
    });
  });

  // -------------------------------------------------------------------------
  // 16. Loading timeout
  // -------------------------------------------------------------------------
  describe('loading timeout', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('sets loading=false after timeout even without backward complete', async () => {
      vi.useFakeTimers();
      startSubscriptionMock.mockReturnValue([{ unsubscribe: vi.fn() }, { unsubscribe: vi.fn() }]);

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();
      expect(vm.loading).toBe(true);

      vi.advanceTimersByTime(10_000);
      expect(vm.loading).toBe(false);
    });

    it('clears loading timeout on destroy', async () => {
      vi.useFakeTimers();
      startSubscriptionMock.mockReturnValue([{ unsubscribe: vi.fn() }, { unsubscribe: vi.fn() }]);

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();
      vm.destroy();

      // Advancing should not cause issues
      vi.advanceTimersByTime(10_000);
    });
  });

  // -------------------------------------------------------------------------
  // 17. fetchOrphanParent — destroyed during fetch
  // -------------------------------------------------------------------------
  describe('fetchOrphanParent: destroyed during fetch', () => {
    it('does not update state when destroyed while fetch is pending', async () => {
      let resolveFetch!: (val: ReturnType<typeof makeCachedFetchByIdResult>) => void;
      cachedFetchByIdMock.mockImplementation(
        () =>
          new Promise((r) => {
            resolveFetch = r;
          })
      );

      const vm = createCommentViewModel(contentId, provider);
      const promise = vm.fetchOrphanParent('destroyed-parent', null);

      vm.destroy();
      resolveFetch(makeCachedFetchByIdResult(makeCommentEvent('destroyed-parent')));
      await promise;

      // Comments should still be empty after destroy
      expect(vm.comments).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // 18. subscribe error handling
  // -------------------------------------------------------------------------
  describe('subscribe error handling', () => {
    it('sets loading=false and logs error when startDeletionReconcile throws', async () => {
      // startDeletionReconcile is called BEFORE startSubscription,
      // so an error here prevents live subscriptions from being created.
      const cachedEvent = makeCommentEvent('err-c');
      restoreFromCacheMock.mockResolvedValue([cachedEvent]);
      startDeletionReconcileMock.mockImplementation(() => {
        throw new Error('reconcile failed');
      });

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      expect(vm.loading).toBe(false);
      expect(logErrorMock).toHaveBeenCalled();
      // startSubscription should not have been called
      expect(startSubscriptionMock).not.toHaveBeenCalled();
    });
  });
});
