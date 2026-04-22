import type {
  NegentropyTransportResult,
  RelayObservationPacket,
  RelayObservationSnapshot,
  RequestKey,
  StoredEvent
} from '@auftakt/core';
import {
  cacheEvent,
  createNegentropyRepairRequestKey,
  type EventSubscriptionRefs as CommentSubscriptionRefs,
  fetchEventById,
  fetchFollowGraph,
  fetchLatestEventsForKinds,
  fetchReplaceableEventsByAuthorsAndKind,
  filterNegentropyEventRefs,
  type LatestEventSnapshot,
  loadEventSubscriptionDeps,
  type NegentropyEventRef,
  observeRelayStatuses as observeRelayStatusesImpl,
  type OfflineDeliveryDecision,
  type QueryRuntime,
  type ReconcileEmission,
  reconcileNegentropyRepairSubjects,
  reconcileReplayRepairSubjects,
  type SessionRuntime,
  snapshotRelayStatuses as snapshotRelayStatusesImpl,
  sortNegentropyEventRefsAsc,
  startBackfillAndLiveSubscription,
  startDeletionReconcile as startDeletionReconcileImpl,
  startMergedLiveSubscription,
  subscribeDualFilterStreams,
  type SubscriptionHandle} from '@auftakt/timeline';
import type { EventParameters } from 'nostr-typedef';

export type { CommentSubscriptionRefs, SubscriptionHandle };

type RuntimeFilter = Record<string, unknown>;

export interface RelayReadOverlayOptions {
  readonly relays: readonly string[];
  readonly includeDefaultReadRelays?: boolean;
}

export interface FetchBackwardOptions {
  readonly overlay?: RelayReadOverlayOptions;
  readonly timeoutMs?: number;
  readonly rejectOnError?: boolean;
}

export interface CachedFetchByIdRuntime<TResult> {
  cachedFetchById(eventId: string): Promise<TResult>;
  invalidateFetchByIdCache(eventId: string): void;
}

export interface CachedLatestRuntime<TResult> {
  useCachedLatest(pubkey: string, kind: number): TResult;
}

export interface RelayStatusRuntime {
  fetchLatestEvent(
    pubkey: string,
    kind: number
  ): Promise<{
    tags: string[][];
    content: string;
    created_at: number;
  } | null>;
  setDefaultRelays(urls: string[]): Promise<void>;
  getRelayConnectionState(url: string): Promise<RelayObservationSnapshot | null>;
  observeRelayConnectionStates(onPacket: (packet: RelayObservationPacket) => void): Promise<{
    unsubscribe(): void;
  }>;
}

export interface ResonoteRuntime {
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
    getById(id: string): Promise<StoredEvent | null>;
    listNegentropyEventRefs(): Promise<NegentropyEventRef[]>;
    put(event: StoredEvent): Promise<unknown>;
    putWithReconcile(event: StoredEvent): Promise<{
      stored: boolean;
      emissions: ReconcileEmission[];
    }>;
  }>;
  getRxNostr(): Promise<unknown>;
  createRxBackwardReq(options?: { requestKey?: RequestKey }): unknown;
  createRxForwardReq(options?: { requestKey?: RequestKey }): unknown;
  uniq(): unknown;
  merge(...streams: unknown[]): unknown;
  getRelayConnectionState(url: string): Promise<RelayObservationSnapshot | null>;
  observeRelayConnectionStates(onPacket: (packet: RelayObservationPacket) => void): Promise<{
    unsubscribe(): void;
  }>;
}

export interface PublishRuntime {
  castSigned(params: EventParameters): Promise<void>;
  retryPendingPublishes(): Promise<void>;
  publishSignedEvent(params: EventParameters): Promise<void>;
  publishSignedEvents(params: EventParameters[]): Promise<void>;
}

export interface RetryableSignedEvent extends EventParameters {
  readonly id: string;
  readonly pubkey: string;
  readonly created_at: number;
  readonly sig: string;
}

