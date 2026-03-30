/**
 * NIP-09 deletion verification rules.
 * Pure functions — no side effects, no infra dependencies.
 */

// eslint-disable-next-line no-restricted-imports -- extractDeletionTargets is a pure tag extractor with no infra side effects
import { extractDeletionTargets } from '$shared/nostr/events.js';

/**
 * Verify deletion targets against known event pubkeys (NIP-09 author check).
 * Returns only the IDs that pass verification.
 */
export function verifyDeletionTargets(
  event: { pubkey: string; tags: string[][] },
  eventPubkeys: Map<string, string>
): string[] {
  const targets = extractDeletionTargets(event);
  return targets.filter((id) => {
    const originalPubkey = eventPubkeys.get(id);
    // Only accept if original event is known AND author matches
    return originalPubkey !== undefined && originalPubkey === event.pubkey;
  });
}
