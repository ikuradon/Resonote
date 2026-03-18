import { fromBase64url } from './url-utils.js';
import type { DTagResult } from './podcast-resolver.js';
import { getSystemPubkey, resolveByApi, parseDTagEvent } from './podcast-resolver.js';

export interface EpisodeInfo {
  enclosureUrl: string;
  title?: string;
  feedTitle?: string;
  image?: string;
  description?: string;
}

export async function resolveEpisode(
  feedBase64: string,
  guidBase64: string
): Promise<EpisodeInfo | null> {
  const guid = fromBase64url(guidBase64);
  const feedUrl = fromBase64url(feedBase64);

  // Parallel: Nostr bookmark query + API metadata fetch
  // queryNostrForEpisode has internal try-catch (never rejects)
  // resolveByApi may throw on network/server errors → catch to null
  const [nostrResult, apiResult] = await Promise.all([
    queryNostrForEpisode(guid),
    resolveByApi(feedUrl).catch(() => null)
  ]);

  if (apiResult) {
    const feedTitle = apiResult.feed?.title;
    const image = apiResult.feed?.imageUrl;

    if (apiResult.episodes) {
      const match = apiResult.episodes.find((ep) => ep.guid === guid);
      if (match) {
        return {
          enclosureUrl: match.enclosureUrl,
          title: match.title,
          feedTitle,
          image,
          description: nostrResult?.description ?? match.description
        };
      }
    }
    if (apiResult.episode?.guid === guid) {
      return {
        enclosureUrl: apiResult.episode.enclosureUrl,
        title: apiResult.episode.title,
        feedTitle,
        image,
        description: nostrResult?.description ?? apiResult.episode.description
      };
    }
  }

  // Nostr-only result (no full metadata from API)
  if (nostrResult) {
    return {
      enclosureUrl: nostrResult.enclosureUrl,
      description: nostrResult.description
    };
  }

  return null;
}

async function queryNostrForEpisode(guid: string): Promise<DTagResult | null> {
  try {
    const pubkey = await getSystemPubkey();
    if (!pubkey) return null;

    // 1. Try IndexedDB cache (search by tag value)
    try {
      const { getEventsDB } = await import('../nostr/event-db.js');
      const db = await getEventsDB();
      const cached = await db.getByTagValue(`i:podcast:item:guid:${guid}`, 39701);
      for (const ev of cached) {
        if (ev.pubkey === pubkey) {
          const result = parseDTagEvent({ kind: 39701, tags: ev.tags, content: ev.content });
          if (result) return result;
        }
      }
    } catch {
      // DB not available
    }

    // 2. Fallback: query relays
    const { getRxNostr } = await import('../nostr/client.js');
    const { createRxBackwardReq, uniq } = await import('rx-nostr');

    const rxNostr = await getRxNostr();
    const req = createRxBackwardReq();
    const filter = {
      kinds: [39701],
      authors: [pubkey],
      '#i': [`podcast:item:guid:${guid}`],
      limit: 1
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const packet = await new Promise<any>((resolve) => {
      const timer = setTimeout(() => {
        sub.unsubscribe();
        resolve(null);
      }, 5000);

      const sub = rxNostr
        .use(req)
        .pipe(uniq())
        .subscribe({
          next: (p) => {
            clearTimeout(timer);
            sub.unsubscribe();
            resolve(p);
          },
          complete: () => {
            clearTimeout(timer);
            resolve(null);
          }
        });

      req.emit(filter);
      req.over();
    });

    if (!packet) return null;

    // Persist to IndexedDB
    try {
      const { getEventsDB } = await import('../nostr/event-db.js');
      const db = await getEventsDB();
      await db.put(packet.event);
    } catch {
      // DB not available
    }

    return parseDTagEvent({
      kind: 39701,
      tags: packet.event.tags,
      content: packet.event.content
    });
  } catch {
    return null;
  }
}
