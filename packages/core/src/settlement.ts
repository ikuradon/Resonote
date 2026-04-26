import type { OfflineDeliveryDecision } from './reconcile.js';
import type {
  PublishSettlement,
  PublishSettlementDurability,
  PublishSettlementPhase,
  PublishSettlementReason,
  PublishSettlementState,
  ReadSettlement,
  ReadSettlementLocalProvenance
} from './vocabulary.js';

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

export interface PublishSettlementReducerInput {
  readonly localMaterialized: boolean;
  readonly relayAccepted: boolean;
  readonly queued: boolean;
  readonly deliveryDecision?: OfflineDeliveryDecision;
  readonly materializationDurability?: 'durable' | 'degraded';
}

export function reducePublishSettlement(input: PublishSettlementReducerInput): PublishSettlement {
  if (input.materializationDurability === 'degraded') {
    return {
      phase: input.queued ? 'pending' : 'partial',
      state: input.deliveryDecision === 'rejected' ? 'rejected' : 'retrying',
      durability: 'degraded',
      reason: 'materialization-degraded'
    };
  }

  if (input.deliveryDecision === 'rejected') {
    return {
      phase: 'settled',
      state: 'rejected',
      durability: 'queued',
      reason: 'rejected-offline'
    };
  }

  if (input.deliveryDecision === 'retrying') {
    return {
      phase: 'pending',
      state: 'retrying',
      durability: 'queued',
      reason: 'retrying-offline'
    };
  }

  if (input.queued) {
    return {
      phase: 'pending',
      state: 'queued',
      durability: 'queued',
      reason: 'queued-offline'
    };
  }

  if (input.relayAccepted) {
    return {
      phase: 'settled',
      state: 'confirmed',
      durability: 'relay',
      reason: 'relay-accepted'
    };
  }

  const phase: PublishSettlementPhase = input.localMaterialized ? 'partial' : 'pending';
  const state: PublishSettlementState = input.localMaterialized ? 'confirmed' : 'retrying';
  const durability: PublishSettlementDurability = input.localMaterialized ? 'local' : 'queued';
  const reason: PublishSettlementReason = input.localMaterialized
    ? 'local-materialized'
    : 'retrying-offline';

  return { phase, state, durability, reason };
}
