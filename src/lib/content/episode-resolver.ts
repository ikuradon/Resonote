import { fromBase64url } from './url-utils.js';
import { SYSTEM_PUBKEY, resolveByApi } from './podcast-resolver.js';

export async function resolveEpisodeEnclosure(
  feedBase64: string,
  guidBase64: string
): Promise<string | null> {
  const guid = fromBase64url(guidBase64);
  const feedUrl = fromBase64url(feedBase64);

  // 1. Try Nostr relay query
  const nostrResult = await queryNostrForEpisode(guid);
  if (nostrResult) return nostrResult;

  // 2. Fallback: API
  const apiResult = await resolveByApi(feedUrl);
  if (apiResult.episodes) {
    const match = apiResult.episodes.find((ep) => ep.guid === guid);
    if (match) return match.enclosureUrl;
  }
  if (apiResult.episode?.guid === guid) {
    return apiResult.episode.enclosureUrl;
  }

  return null;
}

async function queryNostrForEpisode(guid: string): Promise<string | null> {
  try {
    const { getRxNostr } = await import('../nostr/client.js');
    const { createRxBackwardReq, uniq } = await import('rx-nostr');
    const { firstValueFrom, timeout } = await import('rxjs');

    const rxNostr = await getRxNostr();
    const req = createRxBackwardReq();

    const event$ = rxNostr.use(req).pipe(uniq(), timeout(5000));
    req.emit({
      kinds: [39701],
      authors: [SYSTEM_PUBKEY],
      '#i': [`podcast:item:guid:${guid}`],
      limit: 1
    });
    req.over();

    const packet = await firstValueFrom(event$).catch(() => null);
    if (!packet) return null;

    // First r tag is typically the enclosure URL
    const rTags = packet.event.tags.filter((t: string[]) => t[0] === 'r');
    return rTags[0]?.[1] ?? null;
  } catch {
    return null;
  }
}
