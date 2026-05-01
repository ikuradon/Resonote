import { reduceReadSettlement } from '@auftakt/core';
import { describe, expect, it } from 'vitest';

describe('read settlement contract', () => {
  it('maps null TTL hit to a distinct settled negative-cache outcome', () => {
    const settlement = reduceReadSettlement({
      localSettled: true,
      relaySettled: false,
      relayRequired: false,
      nullTtlHit: true
    });

    expect(settlement).toEqual({
      phase: 'settled',
      provenance: 'none',
      reason: 'null-ttl-hit'
    });
  });

  it('keeps invalidated-during-fetch as terminal reason even with read hits', () => {
    const settlement = reduceReadSettlement({
      localSettled: true,
      relaySettled: true,
      relayRequired: true,
      localHitProvenance: 'store',
      relayHit: true,
      invalidatedDuringFetch: true
    });

    expect(settlement).toEqual({
      phase: 'settled',
      provenance: 'none',
      reason: 'invalidated-during-fetch'
    });
  });

  it('represents relay settlement lifecycle as partial -> settled', () => {
    const partial = reduceReadSettlement({
      localSettled: true,
      relaySettled: false,
      relayRequired: true
    });
    const settled = reduceReadSettlement({
      localSettled: true,
      relaySettled: true,
      relayRequired: true
    });

    expect(partial).toEqual({
      phase: 'partial',
      provenance: 'none',
      reason: 'cache-miss'
    });
    expect(settled).toEqual({
      phase: 'settled',
      provenance: 'none',
      reason: 'settled-miss'
    });
  });

  it('keeps local cache hits partial until the relay path settles', () => {
    const settlement = reduceReadSettlement({
      localSettled: true,
      relaySettled: false,
      relayRequired: true,
      localHitProvenance: 'store'
    });

    expect(settlement).toEqual({
      phase: 'partial',
      provenance: 'store',
      reason: 'cache-hit'
    });
  });
});
