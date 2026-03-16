import { fromBase64url } from './url-utils.js';
import { getSystemPubkey, resolveByApi, parseDTagEvent } from './podcast-resolver.js';

export interface EpisodeInfo {
  enclosureUrl: string;
  title?: string;
  feedTitle?: string;
  image?: string;
}

export async function resolveEpisode(
  feedBase64: string,
  guidBase64: string
): Promise<EpisodeInfo | null> {
  const guid = fromBase64url(guidBase64);
  const feedUrl = fromBase64url(feedBase64);

  // 1. Try Nostr relay query (enclosureUrl only, no full metadata)
  const nostrResult = await queryNostrForEpisode(guid);

  // 2. API call for full metadata (also serves as fallback for enclosureUrl)
  const apiResult = await resolveByApi(feedUrl);
  const feedTitle = apiResult.feed?.title;
  const image = apiResult.feed?.image;

  if (apiResult.episodes) {
    const match = apiResult.episodes.find((ep) => ep.guid === guid);
    if (match) {
      return {
        enclosureUrl: match.enclosureUrl,
        title: match.title,
        feedTitle,
        image
      };
    }
  }
  if (apiResult.episode?.guid === guid) {
    return {
      enclosureUrl: apiResult.episode.enclosureUrl,
      title: apiResult.episode.title,
      feedTitle,
      image
    };
  }

  // Nostr-only result (no metadata)
  if (nostrResult) {
    return { enclosureUrl: nostrResult };
  }

  return null;
}

async function queryNostrForEpisode(guid: string): Promise<string | null> {
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
          const result = parseDTagEvent({ kind: 39701, tags: ev.tags });
          if (result) return result.enclosureUrl;
        }
      }
    } catch {
      // DB not available
    }

    // 2. Fallback: query relays
    const { getRxNostr } = await import('../nostr/client.js');
    const { createRxBackwardReq, uniq } = await import('rx-nostr');
    const { firstValueFrom, timeout } = await import('rxjs');

    const rxNostr = await getRxNostr();
    const req = createRxBackwardReq();

    const event$ = rxNostr.use(req).pipe(uniq(), timeout(5000));
    req.emit({
      kinds: [39701],
      authors: [pubkey],
      '#i': [`podcast:item:guid:${guid}`],
      limit: 1
    });
    req.over();

    const packet = await firstValueFrom(event$).catch(() => null);
    if (!packet) return null;

    // Persist to IndexedDB
    try {
      const { getEventsDB } = await import('../nostr/event-db.js');
      const db = await getEventsDB();
      await db.put(packet.event);
    } catch {
      // DB not available
    }

    const result = parseDTagEvent({ kind: 39701, tags: packet.event.tags });
    return result?.enclosureUrl ?? null;
  } catch {
    return null;
  }
}
