/**
 * Follow actions — follow/unfollow user.
 * Encapsulates infra (castSigned, fetchLatestEvent).
 */

import { createLogger, shortHex } from '$shared/utils/logger.js';

import { extractFollows } from '../domain/follow-model.js';

const log = createLogger('follow-actions');
const FOLLOW_KIND = 3;

export async function publishFollow(pubkey: string, myPubkey: string): Promise<void> {
  const { castSigned, fetchLatestEvent } = await import('$shared/nostr/client.js');
  const latest = await fetchLatestEvent(myPubkey, FOLLOW_KIND);
  const currentTags = latest?.tags ?? [];

  if (currentTags.some((t) => t[0] === 'p' && t[1] === pubkey)) {
    log.info('Already following', { pubkey: shortHex(pubkey) });
    return;
  }

  const tags = [...currentTags, ['p', pubkey]];
  await castSigned({ kind: FOLLOW_KIND, tags, content: latest?.content ?? '' });
  log.info('Followed', { pubkey: shortHex(pubkey) });
}

export async function publishUnfollow(pubkey: string, myPubkey: string): Promise<void> {
  const { castSigned, fetchLatestEvent } = await import('$shared/nostr/client.js');
  const latest = await fetchLatestEvent(myPubkey, FOLLOW_KIND);
  if (!latest) return;

  const tags = latest.tags.filter((t) => !(t[0] === 'p' && t[1] === pubkey));
  await castSigned({ kind: FOLLOW_KIND, tags, content: latest.content });
  log.info('Unfollowed', { pubkey: shortHex(pubkey) });
}

export { extractFollows };
