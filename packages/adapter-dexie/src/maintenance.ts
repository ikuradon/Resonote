import type { DexieDeletionIndexRecord, DexiePendingPublishRecord } from './schema.js';

export interface CompactionProtectionInput {
  readonly deletionIndex: readonly DexieDeletionIndexRecord[];
  readonly pendingPublishes: readonly DexiePendingPublishRecord[];
}

export function buildProtectedCompactionEventIds(input: CompactionProtectionInput): Set<string> {
  const protectedIds = new Set<string>();

  for (const row of input.deletionIndex) {
    protectedIds.add(row.deletion_id);
    protectedIds.add(row.target_id);
  }

  for (const row of input.pendingPublishes) {
    protectedIds.add(row.id);
    protectedIds.add(row.event.id);
  }

  return protectedIds;
}
