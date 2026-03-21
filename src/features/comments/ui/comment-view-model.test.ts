import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  loadSubscriptionDepsMock,
  getCommentRepositoryMock,
  restoreFromCacheMock,
  buildContentFiltersMock,
  startSubscriptionMock,
  startDeletionReconcileMock,
  startMergedSubscriptionMock,
  purgeDeletedFromCacheMock,
  commentFromEventMock,
  reactionFromEventMock,
  placeholderFromOrphanMock,
  emptyStatsMock,
  applyReactionMock,
  buildReactionIndexMock,
  isLikeReactionMock,
  verifyDeletionTargetsMock,
  cachedFetchByIdMock,
  invalidateFetchByIdCacheMock,
  logInfoMock,
  logDebugMock,
  logErrorMock
} = vi.hoisted(() => {
  const mockSub = { unsubscribe: vi.fn() };
  return {
    loadSubscriptionDepsMock: vi.fn().mockResolvedValue({
      rxNostr: {},
      rxNostrMod: {},
      rxjsMerge: vi.fn()
    }),
    getCommentRepositoryMock: vi.fn().mockResolvedValue({ put: vi.fn() }),
    restoreFromCacheMock: vi.fn().mockResolvedValue([]),
    buildContentFiltersMock: vi.fn().mockReturnValue([]),
    startSubscriptionMock: vi.fn().mockReturnValue([mockSub, mockSub]),
    startDeletionReconcileMock: vi.fn().mockReturnValue({ sub: mockSub, timeout: undefined }),
    startMergedSubscriptionMock: vi.fn().mockReturnValue(mockSub),
    purgeDeletedFromCacheMock: vi.fn().mockResolvedValue(undefined),
    commentFromEventMock: vi.fn((event: { id: string; pubkey: string; content: string; created_at: number; tags: string[][] }) => ({
      id: event.id,
      pubkey: event.pubkey,
      content: event.content,
      createdAt: event.created_at,
      positionMs: null,
      emojiTags: [],
      replyTo: null,
      contentWarning: null
    })),
    reactionFromEventMock: vi.fn().mockReturnValue(null),
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
    cachedFetchByIdMock: vi.fn().mockResolvedValue(null),
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
  getCommentRepository: getCommentRepositoryMock,
  restoreFromCache: restoreFromCacheMock,
  buildContentFilters: buildContentFiltersMock,
  startSubscription: startSubscriptionMock,
  startDeletionReconcile: startDeletionReconcileMock,
  startMergedSubscription: startMergedSubscriptionMock,
  purgeDeletedFromCache: purgeDeletedFromCacheMock
}));

vi.mock('../domain/comment-mappers.js', () => ({
  commentFromEvent: commentFromEventMock,
  reactionFromEvent: reactionFromEventMock,
  placeholderFromOrphan: placeholderFromOrphanMock
}));

vi.mock('../domain/reaction-rules.js', () => ({
  emptyStats: emptyStatsMock,
  applyReaction: applyReactionMock,
  buildReactionIndex: buildReactionIndexMock,
  isLikeReaction: isLikeReactionMock
}));

vi.mock('../domain/deletion-rules.js', () => ({
  verifyDeletionTargets: verifyDeletionTargetsMock
}));

vi.mock('$shared/nostr/events.js', () => ({
  COMMENT_KIND: 1111,
  REACTION_KIND: 7,
  DELETION_KIND: 5,
  extractDeletionTargets: vi.fn().mockReturnValue([]),
  parsePosition: vi.fn().mockReturnValue(null)
}));

