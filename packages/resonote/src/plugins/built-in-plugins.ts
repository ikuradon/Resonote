import type { StoredEvent } from '@auftakt/core';

import type {
  CommentFilterKinds,
  CommentSubscriptionRefs,
  DeletionEvent,
  EmojiCategory,
  ResonoteCoordinatorPlugin,
  SubscriptionHandle
} from '../runtime.js';

export const EMOJI_CATALOG_READ_MODEL = 'emojiCatalog';
export const COMMENTS_FLOW = 'commentsFlow';
export const NOTIFICATIONS_FLOW = 'notificationsFlow';
export const RELAY_LIST_FLOW = 'relayListFlow';
export const CONTENT_RESOLUTION_FLOW = 'contentResolutionFlow';

export interface EmojiCatalogReadModel {
  fetchCustomEmojiSources(pubkey: string): Promise<{
    listEvent: StoredEvent | null;
    setEvents: StoredEvent[];
  }>;
  fetchCustomEmojiCategories(pubkey: string): Promise<EmojiCategory[]>;
}

export interface CommentsFlow {
  loadCommentSubscriptionDeps(): Promise<CommentSubscriptionRefs>;
  buildCommentContentFilters(
    idValue: string,
    kinds: CommentFilterKinds
  ): Array<Record<string, unknown>>;
  startCommentSubscription(
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
  ): SubscriptionHandle[];
  startMergedCommentSubscription(
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
  ): SubscriptionHandle;
  startCommentDeletionReconcile(
    refs: CommentSubscriptionRefs,
    cachedIds: string[],
    deletionKind: number,
    onDeletionEvent: (event: DeletionEvent) => void,
    onComplete: () => void
  ): { sub: SubscriptionHandle; timeout: ReturnType<typeof setTimeout> };
}

export interface NotificationStreamOptions {
  readonly myPubkey: string;
  readonly follows: ReadonlySet<string>;
  readonly mentionKinds: readonly number[];
  readonly followCommentKind: number;
  readonly mentionSince: number;
  readonly followCommentSince: number;
  readonly batchSize?: number;
}

export interface NotificationStreamHandlers {
  onMentionPacket(packet: { event: StoredEvent; from?: string }): void;
  onFollowCommentPacket(packet: { event: StoredEvent; from?: string }): void;
  onError(error: unknown): void;
}

export interface NotificationsFlow {
  subscribeNotificationStreams(
    options: NotificationStreamOptions,
    handlers: NotificationStreamHandlers
  ): Promise<SubscriptionHandle[]>;
}

export interface RelayListFlow {
  fetchRelayListEvents(
    pubkey: string,
    relayListKind: number,
    followKind: number
  ): Promise<{
    relayListEvents: StoredEvent[];
    followListEvents: StoredEvent[];
  }>;
}

export interface ContentResolutionFlow {
  searchBookmarkDTagEvent(pubkey: string, normalizedUrl: string): Promise<StoredEvent | null>;
  searchEpisodeBookmarkByGuid(pubkey: string, guid: string): Promise<StoredEvent | null>;
}

export function createEmojiCatalogPlugin(
  readModel: EmojiCatalogReadModel
): ResonoteCoordinatorPlugin {
  return {
    name: 'emojiCatalogPlugin',
    apiVersion: 'v1',
    setup(api) {
      api.registerReadModel(EMOJI_CATALOG_READ_MODEL, readModel);
    }
  };
}

export function createCommentsFlowPlugin(flow: CommentsFlow): ResonoteCoordinatorPlugin {
  return {
    name: 'commentsFlowPlugin',
    apiVersion: 'v1',
    setup(api) {
      api.registerFlow(COMMENTS_FLOW, flow);
    }
  };
}

export function createNotificationsFlowPlugin(flow: NotificationsFlow): ResonoteCoordinatorPlugin {
  return {
    name: 'notificationsFlowPlugin',
    apiVersion: 'v1',
    setup(api) {
      api.registerFlow(NOTIFICATIONS_FLOW, flow);
    }
  };
}

export function createRelayListFlowPlugin(flow: RelayListFlow): ResonoteCoordinatorPlugin {
  return {
    name: 'relayListFlowPlugin',
    apiVersion: 'v1',
    setup(api) {
      api.registerFlow(RELAY_LIST_FLOW, flow);
    }
  };
}

export function createContentResolutionFlowPlugin(
  flow: ContentResolutionFlow
): ResonoteCoordinatorPlugin {
  return {
    name: 'contentResolutionFlowPlugin',
    apiVersion: 'v1',
    setup(api) {
      api.registerFlow(CONTENT_RESOLUTION_FLOW, flow);
    }
  };
}
