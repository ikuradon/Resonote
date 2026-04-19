import type {
  RelayConnectionState,
  RelayObservation,
  RelayObservationReason,
  SessionObservation,
  StoredEvent
} from '@auftakt/core';
import {
  buildCommentContentFilters as buildCommentContentFiltersImpl,
  type CommentFilterKinds,
  type CommentSubscriptionRefs,
  type DeletionEvent,
  type EmojiCategory,
  fetchCustomEmojiCategories as fetchCustomEmojiCategoriesImpl,
  fetchCustomEmojiSources as fetchCustomEmojiSourcesImpl,
  fetchFollowListSnapshot as fetchFollowListSnapshotImpl,
  fetchNostrEventById as fetchNostrEventByIdImpl,
  fetchProfileCommentEvents as fetchProfileCommentEventsImpl,
  fetchProfileMetadataEvents as fetchProfileMetadataEventsImpl,
  fetchRelayListEvents as fetchRelayListEventsImpl,
  fetchWot as fetchWotImpl,
  loadCommentSubscriptionDeps as loadCommentSubscriptionDepsImpl,
  observeRelayStatuses as observeRelayStatusesImpl,
  searchBookmarkDTagEvent as searchBookmarkDTagEventImpl,
  searchEpisodeBookmarkByGuid as searchEpisodeBookmarkByGuidImpl,
  snapshotRelayStatuses as snapshotRelayStatusesImpl,
  startCommentDeletionReconcile as startCommentDeletionReconcileImpl,
  startCommentSubscription as startCommentSubscriptionImpl,
  startMergedCommentSubscription as startMergedCommentSubscriptionImpl,
  subscribeNotificationStreams as subscribeNotificationStreamsImpl,
  type SubscriptionHandle
} from '@auftakt/resonote';
import type { EventParameters } from 'nostr-typedef';
import { merge } from 'rxjs';

import {
  cachedFetchById as cachedFetchByIdImpl,
  type CachedFetchByIdResult,
  invalidateFetchByIdCache as invalidateFetchByIdCacheImpl,
  useCachedLatest as useCachedLatestImpl,
  type UseCachedLatestResult
} from '$shared/nostr/cached-query.js';
import * as gateway from '$shared/nostr/gateway.js';

interface FetchBackwardOptions {
  readonly overlay?: {
    readonly relays: readonly string[];
    readonly includeDefaultReadRelays?: boolean;
  };
  readonly timeoutMs?: number;
  readonly rejectOnError?: boolean;
}

interface SessionRuntime {
  fetchBackwardEvents<TEvent>(
    filters: readonly Record<string, unknown>[],
    options?: FetchBackwardOptions
  ): Promise<TEvent[]>;
  fetchBackwardFirst<TEvent>(
    filters: readonly Record<string, unknown>[],
    options?: FetchBackwardOptions
  ): Promise<TEvent | null>;
  fetchLatestEvent(
    pubkey: string,
    kind: number
  ): Promise<{
    tags: string[][];
    content: string;
    created_at: number;
  } | null>;
  getEventsDB(): Promise<{
    getByPubkeyAndKind(pubkey: string, kind: number): Promise<StoredEvent | null>;
    getManyByPubkeysAndKind(pubkeys: string[], kind: number): Promise<StoredEvent[]>;
    getByReplaceKey(pubkey: string, kind: number, dTag: string): Promise<StoredEvent | null>;
    getByTagValue(tagQuery: string, kind?: number): Promise<StoredEvent[]>;
    put(event: StoredEvent): Promise<unknown>;
  }>;
  getRxNostr(): Promise<unknown>;
  createRxBackwardReq(): unknown;
  createRxForwardReq(): unknown;
  uniq(): unknown;
  merge(...streams: unknown[]): unknown;
  getRelayConnectionState(url: string): Promise<{
    connection: RelayConnectionState;
    replaying: boolean;
    degraded: boolean;
    reason: RelayObservationReason;
    relay: RelayObservation;
    aggregate: SessionObservation;
  } | null>;
  observeRelayConnectionStates(
    onPacket: (packet: {
      from: string;
      state: RelayConnectionState;
      reason: RelayObservationReason;
      relay: RelayObservation;
      aggregate: SessionObservation;
    }) => void
  ): Promise<{ unsubscribe(): void }>;
}

interface WotProgressCallback {
  onDirectFollows(follows: Set<string>): void;
  onWotProgress(count: number): void;
  isCancelled(): boolean;
}

interface WotResult {
  directFollows: Set<string>;
  wot: Set<string>;
}

const runtime: SessionRuntime = {
  fetchBackwardEvents: (filters, options) =>
    gateway.fetchBackwardEvents(filters, options && normalizeFetchOptions(options)),
  fetchBackwardFirst: (filters, options) =>
    gateway.fetchBackwardFirst(filters, options && normalizeFetchOptions(options)),
  fetchLatestEvent: (...args) => gateway.fetchLatestEvent(...args),
  getEventsDB: () => gateway.getEventsDB(),
  getRxNostr: () => gateway.getRxNostr(),
  createRxBackwardReq: () => gateway.createRxBackwardReq(),
  createRxForwardReq: () => gateway.createRxForwardReq(),
  uniq: () => gateway.uniq(),
  merge,
  getRelayConnectionState: (...args) => gateway.getRelayConnectionState(...args),
  observeRelayConnectionStates: (...args) => gateway.observeRelayConnectionStates(...args)
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
  return gateway.castSigned(params);
}

export async function readLatestEvent(pubkey: string, kind: number) {
  return gateway.fetchLatestEvent(pubkey, kind);
}

export async function cachedFetchById(eventId: string): Promise<CachedFetchByIdResult> {
  return cachedFetchByIdImpl(eventId);
}

export function invalidateFetchByIdCache(eventId: string): void {
  invalidateFetchByIdCacheImpl(eventId);
}

export function useCachedLatest(pubkey: string, kind: number): UseCachedLatestResult {
  return useCachedLatestImpl(pubkey, kind);
}

export async function openEventsDb() {
  return gateway.getEventsDB();
}

export async function setPreferredRelays(urls: string[]): Promise<void> {
  return gateway.setDefaultRelays(urls);
}

export async function retryQueuedPublishes(): Promise<void> {
  const { retryPendingPublishes } = await import('$shared/nostr/publish-signed.js');
  return retryPendingPublishes();
}

export async function publishSignedEvents(params: EventParameters[]): Promise<void> {
  const { publishSignedEvents } = await import('$shared/nostr/publish-signed.js');
  return publishSignedEvents(params);
}

export async function verifySignedEvent(event: unknown): Promise<boolean> {
  return gateway.verifier(event as never);
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

function normalizeFetchOptions(options: FetchBackwardOptions) {
  return {
    ...options,
    overlay: options.overlay
      ? {
          ...options.overlay,
          relays: [...options.overlay.relays]
        }
      : undefined
  };
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
  activeRuntime: SessionRuntime,
  pubkey: string,
  normalizedUrl: string
) {
  return searchBookmarkDTagEventImpl(activeRuntime, pubkey, normalizedUrl);
}

async function fetchEpisodeBookmarkSearch(
  activeRuntime: SessionRuntime,
  pubkey: string,
  guid: string
) {
  return searchEpisodeBookmarkByGuidImpl(activeRuntime, pubkey, guid);
}

export { parseCommentContent } from '$shared/nostr/content-parser.js';
export { addEmojiTag, extractShortcode } from '$shared/utils/emoji.js';