export interface PendingDrainResult {
  readonly emissions: ReconcileEmission[];
  readonly settledCount: number;
  readonly retryingCount: number;
}

export interface PendingPublishQueueRuntime {
  addPendingPublish(event: RetryableSignedEvent): Promise<void>;
  drainPendingPublishes(
    deliver: (event: RetryableSignedEvent) => Promise<OfflineDeliveryDecision>
  ): Promise<PendingDrainResult>;
}

export interface RelayRepairOptions {
  readonly filters: readonly RuntimeFilter[];
  readonly relayUrl: string;
  readonly timeoutMs?: number;
}

export interface RelayRepairResult {
  readonly strategy: 'negentropy' | 'fallback';
  readonly capability: NegentropyTransportResult['capability'];
  readonly repairedIds: string[];
  readonly materializationEmissions: ReconcileEmission[];
  readonly repairEmissions: ReconcileEmission[];
}

interface NegentropySessionRuntime {
  requestNegentropySync(options: {
    relayUrl: string;
    filter: RuntimeFilter;
    initialMessageHex: string;
    timeoutMs?: number;
  }): Promise<NegentropyTransportResult>;
  use(
    req: {
      emit(input: unknown): void;
      over(): void;
    },
    options?: { on?: { relays?: readonly string[]; defaultReadRelays?: boolean } }
  ): {
    subscribe(observer: {
      next?: (packet: { event: StoredEvent }) => void;
      complete?: () => void;
      error?: (error: unknown) => void;
    }): { unsubscribe(): void };
  };
}

export interface DeletionEvent extends StoredEvent {
  readonly content: string;
}

export interface CommentFilterKinds {
  comment: number;
  reaction: number;
  deletion: number;
  contentReaction: number;
}

interface ProfileCommentEvent extends StoredEvent {
  readonly content: string;
}

export interface CustomEmoji {
  shortcode: string;
  url: string;
}

