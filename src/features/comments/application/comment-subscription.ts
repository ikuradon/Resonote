/**
 * Comment subscription management.
 * Orchestrates rx-nostr backward/forward subscriptions + offline deletion reconcile.
 */

import { COMMENT_KIND, REACTION_KIND, DELETION_KIND } from '$shared/nostr/events.js';
/** Build the 3-filter array for unified subscription on a given tag value. */
export function buildContentFilters(idValue: string) {
  return [
    { kinds: [COMMENT_KIND], '#I': [idValue] },
    { kinds: [REACTION_KIND], '#I': [idValue] },
    { kinds: [DELETION_KIND], '#I': [idValue] }
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
    import('$shared/nostr/gateway.js')
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
  onPacket: (event: {
    id: string;
    pubkey: string;
    content: string;
    created_at: number;
    tags: string[][];
    kind: number;
  }) => void,
  onBackwardComplete: () => void
): SubscriptionHandle[] {
  const { createRxBackwardReq, createRxForwardReq, uniq } = refs.rxNostrMod;
  const backward = createRxBackwardReq();
  const forward = createRxForwardReq();

  const backwardFilters = maxCreatedAt
    ? filters.map((f: Record<string, unknown>) => ({ ...f, since: (maxCreatedAt as number) + 1 }))
    : filters;

  const backwardSub = refs.rxNostr
    .use(backward)
    .pipe(uniq())
    .subscribe({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      next: (packet: any) => onPacket(packet.event),
      complete: onBackwardComplete,
      error: (err: unknown) => {
        console.error('[comment-subscription] Backward fetch error:', err);
        onBackwardComplete();
      }
    });

  const forwardSub = refs.rxNostr
    .use(forward)
    .pipe(uniq())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .subscribe((packet: any) => {
      onPacket(packet.event);
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
  onPacket: (event: {
    id: string;
    pubkey: string;
    content: string;
    created_at: number;
    tags: string[][];
    kind: number;
  }) => void
): SubscriptionHandle {
  const { createRxBackwardReq, createRxForwardReq, uniq } = refs.rxNostrMod;
  const backward = createRxBackwardReq();
  const forward = createRxForwardReq();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merged: any = refs.rxjsMerge(
    refs.rxNostr.use(backward).pipe(uniq()),
    refs.rxNostr.use(forward).pipe(uniq())
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = merged.subscribe((rawPacket: any) => {
    onPacket(rawPacket.event);
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
  getCommentRepository,
  restoreFromCache,
  purgeDeletedFromCache,
  type EventsDB,
  type CachedEvent
} from '../infra/comment-repository.js';
