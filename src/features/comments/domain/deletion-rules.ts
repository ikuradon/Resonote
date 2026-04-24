/**
 * NIP-09 deletion verification rules.
 * Pure functions — no side effects, no infra dependencies.
 */

import {
  type DeletionEventLike,
  type DeletionReconcileResult,
  reconcileDeletionTargets as reconcileDeletionTargetsImpl,
  verifyDeletionTargets as verifyDeletionTargetsImpl
} from '@auftakt/core';

/**
 * Verify deletion targets against known event pubkeys (NIP-09 author check).
 * Returns only the IDs that pass verification.
 */
export function verifyDeletionTargets(
  event: DeletionEventLike,
  eventPubkeys: Map<string, string>
): string[] {
  return verifyDeletionTargetsImpl(event, eventPubkeys);
}

export function reconcileDeletionTargets(
  event: DeletionEventLike,
  eventPubkeys: Map<string, string>
): DeletionReconcileResult {
  return reconcileDeletionTargetsImpl(event, eventPubkeys);
}