export interface EmojiCategory {
  id: string;
  name: string;
  emojis: { id: string; name: string; skins: { src: string }[] }[];
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

interface NotificationStreamOptions {
  readonly myPubkey: string;
  readonly follows: ReadonlySet<string>;
  readonly mentionKinds: readonly number[];
  readonly followCommentKind: number;
  readonly mentionSince: number;
  readonly followCommentSince: number;
  readonly batchSize?: number;
}

interface NotificationStreamHandlers {
  onMentionPacket(packet: { event: StoredEvent; from?: string }): void;
  onFollowCommentPacket(packet: { event: StoredEvent; from?: string }): void;
  onError(error: unknown): void;
}

export async function cachedFetchById<TResult>(
  runtime: Pick<CachedFetchByIdRuntime<TResult>, 'cachedFetchById'>,
  eventId: string
): Promise<TResult> {
  return runtime.cachedFetchById(eventId);
}

export function invalidateFetchByIdCache<TResult>(
  runtime: Pick<CachedFetchByIdRuntime<TResult>, 'invalidateFetchByIdCache'>,
  eventId: string
): void {
  runtime.invalidateFetchByIdCache(eventId);
}

export function useCachedLatest<TResult>(
  runtime: Pick<CachedLatestRuntime<TResult>, 'useCachedLatest'>,
  pubkey: string,
  kind: number
): TResult {
  return runtime.useCachedLatest(pubkey, kind);
}

export async function castSigned(
  runtime: Pick<PublishRuntime, 'castSigned'>,
  params: EventParameters
): Promise<void> {
  return runtime.castSigned(params);
}

export async function fetchLatestEvent(
  runtime: Pick<RelayStatusRuntime, 'fetchLatestEvent'>,
  pubkey: string,
  kind: number
) {
  return runtime.fetchLatestEvent(pubkey, kind);
}

export async function setDefaultRelays(
  runtime: Pick<RelayStatusRuntime, 'setDefaultRelays'>,
  urls: string[]
): Promise<void> {
  return runtime.setDefaultRelays(urls);
}

export async function getRelayConnectionState(
  runtime: Pick<RelayStatusRuntime, 'getRelayConnectionState'>,
  url: string
): Promise<RelayObservationSnapshot | null> {
  return runtime.getRelayConnectionState(url);
}

export async function observeRelayConnectionStates(
  runtime: Pick<RelayStatusRuntime, 'observeRelayConnectionStates'>,
  onPacket: (packet: RelayObservationPacket) => void
): Promise<{ unsubscribe(): void }> {
  return runtime.observeRelayConnectionStates(onPacket);
}

export async function fetchBackwardEvents<TEvent>(
  runtime: Pick<QueryRuntime, 'fetchBackwardEvents'>,
  filters: readonly RuntimeFilter[],
  options?: FetchBackwardOptions
): Promise<TEvent[]> {
  return runtime.fetchBackwardEvents<TEvent>(filters, cloneFetchBackwardOptions(options));
}

export async function fetchBackwardFirst<TEvent>(
  runtime: Pick<QueryRuntime, 'fetchBackwardFirst'>,
  filters: readonly RuntimeFilter[],
  options?: FetchBackwardOptions
): Promise<TEvent | null> {
  return runtime.fetchBackwardFirst<TEvent>(filters, cloneFetchBackwardOptions(options));
}

export async function retryPendingPublishes(
  runtime: Pick<PublishRuntime, 'retryPendingPublishes'>
): Promise<void> {
  return runtime.retryPendingPublishes();
}

export async function publishSignedEvent(
  runtime: Pick<PublishRuntime, 'publishSignedEvent'>,
  params: EventParameters
): Promise<void> {
  return runtime.publishSignedEvent(params);
}

export async function publishSignedEvents(
  runtime: Pick<PublishRuntime, 'publishSignedEvents'>,
  params: EventParameters[]
): Promise<void> {
  return runtime.publishSignedEvents(params);
}

function toRetryableSignedEvent(
  event: EventParameters | RetryableSignedEvent
): RetryableSignedEvent | null {
  const candidate = event as Partial<RetryableSignedEvent>;

  if (
    typeof candidate.id === 'string' &&
    typeof candidate.sig === 'string' &&
    typeof candidate.kind === 'number' &&
    typeof candidate.pubkey === 'string' &&
    typeof candidate.created_at === 'number' &&
    Array.isArray(candidate.tags) &&
    typeof candidate.content === 'string'
  ) {
    return candidate as RetryableSignedEvent;
  }

  return null;
}

export async function retryQueuedSignedPublishes(
  runtime: Pick<PublishRuntime, 'castSigned'>,
  queueRuntime: Pick<PendingPublishQueueRuntime, 'drainPendingPublishes'>
): Promise<PendingDrainResult> {
  return queueRuntime.drainPendingPublishes(async (event) => {
    try {
      await runtime.castSigned(event);
      return 'confirmed';
    } catch {
      return 'retrying';
    }
  });
}

export async function publishSignedEventWithOfflineFallback(
  runtime: Pick<PublishRuntime, 'castSigned'>,
  queueRuntime: Pick<PendingPublishQueueRuntime, 'addPendingPublish'>,
  event: EventParameters | RetryableSignedEvent
): Promise<void> {
  try {
    await runtime.castSigned(event);
  } catch {
    const pending = toRetryableSignedEvent(event);
    if (pending) await queueRuntime.addPendingPublish(pending);
  }
}

export async function publishSignedEventsWithOfflineFallback(
  runtime: Pick<PublishRuntime, 'castSigned'>,
  queueRuntime: Pick<PendingPublishQueueRuntime, 'addPendingPublish'>,
  events: Array<EventParameters | RetryableSignedEvent>
): Promise<void> {
  if (events.length === 0) return;

  await Promise.allSettled(
    events.map(async (event) => publishSignedEventWithOfflineFallback(runtime, queueRuntime, event))
  );
}

function cloneFetchBackwardOptions(
  options?: FetchBackwardOptions
): FetchBackwardOptions | undefined {
  if (!options) return undefined;

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

function encodeHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function decodeHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('negentropy hex payload must have even length');
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    const value = Number.parseInt(hex.slice(index, index + 2), 16);
    if (!Number.isFinite(value)) {
      throw new Error('negentropy hex payload contains invalid byte');
    }
    bytes[index / 2] = value;
  }
  return bytes;
}

