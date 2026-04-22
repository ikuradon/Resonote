import { createRxBackwardReq, createRxForwardReq, uniq, verifier } from '@auftakt/adapter-relay';
import type { StoredEvent } from '@auftakt/core';
import {
  buildCommentContentFilters as buildCommentContentFiltersImpl,
  cachedFetchById as cachedFetchByIdHelper,
  castSigned as castSignedHelper,
  type CommentFilterKinds,
  type CommentSubscriptionRefs,
  type DeletionEvent,
  type EmojiCategory,
  fetchCustomEmojiCategories as fetchCustomEmojiCategoriesImpl,
  fetchCustomEmojiSources as fetchCustomEmojiSourcesImpl,
  fetchFollowListSnapshot as fetchFollowListSnapshotImpl,
  fetchLatestEvent as fetchLatestEventHelper,
  fetchNostrEventById as fetchNostrEventByIdImpl,
  fetchProfileCommentEvents as fetchProfileCommentEventsImpl,
  fetchProfileMetadataEvents as fetchProfileMetadataEventsImpl,
  fetchRelayListEvents as fetchRelayListEventsImpl,
  fetchWot as fetchWotImpl,
  invalidateFetchByIdCache as invalidateFetchByIdCacheHelper,
  loadCommentSubscriptionDeps as loadCommentSubscriptionDepsImpl,
  observeRelayStatuses as observeRelayStatusesImpl,
  publishSignedEvents as publishSignedEventsHelper,
  type ResonoteRuntime,
  retryPendingPublishes as retryPendingPublishesHelper,
  searchBookmarkDTagEvent as searchBookmarkDTagEventImpl,
  searchEpisodeBookmarkByGuid as searchEpisodeBookmarkByGuidImpl,
  setDefaultRelays as setDefaultRelaysHelper,
  snapshotRelayStatuses as snapshotRelayStatusesImpl,
  startCommentDeletionReconcile as startCommentDeletionReconcileImpl,
  startCommentSubscription as startCommentSubscriptionImpl,
  startMergedCommentSubscription as startMergedCommentSubscriptionImpl,
  subscribeNotificationStreams as subscribeNotificationStreamsImpl,
  type SubscriptionHandle,
  useCachedLatest as useCachedLatestHelper
} from '@auftakt/resonote';
import type { EventParameters } from 'nostr-typedef';
import { merge } from 'rxjs';

import {
  cachedFetchById as cachedFetchByIdImpl,
  type CachedFetchByIdResult,
  invalidateFetchByIdCache as invalidateFetchByIdCacheImpl,
  useCachedLatest as useCachedLatestImpl,
  type UseCachedLatestResult
} from '$shared/nostr/cached-query.svelte.js';
import {
  castSigned as castSignedImpl,
  fetchLatestEvent as fetchLatestEventImpl,
  getRelayConnectionState as getRelayConnectionStateImpl,
  getRxNostr,
  observeRelayConnectionStates as observeRelayConnectionStatesImpl,
  setDefaultRelays as setDefaultRelaysImpl
} from '$shared/nostr/client.js';
import { getEventsDB } from '$shared/nostr/event-db.js';
import {
  fetchBackwardEvents as fetchBackwardEventsImpl,
  fetchBackwardFirst as fetchBackwardFirstImpl
} from '$shared/nostr/query.js';

interface WotProgressCallback {
  onDirectFollows(follows: Set<string>): void;
  onWotProgress(count: number): void;
  isCancelled(): boolean;
}

interface WotResult {
  directFollows: Set<string>;
  wot: Set<string>;
}

const runtime: ResonoteRuntime = {
  fetchBackwardEvents: (filters, options) =>
    fetchBackwardEventsImpl(filters, {
      ...options,
      overlay: options?.overlay
        ? {
            ...options.overlay,
            relays: [...options.overlay.relays]
          }
        : undefined
    }),
  fetchBackwardFirst: (filters, options) =>
    fetchBackwardFirstImpl(filters, {
      ...options,
      overlay: options?.overlay
        ? {
            ...options.overlay,
            relays: [...options.overlay.relays]
          }
        : undefined
    }),
  fetchLatestEvent: (...args) => fetchLatestEventImpl(...args),
  getEventsDB: () => getEventsDB(),
  getRxNostr: () => getRxNostr(),
  createRxBackwardReq: (options) => createRxBackwardReq(options),
  createRxForwardReq: (options) => createRxForwardReq(options),
  uniq: () => uniq(),
  merge,
  getRelayConnectionState: (...args) => getRelayConnectionStateImpl(...args),
  observeRelayConnectionStates: (...args) => observeRelayConnectionStatesImpl(...args)
};

