import type * as ResonoteRuntimeModule from '@auftakt/resonote';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { coordinator, createResonoteCoordinatorMock } = vi.hoisted(() => {
  const coordinator = {
    observeRelayCapabilities: vi.fn(),
    snapshotRelayCapabilities: vi.fn()
  };
  return {
    coordinator,
    createResonoteCoordinatorMock: vi.fn(() => coordinator)
  };
});

vi.mock('@auftakt/resonote', async (importOriginal) => {
  const actual = await importOriginal<typeof ResonoteRuntimeModule>();
  return {
    ...actual,
    createResonoteCoordinator: createResonoteCoordinatorMock
  };
});

vi.mock('$shared/auftakt/cached-read.svelte.js', () => ({
  cachedFetchById: vi.fn(),
  invalidateFetchByIdCache: vi.fn(),
  useCachedLatest: vi.fn()
}));

vi.mock('$shared/nostr/client.js', () => ({
  castSigned: vi.fn(),
  fetchLatestEvent: vi.fn(),
  getRelayConnectionState: vi.fn(),
  getRelaySession: vi.fn(),
  observePublishAcks: vi.fn(),
  observeRelayConnectionStates: vi.fn(),
  setDefaultRelays: vi.fn()
}));

vi.mock('$shared/nostr/event-db.js', () => ({
  DEFAULT_EVENTS_DB_NAME: 'resonote-dexie-events',
  getEventsDB: vi.fn()
}));

vi.mock('$shared/nostr/pending-publishes.js', () => ({
  addPendingPublish: vi.fn(),
  drainPendingPublishes: vi.fn()
}));

vi.mock('$shared/nostr/content-parser.js', () => ({
  parseCommentContent: vi.fn()
}));

vi.mock('$shared/utils/emoji.js', () => ({
  addEmojiTag: vi.fn(),
  extractShortcode: vi.fn()
}));

import { observeRelayCapabilities, snapshotRelayCapabilities } from './resonote.js';

describe('relay capability facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates capability snapshots through the Auftakt coordinator', async () => {
    const snapshot = {
      url: 'wss://relay.example',
      maxFilters: 2,
      maxSubscriptions: 1,
      supportedNips: [1, 11],
      source: 'nip11',
      expiresAt: 100,
      stale: false,
      queueDepth: 0,
      activeSubscriptions: 0
    };
    coordinator.snapshotRelayCapabilities.mockResolvedValueOnce([snapshot]);

    await expect(snapshotRelayCapabilities(['wss://relay.example'])).resolves.toEqual([snapshot]);
    expect(coordinator.snapshotRelayCapabilities).toHaveBeenCalledWith(['wss://relay.example']);
  });

  it('delegates capability observation through the Auftakt coordinator', async () => {
    const unsubscribe = vi.fn();
    const onPacket = vi.fn();
    coordinator.observeRelayCapabilities.mockResolvedValueOnce({ unsubscribe });

    await expect(observeRelayCapabilities(onPacket)).resolves.toEqual({
      unsubscribe
    });
    expect(coordinator.observeRelayCapabilities).toHaveBeenCalledWith(onPacket);
  });
});