function encodeVarint(value: number): number[] {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('negentropy varint must be a non-negative integer');
  }

  const digits = [value & 0x7f];
  let remaining = value >>> 7;
  while (remaining > 0) {
    digits.push(remaining & 0x7f);
    remaining >>>= 7;
  }

  return digits.reverse().map((digit, index) => (index < digits.length - 1 ? digit | 0x80 : digit));
}

function decodeVarint(bytes: Uint8Array, start: number): { value: number; next: number } {
  let value = 0;
  let index = start;

  while (index < bytes.length) {
    const byte = bytes[index] ?? 0;
    value = (value << 7) | (byte & 0x7f);
    index += 1;
    if ((byte & 0x80) === 0) {
      return { value, next: index };
    }
  }

  throw new Error('unterminated negentropy varint');
}

function encodeNegentropyIdListMessage(events: readonly NegentropyEventRef[]): string {
  const sorted = sortNegentropyEventRefsAsc(events);
  const bytes: number[] = [0x61, 0x00, 0x00, 0x02, ...encodeVarint(sorted.length)];

  for (const event of sorted) {
    if (!/^[0-9a-f]{64}$/i.test(event.id)) {
      throw new Error(`negentropy requires 32-byte hex ids, received: ${event.id}`);
    }
    bytes.push(...decodeHex(event.id));
  }

  return encodeHex(Uint8Array.from(bytes));
}

function decodeNegentropyIdListMessage(messageHex: string): string[] {
  const bytes = decodeHex(messageHex);
  if ((bytes[0] ?? 0) !== 0x61) {
    throw new Error('unsupported negentropy protocol version');
  }

  let index = 1;
  const ids: string[] = [];

  while (index < bytes.length) {
    const upperTimestamp = decodeVarint(bytes, index);
    index = upperTimestamp.next;
    const prefixLength = decodeVarint(bytes, index);
    index = prefixLength.next + prefixLength.value;

    const mode = decodeVarint(bytes, index);
    index = mode.next;

    if (mode.value === 0) {
      continue;
    }

    if (mode.value !== 2) {
      throw new Error(`unsupported negentropy mode: ${mode.value}`);
    }

    const listLength = decodeVarint(bytes, index);
    index = listLength.next;

    for (let count = 0; count < listLength.value; count += 1) {
      const nextIndex = index + 32;
      if (nextIndex > bytes.length) {
        throw new Error('truncated negentropy id list');
      }
      ids.push(encodeHex(bytes.slice(index, nextIndex)));
      index = nextIndex;
    }
  }

  return ids;
}

function chunkIds(ids: readonly string[], size = 50): RuntimeFilter[] {
  const chunks: RuntimeFilter[] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push({ ids: ids.slice(index, index + size) });
  }
  return chunks;
}

async function fetchRepairEventsFromRelay(
  runtime: ResonoteRuntime,
  filters: readonly RuntimeFilter[],
  relayUrl: string,
  timeoutMs: number | undefined,
  scope: string
): Promise<StoredEvent[]> {
  if (filters.length === 0) return [];

  const rxNostr = (await runtime.getRxNostr()) as NegentropySessionRuntime;
  const req = runtime.createRxBackwardReq({
    requestKey: createNegentropyRepairRequestKey({ filters, relayUrl, scope })
  }) as {
    emit(input: unknown): void;
    over(): void;
  };

  const events = new Map<string, StoredEvent>();

  return new Promise<StoredEvent[]>((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => finish(), timeoutMs ?? 10_000);

    const sub = rxNostr
      .use(req, {
        on: {
          relays: [relayUrl],
          defaultReadRelays: false
        }
      })
      .subscribe({
        next: (packet) => {
          events.set(packet.event.id, packet.event);
        },
        complete: () => finish(),
        error: () => finish()
      });

    for (const filter of filters) req.emit(filter);
    req.over();

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      sub.unsubscribe();
      resolve([...events.values()]);
    }
  });
}

