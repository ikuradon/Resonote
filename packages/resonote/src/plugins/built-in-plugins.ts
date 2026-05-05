import type { StoredEvent } from '@auftakt/core';
export { createTimelinePlugin } from './timeline-plugin.js';
import type { AuftaktRuntimePlugin, SubscriptionHandle } from '@auftakt/runtime';

import type { CommentFilterKinds, CommentSubscriptionRefs, DeletionEvent } from '../runtime.js';

export interface EmojiCategory {
  id: string;
  name: string;
  emojis: { id: string; name: string; skins: { src: string }[] }[];
}

export type CustomEmojiSetResolution = 'cache' | 'relay' | 'memory' | 'unknown';
export type CustomEmojiSourceMode = 'cache-only' | 'relay-checked' | 'unknown';

export interface CustomEmojiSetDiagnosticsSource {
  ref: string;
  id: string;
  pubkey: string;
  dTag: string;
  title: string;
  createdAtSec: number;
  emojiCount: number;
  resolvedVia: CustomEmojiSetResolution;
}

export interface CustomEmojiDiagnosticsSource {
  listEvent: {
    id: string;
    createdAtSec: number;
    inlineEmojiCount: number;
    referencedSetRefCount: number;
  } | null;
  sets: CustomEmojiSetDiagnosticsSource[];
  missingRefs: string[];
  invalidRefs: string[];
  warnings: string[];
  sourceMode: CustomEmojiSourceMode;
}

export interface CustomEmojiSourceDiagnosticsResult {
  diagnostics: CustomEmojiDiagnosticsSource;
  categories: EmojiCategory[];
}

export interface CustomEmojiSourceDiagnosticsOptions {
  readonly generation?: number;
  readonly getGeneration?: () => number;
}

export const EMOJI_CATALOG_READ_MODEL = 'emojiCatalog';
export const NOTIFICATIONS_FLOW = 'notificationsFlow';

export interface EmojiCatalogReadModel {
  fetchCustomEmojiSources(
    pubkey: string,
    options?: CustomEmojiSourceDiagnosticsOptions
  ): Promise<{
    listEvent: StoredEvent | null;
    setEvents: StoredEvent[];
  }>;
  fetchCustomEmojiCategories(pubkey: string): Promise<EmojiCategory[]>;
  fetchCustomEmojiSourceDiagnostics(
    pubkey: string,
    options?: CustomEmojiSourceDiagnosticsOptions
  ): Promise<CustomEmojiSourceDiagnosticsResult>;
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

export interface ContentResolutionFlow {
  searchBookmarkDTagEvent(pubkey: string, normalizedUrl: string): Promise<StoredEvent | null>;
  searchEpisodeBookmarkByGuid(pubkey: string, guid: string): Promise<StoredEvent | null>;
}

export function createEmojiCatalogPlugin(readModel: EmojiCatalogReadModel): AuftaktRuntimePlugin {
  return {
    name: 'emojiCatalogPlugin',
    apiVersion: 'v1',
    setup(api) {
      api.registerReadModel(EMOJI_CATALOG_READ_MODEL, readModel);
    }
  };
}

export function createNotificationsFlowPlugin(flow: NotificationsFlow): AuftaktRuntimePlugin {
  return {
    name: 'notificationsFlowPlugin',
    apiVersion: 'v1',
    setup(api) {
      api.registerFlow(NOTIFICATIONS_FLOW, flow);
    }
  };
}
