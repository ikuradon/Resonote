import { beforeEach, describe, expect, it, vi } from 'vitest';

interface TestEmojiCategory {
  id: string;
  name: string;
  emojis: Array<{ id: string; name: string; skins: Array<{ src: string }> }>;
}

interface TestCustomEmojiDiagnosticsResult {
  diagnostics: {
    listEvent: null;
    sets: [];
    missingRefs: [];
    invalidRefs: [];
    warnings: [];
    sourceMode: 'unknown';
  };
  categories: TestEmojiCategory[];
}

interface TestCustomEmojiSourcesResult {
  listEvent: null;
  setEvents: [];
}

const { coordinator } = vi.hoisted(() => ({
  coordinator: {
    clearStoredEvents: vi.fn(async () => undefined),
    deleteStoredEventsByKinds: vi.fn(async () => undefined),
    fetchCustomEmojiCategories: vi.fn(async (): Promise<TestEmojiCategory[]> => []),
    fetchCustomEmojiSourceDiagnostics: vi.fn(
      async (): Promise<TestCustomEmojiDiagnosticsResult> => ({
        diagnostics: {
          listEvent: null,
          sets: [],
          missingRefs: [],
          invalidRefs: [],
          warnings: [],
          sourceMode: 'unknown'
        },
        categories: []
      })
    ),
    fetchCustomEmojiSources: vi.fn(
      async (): Promise<TestCustomEmojiSourcesResult> => ({ listEvent: null, setEvents: [] })
    )
  }
}));

vi.mock('@auftakt/resonote', () => ({
  buildCommentContentFilters: vi.fn(),
  createResonoteCoordinator: () => coordinator,
  startCommentDeletionReconcile: vi.fn(),
  startCommentSubscription: vi.fn(),
  startMergedCommentSubscription: vi.fn()
}));

vi.mock('@auftakt/runtime', () => ({
  AUFTAKT_RUNTIME_PLUGIN_API_VERSION: 'v1',
  cachedFetchById: vi.fn((runtime, eventId) => runtime.cachedFetchById(eventId)),
  createBackwardReq: vi.fn(() => ({ emit: vi.fn(), over: vi.fn() })),
  createForwardReq: vi.fn(() => ({ emit: vi.fn(), over: vi.fn() })),
  fetchLatestEvent: vi.fn((runtime, pubkey, kind) => runtime.fetchLatestEvent(pubkey, kind)),
  invalidateFetchByIdCache: vi.fn((runtime, eventId) => runtime.invalidateFetchByIdCache(eventId)),
  uniq: vi.fn(() => ({})),
  useCachedLatest: vi.fn((runtime, pubkey, kind) => runtime.useCachedLatest(pubkey, kind))
}));

vi.mock('$shared/auftakt/cached-read.svelte.js', () => ({
  cachedFetchById: vi.fn(),
  invalidateFetchByIdCache: vi.fn(),
  useCachedLatest: vi.fn()
}));

vi.mock('$shared/nostr/client.js', () => ({
  castSigned: vi.fn(),
  fetchLatestEvent: vi.fn(),
  getDefaultRelayUrls: vi.fn(async () => []),
  getRelayConnectionState: vi.fn(),
  getRelaySession: vi.fn(),
  observePublishAcks: vi.fn(),
  observeRelayConnectionStates: vi.fn(),
  setDefaultRelays: vi.fn()
}));

vi.mock('$shared/nostr/event-db.js', () => ({
  DEFAULT_EVENTS_DB_NAME: 'resonote-events',
  getEventsDB: vi.fn()
}));

vi.mock('$shared/nostr/pending-publishes.js', () => ({
  addPendingPublish: vi.fn(),
  drainPendingPublishes: vi.fn()
}));

const facade = await import('./resonote.js');

function makeCategory(id: string): TestEmojiCategory {
  return {
    id,
    name: id,
    emojis: [{ id: 'wave', name: 'wave', skins: [{ src: 'https://example.com/wave.png' }] }]
  };
}