async function materializeRepairEvents(
  runtime: ResonoteRuntime,
  events: readonly StoredEvent[]
): Promise<{ repairedIds: string[]; materializationEmissions: ReconcileEmission[] }> {
  const eventsDB = await runtime.getEventsDB();
  const repairedIds: string[] = [];
  const materializationEmissions: ReconcileEmission[] = [];

  for (const event of events) {
    const result = await eventsDB.putWithReconcile(event);
    materializationEmissions.push(...result.emissions);
    if (result.stored) repairedIds.push(event.id);
  }

  return {
    repairedIds,
    materializationEmissions
  };
}

async function fallbackRepairEventsFromRelay(
  runtime: ResonoteRuntime,
  options: RelayRepairOptions,
  capability: NegentropyTransportResult['capability']
): Promise<RelayRepairResult> {
  const fallbackEvents = await fetchRepairEventsFromRelay(
    runtime,
    options.filters,
    options.relayUrl,
    options.timeoutMs,
    'timeline:repair:fallback'
  );
  const materialized = await materializeRepairEvents(runtime, fallbackEvents);

  return {
    strategy: 'fallback',
    capability,
    repairedIds: materialized.repairedIds,
    materializationEmissions: materialized.materializationEmissions,
    repairEmissions: reconcileReplayRepairSubjects(materialized.repairedIds, 'repaired-replay')
  };
}

export async function repairEventsFromRelay(
  runtime: ResonoteRuntime,
  options: RelayRepairOptions
): Promise<RelayRepairResult> {
  const eventsDB = await runtime.getEventsDB();
  const session = (await runtime.getRxNostr()) as Partial<NegentropySessionRuntime>;

  if (typeof session.requestNegentropySync !== 'function') {
    return fallbackRepairEventsFromRelay(runtime, options, 'unsupported');
  }

  const localRefs = await eventsDB.listNegentropyEventRefs();
  const missingIds = new Set<string>();

  for (const filter of options.filters) {
    const selectedLocal = filterNegentropyEventRefs(localRefs, [filter]);

    let transportResult: NegentropyTransportResult;
    try {
      transportResult = await session.requestNegentropySync({
        relayUrl: options.relayUrl,
        filter,
        initialMessageHex: encodeNegentropyIdListMessage(selectedLocal),
        timeoutMs: options.timeoutMs
      });
    } catch {
      return fallbackRepairEventsFromRelay(runtime, options, 'failed');
    }

    if (transportResult.capability !== 'supported' || !transportResult.messageHex) {
      return fallbackRepairEventsFromRelay(runtime, options, transportResult.capability);
    }

    let remoteIds: string[];
    try {
      remoteIds = decodeNegentropyIdListMessage(transportResult.messageHex);
    } catch {
      return fallbackRepairEventsFromRelay(runtime, options, 'failed');
    }

    const localIds = new Set(selectedLocal.map((event) => event.id));
    for (const remoteId of remoteIds) {
      if (!localIds.has(remoteId)) {
        missingIds.add(remoteId);
      }
    }
  }

  const repairEvents = await fetchRepairEventsFromRelay(
    runtime,
    chunkIds([...missingIds]),
    options.relayUrl,
    options.timeoutMs,
    'timeline:repair:negentropy:fetch'
  );
  const materialized = await materializeRepairEvents(runtime, repairEvents);

  return {
    strategy: 'negentropy',
    capability: 'supported',
    repairedIds: materialized.repairedIds,
    materializationEmissions: materialized.materializationEmissions,
    repairEmissions: reconcileNegentropyRepairSubjects(materialized.repairedIds)
  };
}

