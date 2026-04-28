import type { ConsumerVisibleState, ReconcileReasonCode } from './vocabulary.js';

export interface ReconcileEmission {
  readonly subjectId: string;
  readonly reason: ReconcileReasonCode;
  readonly state: ConsumerVisibleState;
}

export interface ReplaceableCandidate {
  readonly id: string;
  readonly created_at: number;
}

export interface DeletionEventLike {
  readonly pubkey: string;
  readonly tags: string[][];
}

export interface DeletionReconcileResult {
  readonly verifiedTargetIds: string[];
  readonly emissions: ReconcileEmission[];
}

export type OfflineDeliveryDecision = 'confirmed' | 'retrying' | 'rejected';

export function mapReasonToConsumerState(reason: ReconcileReasonCode): ConsumerVisibleState {
  switch (reason) {
    case 'accepted-new':
    case 'ignored-duplicate':
    case 'replaced-winner':
    case 'confirmed-offline':
    case 'restored-replay':
      return 'confirmed';
    case 'ignored-older':
    case 'conflict-shadowed-local':
      return 'shadowed';
    case 'tombstoned':
    case 'expired':
      return 'deleted';
    case 'rejected-offline':
      return 'rejected';
    case 'repaired-replay':
    case 'repaired-negentropy':
      return 'repairing';
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

export function emitReconcile(subjectId: string, reason: ReconcileReasonCode): ReconcileEmission {
  return {
    subjectId,
    reason,
    state: mapReasonToConsumerState(reason)
  };
}

export function reconcileReplaceableCandidates(
  existing: ReplaceableCandidate | null,
  incoming: ReplaceableCandidate
): ReconcileEmission[] {
  if (!existing) {
    return [emitReconcile(incoming.id, 'accepted-new')];
  }

  if (existing.id === incoming.id) {
    return [emitReconcile(incoming.id, 'ignored-duplicate')];
  }

  if (incoming.created_at > existing.created_at) {
    return [
      emitReconcile(incoming.id, 'replaced-winner'),
      emitReconcile(existing.id, 'conflict-shadowed-local')
    ];
  }

  return [emitReconcile(incoming.id, 'ignored-older')];
}

export function reconcileDeletionSubjects(subjectIds: readonly string[]): ReconcileEmission[] {
  return [...new Set(subjectIds)].map((subjectId) => emitReconcile(subjectId, 'tombstoned'));
}

export function extractDeletionTargetIds(event: Pick<DeletionEventLike, 'tags'>): string[] {
  return event.tags
    .filter((tag) => tag[0] === 'e' && typeof tag[1] === 'string' && tag[1].length > 0)
    .map((tag) => tag[1] as string);
}

export function verifyDeletionTargets(
  event: DeletionEventLike,
  eventPubkeys: ReadonlyMap<string, string>
): string[] {
  const targets = extractDeletionTargetIds(event);
  return [...new Set(targets)].filter((id) => {
    const originalPubkey = eventPubkeys.get(id);
    return originalPubkey !== undefined && originalPubkey === event.pubkey;
  });
}

export function reconcileDeletionTargets(
  event: DeletionEventLike,
  eventPubkeys: ReadonlyMap<string, string>
): DeletionReconcileResult {
  const verifiedTargetIds = verifyDeletionTargets(event, eventPubkeys);
  return {
    verifiedTargetIds,
    emissions: reconcileDeletionSubjects(verifiedTargetIds)
  };
}

export function reconcileReplayRepairSubjects(
  subjectIds: readonly string[],
  reason: Extract<
    ReconcileReasonCode,
    'repaired-replay' | 'repaired-negentropy' | 'restored-replay'
  > = 'repaired-replay'
): ReconcileEmission[] {
  return [...new Set(subjectIds)].map((subjectId) => emitReconcile(subjectId, reason));
}

export function reconcileNegentropyRepairSubjects(
  subjectIds: readonly string[]
): ReconcileEmission[] {
  return reconcileReplayRepairSubjects(subjectIds, 'repaired-negentropy');
}

export function reconcileOfflineDelivery(
  subjectId: string,
  decision: OfflineDeliveryDecision
): ReconcileEmission {
  if (decision === 'confirmed') {
    return emitReconcile(subjectId, 'confirmed-offline');
  }
  if (decision === 'rejected') {
    return emitReconcile(subjectId, 'rejected-offline');
  }
  return emitReconcile(subjectId, 'repaired-replay');
}
