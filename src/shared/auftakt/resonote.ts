import type { StoredEvent } from '@auftakt/core';
import { createRxBackwardReq, createRxForwardReq, uniq, verifier } from '@auftakt/core';
import {
  buildCommentContentFilters as buildCommentContentFiltersImpl,
  cachedFetchById as cachedFetchByIdHelper,
  type CommentFilterKinds,
  type CommentSubscriptionRefs,
  createResonoteCoordinator,
  type DeletionEvent,
  type EmojiCategory,
  fetchLatestEvent as fetchLatestEventHelper,
  invalidateFetchByIdCache as invalidateFetchByIdCacheHelper,
  observeRelayCapabilities as observeRelayCapabilitiesHelper,
  publishSignedEvents as publishSignedEventsHelper,
  registerPlugin as registerPluginHelper,
  type RelayCapabilityPacket,
  type RelayCapabilitySnapshot,
  type RelayMetricSnapshot,
  RESONOTE_COORDINATOR_PLUGIN_API_VERSION,
  type ResonoteCoordinator,
  type ResonoteCoordinatorPlugin,
  type ResonoteCoordinatorPluginApi,
  type ResonoteCoordinatorPluginApiVersion,
  type ResonoteCoordinatorPluginRegistration,
  retryPendingPublishes as retryPendingPublishesHelper,
  setDefaultRelays as setDefaultRelaysHelper,
  snapshotRelayCapabilities as snapshotRelayCapabilitiesHelper,
  snapshotRelayMetrics as snapshotRelayMetricsHelper,
  startCommentDeletionReconcile as startCommentDeletionReconcileImpl,
  startCommentSubscription as startCommentSubscriptionImpl,
  startMergedCommentSubscription as startMergedCommentSubscriptionImpl,
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
} from '$shared/auftakt/cached-read.svelte.js';
import {
  castSigned as castSignedImpl,
  fetchLatestEvent as fetchLatestEventImpl,
  getDefaultRelayUrls,
  getRelayConnectionState as getRelayConnectionStateImpl,
  getRxNostr,
  observePublishAcks as observePublishAcksImpl,
  observeRelayConnectionStates as observeRelayConnectionStatesImpl,
  setDefaultRelays as setDefaultRelaysImpl
} from '$shared/nostr/client.js';
import { getEventsDB } from '$shared/nostr/event-db.js';
import { addPendingPublish, drainPendingPublishes } from '$shared/nostr/pending-publishes.js';

type ResonoteRuntime = Parameters<
  typeof createResonoteCoordinator<CachedFetchByIdResult, UseCachedLatestResult>
>[0]['runtime'];

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
  fetchLatestEvent: (pubkey, kind) => fetchLatestEventImpl(pubkey, kind),
  getEventsDB: () => getEventsDB(),
  getRxNostr: () => getRxNostr(),
  getDefaultRelays: () => getDefaultRelayUrls(),
  createRxBackwardReq: (options) => createRxBackwardReq(options),
  createRxForwardReq: (options) => createRxForwardReq(options),
  uniq: () => uniq(),
  merge,
  getRelayConnectionState: (url) => getRelayConnectionStateImpl(url),
  observeRelayConnectionStates: (onPacket) => observeRelayConnectionStatesImpl(onPacket)
};

const nostrReadRuntime = {
  cachedFetchById: cachedFetchByIdImpl,
  invalidateFetchByIdCache: invalidateFetchByIdCacheImpl,
  useCachedLatest: useCachedLatestImpl
};

const publishTransportRuntime = {
  castSigned: (params: EventParameters, options?: Parameters<typeof castSignedImpl>[1]) =>
    castSignedImpl(params, options),
  observePublishAcks: observePublishAcksImpl
};

