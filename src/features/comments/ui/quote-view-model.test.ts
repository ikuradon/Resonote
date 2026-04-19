import { beforeEach, describe, expect, it, vi } from 'vitest';

const PK_AUTHOR = 'aaaa'.repeat(16);
const EVENT_ID = 'bbbb'.repeat(16);

const mockCachedFetchById = vi.fn();
const mockGetDisplayName = vi.fn();
const mockFetchProfile = vi.fn();

vi.mock('$shared/auftakt/resonote.js', () => ({
  cachedFetchById: async (id: string) => ({
    event: await mockCachedFetchById(id),
    settlement: { phase: 'settled', provenance: 'none', reason: 'settled-miss' } as const
  })
}));

vi.mock('$shared/browser/profile.js', () => ({
  getDisplayName: (...args: unknown[]) => mockGetDisplayName(...args),
  fetchProfile: (...args: unknown[]) => mockFetchProfile(...args)
}));

vi.mock('$shared/nostr/events.js', () => ({
  COMMENT_KIND: 1111
}));

vi.mock('$shared/utils/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() })
}));

describe('createQuoteViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDisplayName.mockReturnValue('Author');
    mockFetchProfile.mockResolvedValue(undefined);
  });

  it('loads event and resolves to loaded status', async () => {
    mockCachedFetchById.mockResolvedValue({
      id: EVENT_ID,
      pubkey: PK_AUTHOR,
      content: 'Hello world',
      created_at: 1700000000,
      kind: 1111,
      tags: []
    });

    const { createQuoteViewModel } = await import('./quote-view-model.svelte.js');
    const vm = createQuoteViewModel(EVENT_ID);

    expect(vm.status).toBe('loading');

    // Wait for async load
    await vi.waitFor(() => expect(vm.status).toBe('loaded'));

    expect(vm.data).not.toBeNull();
    expect(vm.data!.content).toBe('Hello world');
    expect(vm.data!.isComment).toBe(true);
    expect(vm.authorName).toBe('Author');
    expect(mockCachedFetchById).toHaveBeenCalledWith(EVENT_ID);
  });

  it('sets not-found when event is null', async () => {
    mockCachedFetchById.mockResolvedValue(null);

    const { createQuoteViewModel } = await import('./quote-view-model.svelte.js');
    const vm = createQuoteViewModel(EVENT_ID);

    await vi.waitFor(() => expect(vm.status).toBe('not-found'));

    expect(vm.data).toBeNull();
  });

  it('detects non-comment events', async () => {
    mockCachedFetchById.mockResolvedValue({
      id: EVENT_ID,
      pubkey: PK_AUTHOR,
      content: 'A kind:1 note',
      created_at: 1700000000,
      kind: 1,
      tags: []
    });

    const { createQuoteViewModel } = await import('./quote-view-model.svelte.js');
    const vm = createQuoteViewModel(EVENT_ID);

    await vi.waitFor(() => expect(vm.status).toBe('loaded'));

    expect(vm.data!.isComment).toBe(false);
  });

  it('updates authorName after background profile fetch', async () => {
    let resolveProfile!: () => void;
    mockFetchProfile.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveProfile = resolve;
      })
    );
    mockCachedFetchById.mockResolvedValue({
      id: EVENT_ID,
      pubkey: PK_AUTHOR,
      content: 'test',
      created_at: 1700000000,
      kind: 1111,
      tags: []
    });
    mockGetDisplayName.mockReturnValue('npub1aaa...');

    const { createQuoteViewModel } = await import('./quote-view-model.svelte.js');
    const vm = createQuoteViewModel(EVENT_ID);

    await vi.waitFor(() => expect(vm.status).toBe('loaded'));
    expect(vm.authorName).toBe('npub1aaa...');

    // Simulate profile fetch completing and name resolving
    mockGetDisplayName.mockReturnValue('Alice');
    resolveProfile();

    await vi.waitFor(() => expect(vm.authorName).toBe('Alice'));
  });

  it('sets not-found when cachedFetchById throws', async () => {
    mockCachedFetchById.mockRejectedValue(new Error('network error'));

    const { createQuoteViewModel } = await import('./quote-view-model.svelte.js');
    const vm = createQuoteViewModel(EVENT_ID);

    await vi.waitFor(() => expect(vm.status).toBe('not-found'));

    expect(vm.data).toBeNull();
  });

  it('extracts content-warning tag', async () => {
    mockCachedFetchById.mockResolvedValue({
      id: EVENT_ID,
      pubkey: PK_AUTHOR,
      content: 'Sensitive content',
      created_at: 1700000000,
      kind: 1111,
      tags: [['content-warning', 'NSFW']]
    });

    const { createQuoteViewModel } = await import('./quote-view-model.svelte.js');
    const vm = createQuoteViewModel(EVENT_ID);

    await vi.waitFor(() => expect(vm.status).toBe('loaded'));

    expect(vm.data!.contentWarning).toBe('NSFW');
  });

  it('sets contentWarning to null when no CW tag', async () => {
    mockCachedFetchById.mockResolvedValue({
      id: EVENT_ID,
      pubkey: PK_AUTHOR,
      content: 'Normal content',
      created_at: 1700000000,
      kind: 1111,
      tags: []
    });

    const { createQuoteViewModel } = await import('./quote-view-model.svelte.js');
    const vm = createQuoteViewModel(EVENT_ID);

    await vi.waitFor(() => expect(vm.status).toBe('loaded'));

    expect(vm.data!.contentWarning).toBeNull();
  });
});
