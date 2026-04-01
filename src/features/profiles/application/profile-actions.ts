/**
 * Profile actions — follow count query.
 * Encapsulates infra access for profile page.
 */

import { FOLLOW_KIND } from '$shared/nostr/events.js';
import { fetchLatest } from '$shared/nostr/store.js';
import { createLogger } from '$shared/utils/logger.js';

const log = createLogger('profile-actions');

export interface FollowsCountResult {
  count: number;
  pubkeys: string[];
}

export async function fetchFollowsCount(pubkey: string): Promise<FollowsCountResult> {
  try {
    const latestEvent = await fetchLatest(pubkey, FOLLOW_KIND);
    if (latestEvent) {
      const pks = latestEvent.tags.filter((tag) => tag[0] === 'p' && tag[1]).map((tag) => tag[1]);
      return { count: pks.length, pubkeys: pks };
    }
    return { count: 0, pubkeys: [] };
  } catch (err) {
    log.error('Failed to fetch follows count', err);
    return { count: 0, pubkeys: [] };
  }
}