const pendingPublishQueueRuntime = {
  addPendingPublish,
  drainPendingPublishes
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

const coordinator: ResonoteCoordinator<CachedFetchByIdResult, UseCachedLatestResult> =
  createResonoteCoordinator({
    runtime,
    cachedFetchByIdRuntime: nostrReadRuntime,
    cachedLatestRuntime: nostrReadRuntime,
    publishTransportRuntime,
    pendingPublishQueueRuntime,
    relayStatusRuntime: relayRuntime
  });

export type { StoredEvent, WotResult };
export type {
  CachedFetchByIdResult,
  CommentFilterKinds,
  CommentSubscriptionRefs,
  DeletionEvent,
  EmojiCategory,
  RelayCapabilityPacket,
  RelayCapabilitySnapshot,
  RelayMetricSnapshot,
  SubscriptionHandle,
  UseCachedLatestResult
};

export { RESONOTE_COORDINATOR_PLUGIN_API_VERSION };
export type {
  ResonoteCoordinatorPlugin,
  ResonoteCoordinatorPluginApi,
  ResonoteCoordinatorPluginApiVersion,
  ResonoteCoordinatorPluginRegistration
};

export interface CommentCacheEvent {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string[][];
  kind: number;
}

export interface StoredFollowGraphSnapshot {
  currentUserFollowList: StoredEvent | null;
  allFollowLists: StoredEvent[];
}

export interface StoredEventCount {
  kind: number;
  count: number;
}

export async function publishSignedEvent(params: EventParameters): Promise<void> {
  return coordinator.publishSignedEvent(params);
}

export async function readLatestEvent(pubkey: string, kind: number) {
  return fetchLatestEventHelper(coordinator, pubkey, kind);
}

export async function cachedFetchById(eventId: string): Promise<CachedFetchByIdResult> {
  return cachedFetchByIdHelper(coordinator, eventId);
}

export function invalidateFetchByIdCache(eventId: string): void {
  invalidateFetchByIdCacheHelper(coordinator, eventId);
}

export function useCachedLatest(pubkey: string, kind: number): UseCachedLatestResult {
  return useCachedLatestHelper(coordinator, pubkey, kind);
}

export async function readCommentEventsByTag(tagQuery: string): Promise<CommentCacheEvent[]> {
  return coordinator.readCommentEventsByTag(tagQuery);
}

export async function storeCommentEvent(event: CommentCacheEvent): Promise<boolean> {
  return coordinator.storeCommentEvent(event);
}

export async function deleteCommentEventsByIds(ids: readonly string[]): Promise<void> {
  return coordinator.deleteCommentEventsByIds(ids);
}

export async function readStoredFollowGraph(
  pubkey: string,
  followKind: number
): Promise<StoredFollowGraphSnapshot> {
  return coordinator.readStoredFollowGraph(pubkey, followKind);
}

export async function countStoredEventsByKinds(
  kinds: readonly number[]
): Promise<StoredEventCount[]> {
  return coordinator.countStoredEventsByKinds(kinds);
}

export async function clearStoredEvents(): Promise<void> {
  return coordinator.clearStoredEvents();
}

export async function setPreferredRelays(urls: string[]): Promise<void> {
  return setDefaultRelaysHelper(coordinator, urls);
}

export async function retryQueuedPublishes(): Promise<void> {
  return retryPendingPublishesHelper(coordinator);
}

export async function registerPlugin(
  plugin: ResonoteCoordinatorPlugin
): Promise<ResonoteCoordinatorPluginRegistration> {
  return registerPluginHelper(coordinator, plugin);
}

export async function publishSignedEvents(params: EventParameters[]): Promise<void> {
  return publishSignedEventsHelper(coordinator, params);
}

export async function verifySignedEvent(event: unknown): Promise<boolean> {
  return verifier(event as Parameters<typeof verifier>[0]);
}

export async function fetchProfileCommentEvents(pubkey: string, until?: number, limit?: number) {
  return coordinator.fetchProfileCommentEvents(pubkey, until, limit);
}

export async function fetchFollowListSnapshot(pubkey: string, followKind?: number) {
  return coordinator.fetchFollowListSnapshot(pubkey, followKind);
}

export async function fetchProfileMetadataEvents(pubkeys: readonly string[], batchSize?: number) {
  return coordinator.fetchProfileMetadataEvents(pubkeys, batchSize);
}

export async function fetchProfileMetadataSources(pubkeys: readonly string[], batchSize?: number) {
  return coordinator.fetchProfileMetadataSources(pubkeys, batchSize);
}

export async function fetchCustomEmojiSources(pubkey: string) {
  return coordinator.fetchCustomEmojiSources(pubkey);
}

export async function fetchCustomEmojiCategories(pubkey: string): Promise<EmojiCategory[]> {
  return coordinator.fetchCustomEmojiCategories(pubkey);
}

export async function searchBookmarkDTagEvent(pubkey: string, normalizedUrl: string) {
  return coordinator.searchBookmarkDTagEvent(pubkey, normalizedUrl);
}

export async function searchEpisodeBookmarkByGuid(pubkey: string, guid: string) {
  return coordinator.searchEpisodeBookmarkByGuid(pubkey, guid);
}

export async function fetchNostrEventById<TEvent>(eventId: string, relayHints: readonly string[]) {
  return coordinator.fetchNostrEventById<TEvent>(eventId, relayHints);
}

export async function fetchBackwardEvents<TEvent>(
  filters: readonly Record<string, unknown>[],
  options?: {
    readonly overlay?: {
      readonly relays: readonly string[];
      readonly includeDefaultReadRelays?: boolean;
    };
    readonly timeoutMs?: number;
    readonly rejectOnError?: boolean;
  }
): Promise<TEvent[]> {
  return coordinator.fetchBackwardEvents<TEvent>(filters, options);
}

export async function fetchBackwardFirst<TEvent>(
  filters: readonly Record<string, unknown>[],
  options?: {
    readonly overlay?: {
      readonly relays: readonly string[];
      readonly includeDefaultReadRelays?: boolean;
    };
    readonly timeoutMs?: number;
    readonly rejectOnError?: boolean;
  }
): Promise<TEvent | null> {
  return coordinator.fetchBackwardFirst<TEvent>(filters, options);
}

export async function fetchNotificationTargetPreview(eventId: string): Promise<string | null> {
  return coordinator.fetchNotificationTargetPreview(eventId);
}

export async function loadCommentSubscriptionDeps(): Promise<CommentSubscriptionRefs> {
  return coordinator.loadCommentSubscriptionDeps();
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
  return coordinator.fetchWot(pubkey, callbacks, extractFollows, followKind, batchSize);
}

export async function subscribeNotificationStreams(
  options: Parameters<
    ResonoteCoordinator<
      CachedFetchByIdResult,
      UseCachedLatestResult
    >['subscribeNotificationStreams']
  >[0],
  handlers: Parameters<
    ResonoteCoordinator<
      CachedFetchByIdResult,
      UseCachedLatestResult
    >['subscribeNotificationStreams']
  >[1]
) {
  return coordinator.subscribeNotificationStreams(options, handlers);
}

export async function snapshotRelayStatuses(urls: readonly string[]) {
  return coordinator.snapshotRelayStatuses(urls);
}

export async function observeRelayStatuses(
  onPacket: Parameters<
    ResonoteCoordinator<CachedFetchByIdResult, UseCachedLatestResult>['observeRelayStatuses']
  >[0]
) {
  return coordinator.observeRelayStatuses(onPacket);
}

export async function snapshotRelayCapabilities(
  urls: readonly string[]
): Promise<RelayCapabilitySnapshot[]> {
  return snapshotRelayCapabilitiesHelper(coordinator, urls);
}

export async function snapshotRelayMetrics(): Promise<RelayMetricSnapshot[]> {
  return snapshotRelayMetricsHelper(coordinator);
}

export async function observeRelayCapabilities(onPacket: (packet: RelayCapabilityPacket) => void) {
  return observeRelayCapabilitiesHelper(coordinator, onPacket);
}

export async function fetchRelayListEvents(
  pubkey: string,
  relayListKind: number,
  followKind: number
) {
  return coordinator.fetchRelayListEvents(pubkey, relayListKind, followKind);
}

export async function fetchRelayListSources(
  pubkey: string,
  relayListKind: number,
  followKind: number
) {
  return coordinator.fetchRelayListSources(pubkey, relayListKind, followKind);
}

export type { ResonoteCoordinator } from '@auftakt/resonote';
export { parseCommentContent } from '$shared/nostr/content-parser.js';
export { addEmojiTag, extractShortcode } from '$shared/utils/emoji.js';
