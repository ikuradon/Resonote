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
 * Uses rx-nostr backward request with optional cursor-based pagination.
 */
export async function fetchProfileComments(
  pubkey: string,
  until?: number
): Promise<ProfileCommentsResult> {
  const [{ createRxBackwardReq }, { getRxNostr }] = await Promise.all([
    import('rx-nostr'),
    import('$shared/nostr/client.js')
  ]);
  const rxNostr = await getRxNostr();
  const req = createRxBackwardReq();

  return new Promise((resolve, reject) => {
    const items: ProfileComment[] = [];

    const sub = rxNostr.use(req).subscribe({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      next: (packet: any) => {
        const iTag = packet.event.tags.find((tag: string[]) => tag[0] === 'I')?.[1] ?? null;
        items.push({
          id: packet.event.id,
          content: packet.event.content,
          createdAt: packet.event.created_at,
          iTag
        });
      },
      complete: () => {
        sub.unsubscribe();
        items.sort((a, b) => b.createdAt - a.createdAt);
        const oldestTimestamp = items.length > 0 ? items[items.length - 1].createdAt : null;
        resolve({
          comments: items,
          hasMore: items.length >= COMMENTS_LIMIT,
          oldestTimestamp
        });
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      error: (err: any) => {
        sub.unsubscribe();
        log.error('Failed to load profile comments', err);
        reject(err);
      }
    });

    req.emit(
      until
        ? { kinds: [1111], authors: [pubkey], limit: COMMENTS_LIMIT, until }
        : { kinds: [1111], authors: [pubkey], limit: COMMENTS_LIMIT }
    );
    req.over();
  });
}
