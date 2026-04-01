import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('ProfileQueries');

export interface ProfileComment {
  id: string;
  content: string;
  createdAt: number;
  iTag: string | null;
}

export interface ProfileCommentsResult {
  comments: ProfileComment[];
  hasMore: boolean;
  oldestTimestamp: number | null;
}

const COMMENTS_LIMIT = 20;

/**
 * Fetch kind:1111 comments authored by a given pubkey.
 * Uses auftakt createSyncedQuery backward with optional cursor-based pagination.
 */
export async function fetchProfileComments(
  pubkey: string,
  until?: number
): Promise<ProfileCommentsResult> {
  const [{ createSyncedQuery }, { getRxNostr }, { getStoreAsync }] = await Promise.all([
    import('@ikuradon/auftakt/sync'),
    import('$shared/nostr/client.js'),
    import('$shared/nostr/store.js')
  ]);
  const { firstValueFrom, filter, timeout, catchError, of, defaultIfEmpty } = await import('rxjs');
  const [rxNostr, store] = await Promise.all([getRxNostr(), getStoreAsync()]);

  const queryFilter = until
    ? { kinds: [1111], authors: [pubkey], limit: COMMENTS_LIMIT, until }
    : { kinds: [1111], authors: [pubkey], limit: COMMENTS_LIMIT };

  const synced = createSyncedQuery(rxNostr, store, {
    filter: queryFilter,
    strategy: 'backward'
  });

  try {
    const result = await firstValueFrom(
      synced.events$.pipe(
        filter((events: unknown[]) => events.length > 0),
        timeout(10_000),
        catchError(() => of(null)),
        defaultIfEmpty(null)
      )
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cachedEvents: any[] = result ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: ProfileComment[] = cachedEvents.map((ce: any) => {
      const iTag = ce.event.tags.find((tag: string[]) => tag[0] === 'I')?.[1] ?? null;
      return {
        id: ce.event.id,
        content: ce.event.content,
        createdAt: ce.event.created_at,
        iTag
      };
    });

    items.sort((a, b) => b.createdAt - a.createdAt);
    const oldestTimestamp = items.length > 0 ? items[items.length - 1].createdAt : null;
    return {
      comments: items,
      hasMore: items.length >= COMMENTS_LIMIT,
      oldestTimestamp
    };
  } catch (err) {
    log.error('Failed to load profile comments', err);
    throw err;
  } finally {
    synced.dispose();
  }
}