const nostrReadRuntime = {
  cachedFetchById: cachedFetchByIdImpl,
  invalidateFetchByIdCache: invalidateFetchByIdCacheImpl,
  useCachedLatest: useCachedLatestImpl
};

const publishRuntime = {
  castSigned: (params: EventParameters) => castSignedImpl(params),
  retryPendingPublishes: async () => {
    const { retryPendingPublishes } = await import('$shared/nostr/publish-signed.js');
    return retryPendingPublishes();
  },
  publishSignedEvent: async (params: EventParameters) => {
    const { publishSignedEvent } = await import('$shared/nostr/publish-signed.js');
    return publishSignedEvent(params);
  },
  publishSignedEvents: async (params: EventParameters[]) => {
    const { publishSignedEvents } = await import('$shared/nostr/publish-signed.js');
    return publishSignedEvents(params);
  }
};

const relayRuntime = {
  fetchLatestEvent: (...args: Parameters<typeof fetchLatestEventImpl>) =>
    fetchLatestEventImpl(...args),
  setDefaultRelays: (urls: string[]) => setDefaultRelaysImpl(urls),
  getRelayConnectionState: (...args: Parameters<typeof getRelayConnectionStateImpl>) =>
    getRelayConnectionStateImpl(...args),
  observeRelayConnectionStates: (...args: Parameters<typeof observeRelayConnectionStatesImpl>) =>
    observeRelayConnectionStatesImpl(...args)
};

export type { StoredEvent, WotResult };
export type {
  CachedFetchByIdResult,
  CommentFilterKinds,
  CommentSubscriptionRefs,
  DeletionEvent,
  EmojiCategory,
  SubscriptionHandle,
  UseCachedLatestResult
};

export async function publishSignedEvent(params: EventParameters): Promise<void> {
  return castSignedHelper(publishRuntime, params);
}

export async function readLatestEvent(pubkey: string, kind: number) {
  return fetchLatestEventHelper(relayRuntime, pubkey, kind);
}

export async function cachedFetchById(eventId: string): Promise<CachedFetchByIdResult> {
  return cachedFetchByIdHelper(nostrReadRuntime, eventId);
}

export function invalidateFetchByIdCache(eventId: string): void {
  invalidateFetchByIdCacheHelper(nostrReadRuntime, eventId);
}

export function useCachedLatest(pubkey: string, kind: number): UseCachedLatestResult {
  return useCachedLatestHelper(nostrReadRuntime, pubkey, kind);
}

export async function openEventsDb() {
  return getEventsDB();
}

export async function setPreferredRelays(urls: string[]): Promise<void> {
  return setDefaultRelaysHelper(relayRuntime, urls);
}

export async function retryQueuedPublishes(): Promise<void> {
  return retryPendingPublishesHelper(publishRuntime);
}

export async function publishSignedEvents(params: EventParameters[]): Promise<void> {
  return publishSignedEventsHelper(publishRuntime, params);
}

export async function verifySignedEvent(event: unknown): Promise<boolean> {
  return verifier(event as Parameters<typeof verifier>[0]);
}

export async function fetchProfileCommentEvents(pubkey: string, until?: number, limit?: number) {
  return fetchProfileCommentEventsImpl(runtime, pubkey, until, limit);
}

export async function fetchFollowListSnapshot(pubkey: string, followKind?: number) {
  return fetchFollowListSnapshotImpl(runtime, pubkey, followKind);
}

export async function fetchProfileMetadataEvents(pubkeys: readonly string[], batchSize?: number) {
  return fetchProfileMetadataEventsImpl(runtime, pubkeys, batchSize);
}

export async function fetchCustomEmojiSources(pubkey: string) {
  return fetchCustomEmojiSourcesImpl(runtime, pubkey);
}

