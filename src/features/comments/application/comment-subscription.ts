/**
 * Comment subscription management.
 * Orchestrates rx-nostr backward/forward subscriptions + offline deletion reconcile.
 */

import {
  COMMENT_KIND,
  CONTENT_REACTION_KIND,
  DELETION_KIND,
  REACTION_KIND
} from '$shared/nostr/events.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('comment-subscription');
/** Build the 4-filter array for unified subscription on a given tag value. */
export function buildContentFilters(idValue: string) {
  return [
    { kinds: [COMMENT_KIND], '#I': [idValue] },
    { kinds: [REACTION_KIND], '#I': [idValue] },
    { kinds: [DELETION_KIND], '#I': [idValue] },
    { kinds: [CONTENT_REACTION_KIND], '#i': [idValue] }
  ];
}

/* Minimal shape for rx-nostr dynamic imports (avoids bare `any`). */
interface RxNostrLike {
  use(req: unknown): {
    pipe(...ops: unknown[]): { subscribe(observer: unknown): { unsubscribe(): void } };
  };
}

interface RxNostrModLike {
  createRxBackwardReq(): { emit(filter: unknown): void; over(): void };
  createRxForwardReq(): { emit(filter: unknown): void };
  uniq(): unknown;
}

export interface SubscriptionRefs {
  rxNostr: RxNostrLike;
  rxNostrMod: RxNostrModLike;
  rxjsMerge: (...args: unknown[]) => { subscribe(observer: unknown): { unsubscribe(): void } };
}

export async function loadSubscriptionDeps(): Promise<SubscriptionRefs> {
  const [{ merge }, rxNostrMod, { getRxNostr }] = await Promise.all([
    import('rxjs'),
    import('rx-nostr'),
    import('$shared/nostr/client.js')
  ]);
  const rxNostr = await getRxNostr();
  return { rxNostr, rxNostrMod, rxjsMerge: merge };
}

export interface SubscriptionHandle {
  unsubscribe: () => void;
}

/**
 * Start backward + forward subscriptions for content comments.
 */
export function startSubscription(
  refs: SubscriptionRefs,
  filters: ReturnType<typeof buildContentFilters>,
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
  onBackwardComplete: () => void
): SubscriptionHandle[] {
  const { createRxBackwardReq, createRxForwardReq, uniq } = refs.rxNostrMod;
  const backward = createRxBackwardReq();
  const forward = createRxForwardReq();

  const backwardFilters = maxCreatedAt
    ? filters.map((f: Record<string, unknown>) => ({ ...f, since: maxCreatedAt + 1 }))
    : filters;

  const backwardSub = refs.rxNostr
    .use(backward)
    .pipe(uniq())
    .subscribe({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      next: (packet: any) => onPacket(packet.event, packet.from),
      complete: onBackwardComplete,
      error: (err: unknown) => {
        log.error('Backward fetch error', err);
        onBackwardComplete();
      }
    });

  const forwardSub = refs.rxNostr
    .use(forward)
    .pipe(uniq())
    .subscribe({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      next: (packet: any) => onPacket(packet.event, packet.from),
      error: (err: unknown) => {
        log.error('Forward subscription error', err);
      }
    });

  backward.emit(backwardFilters);
  backward.over();
  forward.emit(filters);

  return [backwardSub, forwardSub];
}

/**
 * Start a merged backward+forward subscription for an additional tag value.
 */
export function startMergedSubscription(
  refs: SubscriptionRefs,
  filters: ReturnType<typeof buildContentFilters>,
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
  ) => void
): SubscriptionHandle {
  const { createRxBackwardReq, createRxForwardReq, uniq } = refs.rxNostrMod;
  const backward = createRxBackwardReq();
  const forward = createRxForwardReq();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merged: any = refs.rxjsMerge(
    refs.rxNostr.use(backward).pipe(uniq()),
    refs.rxNostr.use(forward).pipe(uniq())
  );
  const sub = merged.subscribe({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    next: (rawPacket: any) => {
      onPacket(rawPacket.event, rawPacket.from);
    },
    error: (err: unknown) => {
      log.error('Merged subscription error', err);
    }
  });

  backward.emit(filters);
  backward.over();
  forward.emit(filters);

  return sub as SubscriptionHandle;
}

/**
 * Reconcile offline deletions by querying kind:5 events targeting cached event IDs.
 */
/** Full Nostr event shape for deletion reconcile (matches runtime packet.event). */
export interface DeletionEvent {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string[][];
  kind: number;
}

export function startDeletionReconcile(
  refs: SubscriptionRefs,
  cachedIds: string[],
  onDeletionEvent: (event: DeletionEvent) => void,
  onComplete: () => void
): { sub: SubscriptionHandle; timeout: ReturnType<typeof setTimeout> } {
  const { createRxBackwardReq, uniq } = refs.rxNostrMod;
  const CHUNK_SIZE = 50;
  const reconcileBackward = createRxBackwardReq();

  let completed = false;
  function finish() {
    if (completed) return;
    completed = true;
    clearTimeout(timeout);
    sub.unsubscribe();
    onComplete();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = (refs.rxNostr as any)
    .use(reconcileBackward)
    .pipe(uniq())
    .subscribe({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      next: (packet: any) => onDeletionEvent(packet.event),
      complete: () => finish(),
      error: () => finish()
    });

  for (let i = 0; i < cachedIds.length; i += CHUNK_SIZE) {
    reconcileBackward.emit({ kinds: [DELETION_KIND], '#e': cachedIds.slice(i, i + CHUNK_SIZE) });
  }
  reconcileBackward.over();

  // Fallback timeout in case EOSE never arrives
  const timeout = setTimeout(() => finish(), 5000);

  return { sub, timeout };
}

// Re-export infra repository for application-layer consumers (UI should not import infra directly)
export {
  type CachedEvent,
  type EventsDB,
  getCommentRepository,
  purgeDeletedFromCache,
  restoreFromCache
} from '../infra/comment-repository.js';
