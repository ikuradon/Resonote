import { describe, expect, it } from 'vitest';

import { reducePublishSettlement } from './settlement.js';

describe('publish settlement contract', () => {
  it('represents local materialization before relay delivery', () => {
    expect(
      reducePublishSettlement({
        localMaterialized: true,
        relayAccepted: false,
        queued: false
      })
    ).toEqual({
      phase: 'partial',
      state: 'confirmed',
      durability: 'local',
      reason: 'local-materialized'
    });
  });

  it('represents relay accepted delivery as settled relay durability', () => {
    expect(
      reducePublishSettlement({
        localMaterialized: true,
        relayAccepted: true,
        queued: false
      })
    ).toEqual({
      phase: 'settled',
      state: 'confirmed',
      durability: 'relay',
      reason: 'relay-accepted'
    });
  });

  it('represents offline queueing as pending queued settlement', () => {
    expect(
      reducePublishSettlement({
        localMaterialized: true,
        relayAccepted: false,
        queued: true,
        deliveryDecision: 'retrying'
      })
    ).toEqual({
      phase: 'pending',
      state: 'retrying',
      durability: 'queued',
      reason: 'retrying-offline'
    });
  });

  it('represents rejected retry drains as settled queued rejection', () => {
    expect(
      reducePublishSettlement({
        localMaterialized: false,
        relayAccepted: false,
        queued: false,
        deliveryDecision: 'rejected'
      })
    ).toEqual({
      phase: 'settled',
      state: 'rejected',
      durability: 'queued',
      reason: 'rejected-offline'
    });
  });

  it('represents degraded local materialization without hiding retry state', () => {
    expect(
      reducePublishSettlement({
        localMaterialized: false,
        relayAccepted: false,
        queued: true,
        deliveryDecision: 'retrying',
        materializationDurability: 'degraded'
      })
    ).toEqual({
      phase: 'pending',
      state: 'retrying',
      durability: 'degraded',
      reason: 'materialization-degraded'
    });
  });
});
