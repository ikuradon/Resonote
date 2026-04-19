import type {
  RelayConnectionState,
  RelayObservation,
  RelayObservationReason,
  SessionObservation,
  StoredEvent
} from '@auftakt/core';
import {
  cacheEvent,
  type EventSubscriptionRefs as CommentSubscriptionRefs,
  fetchEventById,
  fetchFollowGraph,
  fetchLatestEventsForKinds,
  fetchReplaceableEventsByAuthorsAndKind,
  type LatestEventSnapshot,
  loadEventSubscriptionDeps,
  observeRelayStatuses as observeRelayStatusesImpl,
  type QueryRuntime,
  type SessionRuntime,
  snapshotRelayStatuses as snapshotRelayStatusesImpl,
  startBackfillAndLiveSubscription,
  startDeletionReconcile as startDeletionReconcileImpl,
  startMergedLiveSubscription,
  subscribeDualFilterStreams,
  type SubscriptionHandle
} from '@auftakt/timeline';

export type { CommentSubscriptionRefs, SubscriptionHandle };

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
  onPacket: (packet: {
    from: string;
    state: RelayConnectionState;
    reason: RelayObservationReason;
    relay: RelayObservation;
    aggregate: SessionObservation;
  }) => void
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