export async function fetchProfileCommentEvents(
  runtime: QueryRuntime,
  pubkey: string,
  until?: number,
  limit = 20
): Promise<ProfileCommentEvent[]> {
  const filter = until
    ? { kinds: [1111], authors: [pubkey], limit, until }
    : { kinds: [1111], authors: [pubkey], limit };
  return runtime.fetchBackwardEvents<ProfileCommentEvent>([filter], { rejectOnError: true });
}

export async function fetchFollowListSnapshot(
  runtime: QueryRuntime,
  pubkey: string,
  followKind = 3
): Promise<LatestEventSnapshot | null> {
  return runtime.fetchLatestEvent(pubkey, followKind);
}

export async function fetchProfileMetadataEvents(
  runtime: QueryRuntime,
  pubkeys: readonly string[],
  batchSize = 50
) {
  return fetchReplaceableEventsByAuthorsAndKind(runtime, pubkeys, 0, batchSize);
}

function extractEmojiSetRefs(event: Pick<StoredEvent, 'tags'>): string[] {
  return event.tags
    .filter((tag) => tag[0] === 'a' && tag[1]?.startsWith('30030:'))
    .map((tag) => tag[1] as string);
}

function findDTag(tags: string[][]): string {
  return tags.find((tag) => tag[0] === 'd')?.[1] ?? '';
}

function buildCategoryFromEvent(event: Pick<StoredEvent, 'id' | 'tags'>): EmojiCategory | null {
  const setName =
    event.tags.find((tag) => tag[0] === 'title')?.[1] ??
    event.tags.find((tag) => tag[0] === 'd')?.[1] ??
    'Emoji Set';

  const emojis = event.tags
    .filter((tag) => tag[0] === 'emoji' && tag[1] && tag[2])
    .map((tag) => ({
      id: tag[1] as string,
      name: tag[1] as string,
      skins: [{ src: tag[2] as string }]
    }));

  if (emojis.length === 0) return null;
  return { id: `set-${event.id.slice(0, 8)}`, name: setName, emojis };
}

function buildInlineCategory(listEvent: Pick<StoredEvent, 'tags'>): EmojiCategory | null {
  const emojis = listEvent.tags
    .filter((tag) => tag[0] === 'emoji' && tag[1] && tag[2])
    .map((tag) => ({
      id: tag[1] as string,
      name: tag[1] as string,
      skins: [{ src: tag[2] as string }]
    }));

  if (emojis.length === 0) return null;
  return { id: 'custom-inline', name: 'Custom', emojis };
}

export async function fetchCustomEmojiSources(
  runtime: QueryRuntime,
  pubkey: string
): Promise<{
  listEvent: StoredEvent | null;
  setEvents: StoredEvent[];
}> {
  const eventsDB = await runtime.getEventsDB();
  const listEvent = await runtime.fetchBackwardFirst<StoredEvent>(
    [{ kinds: [10030], authors: [pubkey], limit: 1 }],
    { timeoutMs: 5_000 }
  );
  if (listEvent) {
    await cacheEvent(eventsDB, listEvent);
  }

  if (!listEvent) {
    return { listEvent: null, setEvents: [] };
  }

  const setRefs = extractEmojiSetRefs(listEvent);
  if (setRefs.length === 0) {
    return { listEvent, setEvents: [] };
  }

  const cachedEvents = (
    await Promise.all(
      setRefs.map(async (ref) => {
        const [kind, author, dTag] = ref.split(':');
        if (kind !== '30030' || !author || !dTag) return null;
        return eventsDB.getByReplaceKey(author, 30030, dTag);
      })
    )
  ).filter((event): event is StoredEvent => event !== null);

  const cachedKeys = new Set(
    cachedEvents.map((event) => `${event.pubkey}:${findDTag(event.tags)}`)
  );
  const missingRefs = setRefs.filter((ref) => {
    const [, author, dTag] = ref.split(':');
    return Boolean(author && dTag && !cachedKeys.has(`${author}:${dTag}`));
  });

  const missingFilters = missingRefs.flatMap((ref) => {
    const [kind, author, dTag] = ref.split(':');
    if (kind !== '30030' || !author || !dTag) return [];
    return [{ kinds: [30030], authors: [author], '#d': [dTag] }];
  });

  const fetchedEvents =
    missingFilters.length === 0
      ? []
      : await runtime.fetchBackwardEvents<StoredEvent>(missingFilters, { timeoutMs: 5_000 });

  await Promise.all(fetchedEvents.map((event) => cacheEvent(eventsDB, event)));

  return { listEvent, setEvents: [...cachedEvents, ...fetchedEvents] };
}