export async function fetchCustomEmojiCategories(pubkey: string): Promise<EmojiCategory[]> {
  return fetchCustomEmojiCategoriesImpl(runtime, pubkey);
}

export async function searchBookmarkDTagEvent(pubkey: string, normalizedUrl: string) {
  return fetchBookmarkSearch(runtime, pubkey, normalizedUrl);
}

export async function searchEpisodeBookmarkByGuid(pubkey: string, guid: string) {
  return fetchEpisodeBookmarkSearch(runtime, pubkey, guid);
}

export async function fetchNostrEventById<TEvent>(eventId: string, relayHints: readonly string[]) {
  return fetchNostrEventByIdImpl<TEvent>(runtime, eventId, relayHints);
}

export async function loadCommentSubscriptionDeps(): Promise<CommentSubscriptionRefs> {
  return loadCommentSubscriptionDepsImpl(runtime as never);
}

export function buildCommentContentFilters(idValue: string, kinds: CommentFilterKinds) {
  return buildCommentContentFiltersImpl(idValue, kinds);
}

export function startCommentSubscription(
  refs: CommentSubscriptionRefs,
  filters: Array<Record<string, unknown>>,
  maxCreatedAt: number | null,
  onPacket: Parameters<typeof startCommentSubscriptionImpl>[3],
  onBackwardComplete: () => void,
  onError?: (error: unknown) => void
) {
  return startCommentSubscriptionImpl(
    refs,
    filters,
    maxCreatedAt,
    onPacket,
    onBackwardComplete,
    onError
  );
}

export function startMergedCommentSubscription(
  refs: CommentSubscriptionRefs,
  filters: Array<Record<string, unknown>>,
  onPacket: Parameters<typeof startMergedCommentSubscriptionImpl>[2],
  onError?: (error: unknown) => void
) {
  return startMergedCommentSubscriptionImpl(refs, filters, onPacket, onError);
}

export function startCommentDeletionReconcile(
  refs: CommentSubscriptionRefs,
  cachedIds: string[],
  deletionKind: number,
  onDeletionEvent: (event: DeletionEvent) => void,
  onComplete: () => void
) {
  return startCommentDeletionReconcileImpl(
    refs,
    cachedIds,
    deletionKind,
    onDeletionEvent,
    onComplete
  );
}

export async function fetchWot(
  pubkey: string,
  callbacks: WotProgressCallback,
  extractFollows: (event: Pick<StoredEvent, 'tags'>) => Set<string>,
  followKind?: number,
  batchSize?: number
): Promise<WotResult> {
  return fetchWotImpl(runtime as never, pubkey, callbacks, extractFollows, followKind, batchSize);
}

export async function subscribeNotificationStreams(
  options: Parameters<typeof subscribeNotificationStreamsImpl>[1],
  handlers: Parameters<typeof subscribeNotificationStreamsImpl>[2]
) {
  return subscribeNotificationStreamsImpl(runtime as never, options, handlers);
}

export async function snapshotRelayStatuses(urls: readonly string[]) {
  return snapshotRelayStatusesImpl(runtime as never, urls);
}

export async function observeRelayStatuses(
  onPacket: Parameters<typeof observeRelayStatusesImpl>[1]
) {
  return observeRelayStatusesImpl(runtime as never, onPacket);
}

export async function fetchRelayListEvents(
  pubkey: string,
  relayListKind: number,
  followKind: number
) {
  return fetchRelayListEventsImpl(runtime, pubkey, relayListKind, followKind);
}

async function fetchBookmarkSearch(
  activeRuntime: ResonoteRuntime,
  pubkey: string,
  normalizedUrl: string
) {
  return searchBookmarkDTagEventImpl(activeRuntime, pubkey, normalizedUrl);
}

async function fetchEpisodeBookmarkSearch(
  activeRuntime: ResonoteRuntime,
  pubkey: string,
  guid: string
) {
  return searchEpisodeBookmarkByGuidImpl(activeRuntime, pubkey, guid);
}

export { parseCommentContent } from '$shared/nostr/content-parser.js';
export { addEmojiTag, extractShortcode } from '$shared/utils/emoji.js';
