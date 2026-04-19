/**
 * NIP-09 deletion verification rules.
 * Pure functions — no side effects, no infra dependencies.
 */

import { reconcileDeletionSubjects, type ReconcileEmission } from '@auftakt/timeline';

// removed infra import; keep domain pure

function extractDeletionTargets(event: { tags: string[][] }): string[] {
  return event.tags.filter((tag) => tag[0] === 'e').map((tag) => tag[1]);
}

export interface DeletionReconcileResult {
  readonly verifiedTargetIds: string[];
  readonly emissions: ReconcileEmission[];
}

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

export function reconcileDeletionTargets(
  event: { pubkey: string; tags: string[][] },
  eventPubkeys: Map<string, string>
): DeletionReconcileResult {
  const verifiedTargetIds = verifyDeletionTargets(event, eventPubkeys);
  return {
    verifiedTargetIds,
    emissions: reconcileDeletionSubjects(verifiedTargetIds)
  };
}
