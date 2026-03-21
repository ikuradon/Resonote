/**
 * Follow domain types and pure functions.
 */

export type FollowFilter = 'all' | 'follows' | 'wot';

/** Extract follows Set from a kind:3 event's p tags. */
export function extractFollows(event: { tags: string[][] }): Set<string> {
  const pubkeys = new Set<string>();
  for (const tag of event.tags) {
    if (tag[0] === 'p' && tag[1]) pubkeys.add(tag[1]);
  }
  return pubkeys;
}

/**
 * Check if a pubkey passes the given filter.
 * 'all' always passes. Own pubkey always passes.
 */
export function matchesFilter(
  pubkey: string,
  filter: FollowFilter,
  myPubkey: string | null,
  follows: Set<string>,
  wot: Set<string>
): boolean {
  if (filter === 'all') return true;
  if (myPubkey && pubkey === myPubkey) return true;
  if (filter === 'follows') return follows.has(pubkey);
  if (filter === 'wot') return wot.has(pubkey);
  return true;
}