export async function fetchCustomEmojiCategories(
  runtime: QueryRuntime,
  pubkey: string
): Promise<EmojiCategory[]> {
  const { listEvent, setEvents } = await fetchCustomEmojiSources(runtime, pubkey);
  if (!listEvent) return [];

  const categories: EmojiCategory[] = [];
  const inlineCategory = buildInlineCategory(listEvent);
  if (inlineCategory) categories.push(inlineCategory);

  for (const event of setEvents) {
    const category = buildCategoryFromEvent(event);
    if (category) categories.push(category);
  }

  return categories;
}

function hasBookmarkDTagPayload(tags: string[][]): boolean {
  let hasFeed = false;
  let hasItem = false;

  for (const tag of tags) {
    if (tag[0] !== 'i' || !tag[1] || !tag[2]) continue;
    if (tag[1].startsWith('podcast:guid:')) hasFeed = true;
    if (tag[1].startsWith('podcast:item:guid:')) hasItem = true;
  }

  return hasFeed && hasItem;
}

export async function searchBookmarkDTagEvent(
  runtime: QueryRuntime,
  pubkey: string,
  normalizedUrl: string
): Promise<StoredEvent | null> {
  const eventsDB = await runtime.getEventsDB();
  const cached = await eventsDB.getByReplaceKey(pubkey, 39701, normalizedUrl);
  if (cached && hasBookmarkDTagPayload(cached.tags)) return cached;

  const event = await runtime.fetchBackwardFirst<StoredEvent>(
    [{ kinds: [39701], authors: [pubkey], '#d': [normalizedUrl], limit: 1 }],
    { timeoutMs: 5_000 }
  );

  if (event) await cacheEvent(eventsDB, event);
  return event;
}

export async function searchEpisodeBookmarkByGuid(
  runtime: QueryRuntime,
  pubkey: string,
  guid: string
): Promise<StoredEvent | null> {
  const eventsDB = await runtime.getEventsDB();
  const cached = await eventsDB.getByTagValue(`i:podcast:item:guid:${guid}`, 39701);
  const cachedMatch = cached.find((event) => event.pubkey === pubkey) ?? null;
  if (cachedMatch) return cachedMatch;

  const event = await runtime.fetchBackwardFirst<StoredEvent>(
    [{ kinds: [39701], authors: [pubkey], '#i': [`podcast:item:guid:${guid}`], limit: 1 }],
    { timeoutMs: 5_000 }
  );

  if (event) await cacheEvent(eventsDB, event);
  return event;
}

export async function fetchNostrEventById<TEvent>(
  runtime: QueryRuntime,
  eventId: string,
  relayHints: readonly string[]
): Promise<TEvent | null> {
  return fetchEventById(runtime, eventId, relayHints);
}

export async function loadCommentSubscriptionDeps(
  runtime: SessionRuntime
): Promise<CommentSubscriptionRefs> {
  return loadEventSubscriptionDeps(runtime);
}