vi.mock('$shared/nostr/cached-query.js', () => ({
  cachedFetchById: cachedFetchByIdMock,
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

function makeCommentEvent(id: string, overrides: Partial<{
  pubkey: string;
  content: string;
  created_at: number;
  positionMs: number | null;
  kind: number;
}> = {}) {
  return {
    id,
    pubkey: overrides.pubkey ?? 'pubkey-' + id,
    content: overrides.content ?? 'content-' + id,
    created_at: overrides.created_at ?? 1000,
    tags: overrides.positionMs != null ? [['position', String(overrides.positionMs)]] : [],
    kind: overrides.kind ?? 1111
  };
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
      rxNostr: {},
      rxNostrMod: {},
      rxjsMerge: vi.fn()
    });
    getCommentRepositoryMock.mockResolvedValue({ put: vi.fn() });
    restoreFromCacheMock.mockResolvedValue([]);
    buildContentFiltersMock.mockReturnValue([]);
    startSubscriptionMock.mockReturnValue([mockSub, mockSub]);
    startDeletionReconcileMock.mockReturnValue({ sub: mockSub, timeout: undefined });
    startMergedSubscriptionMock.mockReturnValue(mockSub);
    purgeDeletedFromCacheMock.mockResolvedValue(undefined);
    commentFromEventMock.mockImplementation((event: { id: string; pubkey: string; content: string; created_at: number; tags: string[][] }) => ({
      id: event.id,
      pubkey: event.pubkey,
      content: event.content,
      createdAt: event.created_at,
      positionMs: null,
      emojiTags: [],
      replyTo: null,
      contentWarning: null
    }));
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
    cachedFetchByIdMock.mockResolvedValue(null);
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
    it('calls loadSubscriptionDeps and getCommentRepository', async () => {
      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();
      expect(loadSubscriptionDepsMock).toHaveBeenCalledOnce();
      expect(getCommentRepositoryMock).toHaveBeenCalledOnce();
    });

    it('calls restoreFromCache with tag query derived from provider', async () => {
      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();
      expect(restoreFromCacheMock).toHaveBeenCalledWith(expect.anything(), 'I:spotify:track:track-1');
    });

    it('calls startSubscription after loading deps', async () => {
      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();
      expect(startSubscriptionMock).toHaveBeenCalledOnce();
    });

    it('sets loading=false when backward complete callback fires', async () => {
      startSubscriptionMock.mockImplementation(
        (_refs: unknown, _filters: unknown, _maxCreatedAt: unknown, _onPacket: unknown, onBackwardComplete: () => void) => {
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
      cachedFetchByIdMock.mockResolvedValue(parentEvent);

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
      cachedFetchByIdMock.mockResolvedValue(parentEvent);

      const vm = createCommentViewModel(contentId, provider);
      await vm.fetchOrphanParent('parent-1', null);

      expect(commentFromEventMock).toHaveBeenCalledWith(parentEvent);
      expect(vm.comments).toHaveLength(1);
      expect(vm.comments[0].id).toBe('parent-1');
    });

    it('passes estimatedPositionMs to placeholderFromOrphan', async () => {
      const parentEvent = makeCommentEvent('parent-1');
      cachedFetchByIdMock.mockResolvedValue(parentEvent);

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
      cachedFetchByIdMock.mockResolvedValue(null);

      const vm = createCommentViewModel(contentId, provider);
      await vm.fetchOrphanParent('missing-parent', null);

      const ph = vm.placeholders.get('missing-parent');
      expect(ph).toBeDefined();
      expect(ph?.status).toBe('not-found');
    });

    it('sets placeholder status to not-found when fetch returns non-comment kind event', async () => {
      cachedFetchByIdMock.mockResolvedValue({ ...makeCommentEvent('kind0-event'), kind: 0 });

      const vm = createCommentViewModel(contentId, provider);
      await vm.fetchOrphanParent('kind0-event', 5_000);

      const ph = vm.placeholders.get('kind0-event');
      expect(ph?.status).toBe('not-found');
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
          onPacket: (event: { id: string; pubkey: string; kind: number; tags: string[][]; content: string; created_at: number }) => void,
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
    it('shows deleted placeholder when parent is deleted while fetching', async () => {
      const parentId = 'race-parent';

      // cachedFetchById resolves with the event but by then deletedIds contains parentId
      cachedFetchByIdMock.mockImplementation(async () => {
        // Simulate deletion arriving during the fetch: inject deletedIds via a deletion packet
        // We need to reach the internal state — instead test observable outcome:
        // The parent is in deletedIds when fetch resolves. We can achieve this by
        // having verifyDeletionTargets return parentId on the deletion event dispatched
        // via startSubscription, and having cachedFetchById resolve after that.
        return makeCommentEvent(parentId);
      });

      // Use a promise to control timing
      let resolveDelete!: () => void;
      const deletionTriggered = new Promise<void>((res) => { resolveDelete = res; });

      startSubscriptionMock.mockImplementation(
        (
          _refs: unknown,
          _filters: unknown,
          _maxCreatedAt: unknown,
          onPacket: (event: { id: string; pubkey: string; kind: number; tags: string[][]; content: string; created_at: number }) => void,
          onBackwardComplete: () => void
        ) => {
          onBackwardComplete();
          // Schedule deletion dispatch after subscribe resolves but before fetchOrphanParent awaits
          Promise.resolve().then(() => {
            verifyDeletionTargetsMock.mockReturnValue([parentId]);
            onPacket({
              id: 'del-event-race',
              pubkey: 'author',
              kind: 5,
              tags: [['e', parentId]],
              content: '',
              created_at: 3000
            });
            resolveDelete();
          });
          return [{ unsubscribe: vi.fn() }, { unsubscribe: vi.fn() }];
        }
      );

      // Make cachedFetchById wait for the deletion to be processed first
      cachedFetchByIdMock.mockImplementation(async () => {
        await deletionTriggered;
        return makeCommentEvent(parentId);
      });

      const vm = createCommentViewModel(contentId, provider);
      await vm.subscribe();

      verifyDeletionTargetsMock.mockReturnValue([]);
      await vm.fetchOrphanParent(parentId, null);

      const ph = vm.placeholders.get(parentId);
      expect(ph).toBeDefined();
      expect(ph?.status).toBe('deleted');
    });
  });

  // -------------------------------------------------------------------------
  // 8. fetchOrphanParent — dedup (fetchedParentIds guard)
  // -------------------------------------------------------------------------
  describe('fetchOrphanParent: dedup guard', () => {
    it('does not fetch a second time for the same parentId', async () => {
      cachedFetchByIdMock.mockResolvedValue(makeCommentEvent('dup-parent'));

      const vm = createCommentViewModel(contentId, provider);
      await vm.fetchOrphanParent('dup-parent', null);
      await vm.fetchOrphanParent('dup-parent', null);

      expect(cachedFetchByIdMock).toHaveBeenCalledOnce();
    });

    it('updates positionMs on second call if existing placeholder has null positionMs', async () => {
      // First call: fetch resolves to null → not-found placeholder with positionMs=null
      cachedFetchByIdMock.mockResolvedValue(null);

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
      cachedFetchByIdMock.mockResolvedValue(null);

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
});
