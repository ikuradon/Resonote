import type { ReadSettlement, ReadSettlementLocalProvenance } from './vocabulary.js';

export interface ReadSettlementReducerInput {
  readonly localSettled: boolean;
  readonly relaySettled: boolean;
  readonly relayRequired?: boolean;
  readonly localHitProvenance?: ReadSettlementLocalProvenance | null;
  readonly relayHit?: boolean;
  readonly nullTtlHit?: boolean;
  readonly invalidatedDuringFetch?: boolean;
}

export function reduceReadSettlement(input: ReadSettlementReducerInput): ReadSettlement {
  if (input.invalidatedDuringFetch === true) {
    return {
      phase: 'settled',
      provenance: 'none',
      reason: 'invalidated-during-fetch'
    };
  }

  if (input.nullTtlHit === true) {
    return {
      phase: 'settled',
      provenance: 'none',
      reason: 'null-ttl-hit'
    };
  }

  const relayRequired = input.relayRequired ?? true;
  const relaySettled = relayRequired ? input.relaySettled : true;

  const phase: ReadSettlement['phase'] =
    input.localSettled === false && relaySettled === false
      ? 'pending'
      : relaySettled === false
        ? 'partial'
        : 'settled';

  const localHitProvenance = input.localHitProvenance ?? null;
  const relayHit = input.relayHit ?? false;
  const localHit = localHitProvenance !== null;

  const provenance: ReadSettlement['provenance'] = relayHit
    ? localHit
      ? 'mixed'
      : 'relay'
    : localHit
      ? localHitProvenance
      : 'none';

  const reason: ReadSettlement['reason'] = relayHit
    ? 'relay-repair'
    : localHit
      ? 'cache-hit'
      : phase === 'settled'
        ? 'settled-miss'
        : 'cache-miss';

  return {
    phase,
    provenance,
    reason
  };
}