describe('custom emoji app facade generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    coordinator.clearStoredEvents.mockResolvedValue(undefined);
    coordinator.deleteStoredEventsByKinds.mockResolvedValue(undefined);
    coordinator.fetchCustomEmojiCategories.mockResolvedValue([]);
    coordinator.fetchCustomEmojiSourceDiagnostics.mockResolvedValue({
      diagnostics: {
        listEvent: null,
        sets: [],
        missingRefs: [],
        invalidRefs: [],
        warnings: [],
        sourceMode: 'unknown'
      },
      categories: []
    });
    coordinator.fetchCustomEmojiSources.mockResolvedValue({ listEvent: null, setEvents: [] });
  });

  it('advances custom emoji cache generation when all stored events are cleared', async () => {
    const before = facade.getCustomEmojiCacheGeneration();

    await facade.clearStoredEvents();

    expect(facade.getCustomEmojiCacheGeneration()).toBe(before + 1);
    expect(coordinator.clearStoredEvents).toHaveBeenCalledOnce();
  });

  it('only advances custom emoji cache generation when deleted kinds include custom emoji events', async () => {
    const before = facade.getCustomEmojiCacheGeneration();

    await facade.deleteStoredEventsByKinds([1, 3]);

    expect(facade.getCustomEmojiCacheGeneration()).toBe(before);
    expect(coordinator.deleteStoredEventsByKinds).toHaveBeenCalledWith([1, 3]);

    await facade.deleteStoredEventsByKinds([10030]);

    expect(facade.getCustomEmojiCacheGeneration()).toBe(before + 1);
    expect(coordinator.deleteStoredEventsByKinds).toHaveBeenCalledWith([10030]);
  });

  it('routes custom emoji categories through guarded diagnostics', async () => {
    const category = makeCategory('custom-inline');
    coordinator.fetchCustomEmojiSourceDiagnostics.mockResolvedValue({
      diagnostics: {
        listEvent: null,
        sets: [],
        missingRefs: [],
        invalidRefs: [],
        warnings: [],
        sourceMode: 'unknown'
      },
      categories: [category]
    });
    coordinator.fetchCustomEmojiCategories.mockResolvedValue([makeCategory('unguarded')]);

    await expect(facade.fetchCustomEmojiCategories('pubkey')).resolves.toEqual([category]);

    expect(coordinator.fetchCustomEmojiCategories).not.toHaveBeenCalled();
    expect(coordinator.fetchCustomEmojiSourceDiagnostics).toHaveBeenCalledWith('pubkey', {
      generation: expect.any(Number),
      getGeneration: expect.any(Function)
    });
  });

  it('passes generation guard options when fetching custom emoji sources', async () => {
    await facade.fetchCustomEmojiSources('pubkey');

    expect(coordinator.fetchCustomEmojiSources).toHaveBeenCalledWith('pubkey', {
      generation: expect.any(Number),
      getGeneration: expect.any(Function)
    });
    const [, options] = coordinator.fetchCustomEmojiSources.mock.calls[0] as unknown as [
      string,
      { generation: number; getGeneration: () => number }
    ];
    expect(options.getGeneration()).toBe(options.generation);
  });

  it('passes generation guard options when fetching custom emoji diagnostics', async () => {
    await facade.fetchCustomEmojiSourceDiagnostics('pubkey');

    expect(coordinator.fetchCustomEmojiSourceDiagnostics).toHaveBeenCalledWith('pubkey', {
      generation: expect.any(Number),
      getGeneration: expect.any(Function)
    });
    const [, options] = coordinator.fetchCustomEmojiSourceDiagnostics.mock.calls[0] as unknown as [
      string,
      { generation: number; getGeneration: () => number }
    ];
    expect(options.getGeneration()).toBe(options.generation);
  });
});