export function buildCommentContentFilters(
  idValue: string,
  kinds: CommentFilterKinds
): Array<Record<string, unknown>> {
  return [
    { kinds: [kinds.comment], '#I': [idValue] },
    { kinds: [kinds.reaction], '#I': [idValue] },
    { kinds: [kinds.deletion], '#I': [idValue] },
    { kinds: [kinds.contentReaction], '#i': [idValue] }
  ];
}

export function startCommentSubscription(
  refs: CommentSubscriptionRefs,
  filters: Array<Record<string, unknown>>,
  maxCreatedAt: number | null,
  onPacket: (
    event: {
      id: string;
      pubkey: string;
      content: string;
      created_at: number;
      tags: string[][];
      kind: number;
    },
    relayHint?: string
  ) => void,
  onBackwardComplete: () => void,
  onError?: (error: unknown) => void
): SubscriptionHandle[] {
  return startBackfillAndLiveSubscription<DeletionEvent>(
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
  onPacket: (
    event: {
      id: string;
      pubkey: string;
      content: string;
      created_at: number;
      tags: string[][];
      kind: number;
    },
    relayHint?: string
  ) => void,
  onError?: (error: unknown) => void
): SubscriptionHandle {
  return startMergedLiveSubscription<DeletionEvent>(refs, filters, onPacket, onError);
}

export function startCommentDeletionReconcile(
  refs: CommentSubscriptionRefs,
  cachedIds: string[],
  deletionKind: number,
  onDeletionEvent: (event: DeletionEvent) => void,
  onComplete: () => void
): { sub: SubscriptionHandle; timeout: ReturnType<typeof setTimeout> } {
  return startDeletionReconcileImpl<DeletionEvent>(
    refs,
    cachedIds,
    deletionKind,
    onDeletionEvent,
    onComplete
  );
}

export async function fetchWot(
  runtime: SessionRuntime,
  pubkey: string,
  callbacks: WotProgressCallback,
  extractFollows: (event: Pick<StoredEvent, 'tags'>) => Set<string>,
  followKind = 3,
  batchSize = 100
): Promise<WotResult> {
  return fetchFollowGraph(runtime, pubkey, callbacks, extractFollows, followKind, batchSize);
}

export async function subscribeNotificationStreams(
  runtime: SessionRuntime,
  options: NotificationStreamOptions,
  handlers: NotificationStreamHandlers
): Promise<SubscriptionHandle[]> {
  const secondaryFilters = [...options.follows].flatMap((author, index, authors) => {
    if (authors.length === 0) return [];
    const batchSize = options.batchSize ?? 100;
    if (index % batchSize !== 0) return [];
    return [
      {
        kinds: [options.followCommentKind],
        authors: authors.slice(index, index + batchSize),
        since: options.followCommentSince
      }
    ];
  });

  return subscribeDualFilterStreams(
    runtime,
    {
      primaryFilter: {
        kinds: [...options.mentionKinds],
        '#p': [options.myPubkey],
        since: options.mentionSince
      },
      secondaryFilters
    },
    {
      onPrimaryPacket: handlers.onMentionPacket,
      onSecondaryPacket: handlers.onFollowCommentPacket,
      onError: handlers.onError
    }
  );
}

export async function snapshotRelayStatuses(runtime: SessionRuntime, urls: readonly string[]) {
  return snapshotRelayStatusesImpl(runtime, urls);
}

export async function observeRelayStatuses(
  runtime: SessionRuntime,
  onPacket: (packet: RelayObservationPacket) => void
) {
  return observeRelayStatusesImpl(runtime, onPacket);
}

export async function fetchRelayListEvents(
  runtime: QueryRuntime,
  pubkey: string,
  relayListKind: number,
  followKind: number
): Promise<{
  relayListEvents: StoredEvent[];
  followListEvents: StoredEvent[];
}> {
  const [relayListEvents, followListEvents] = await fetchLatestEventsForKinds(runtime, pubkey, [
    relayListKind,
    followKind
  ]);
  return { relayListEvents: relayListEvents ?? [], followListEvents: followListEvents ?? [] };
}
