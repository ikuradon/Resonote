import {
  createNegentropyRepairRequestKey,
  createRuntimeRequestKey,
  mapReasonToConsumerState,
  reconcileDeletionSubjects,
  reconcileDeletionTargets,
  reconcileNegentropyRepairSubjects,
  reconcileOfflineDelivery,
  reconcileReplaceableCandidates,
  reconcileReplayRepairSubjects
} from '@auftakt/core';
import { describe, expect, it } from 'vitest';

describe('reconcile reason/state contract', () => {
  it('maps reason codes to canonical consumer-visible states', () => {
    expect(mapReasonToConsumerState('accepted-new')).toBe('confirmed');
    expect(mapReasonToConsumerState('ignored-older')).toBe('shadowed');
    expect(mapReasonToConsumerState('tombstoned')).toBe('deleted');
    expect(mapReasonToConsumerState('expired')).toBe('deleted');
    expect(mapReasonToConsumerState('vanished')).toBe('deleted');
    expect(mapReasonToConsumerState('rejected-offline')).toBe('rejected');
    expect(mapReasonToConsumerState('repaired-replay')).toBe('repairing');
    expect(mapReasonToConsumerState('repaired-negentropy')).toBe('repairing');
  });

  it('emits winner + shadowed for replaceable replacement', () => {
    const emissions = reconcileReplaceableCandidates(
      { id: 'old', created_at: 100 },
      { id: 'new', created_at: 200 }
    );

    expect(emissions).toEqual([
      {
        subjectId: 'new',
        reason: 'replaced-winner',
        state: 'confirmed'
      },
      {
        subjectId: 'old',
        reason: 'conflict-shadowed-local',
        state: 'shadowed'
      }
    ]);
  });

  it('emits tombstoned/deleted for deletion subjects', () => {
    expect(reconcileDeletionSubjects(['ev-1'])).toEqual([
      {
        subjectId: 'ev-1',
        reason: 'tombstoned',
        state: 'deleted'
      }
    ]);
  });

  it('verifies NIP-09 targets with author match and dedupes repeated e-tags', () => {
    expect(
      reconcileDeletionTargets(
        {
          pubkey: 'author-a',
          tags: [
            ['e', 'ev-1'],
            ['e', 'ev-2'],
            ['e', 'ev-1']
          ]
        },
        new Map([
          ['ev-1', 'author-a'],
          ['ev-2', 'author-b']
        ])
      )
    ).toEqual({
      verifiedTargetIds: ['ev-1'],
      emissions: [
        {
          subjectId: 'ev-1',
          reason: 'tombstoned',
          state: 'deleted'
        }
      ]
    });
  });

  it('emits canonical offline confirm/reject/repair states', () => {
    expect(reconcileOfflineDelivery('ev-ok', 'confirmed')).toEqual({
      subjectId: 'ev-ok',
      reason: 'confirmed-offline',
      state: 'confirmed'
    });
    expect(reconcileOfflineDelivery('ev-ng', 'rejected')).toEqual({
      subjectId: 'ev-ng',
      reason: 'rejected-offline',
      state: 'rejected'
    });
    expect(reconcileOfflineDelivery('ev-retry', 'retrying')).toEqual({
      subjectId: 'ev-retry',
      reason: 'repaired-replay',
      state: 'repairing'
    });
  });

  it('emits replay repair/restoration reasons with canonical states', () => {
    expect(reconcileReplayRepairSubjects(['ev-1'], 'repaired-replay')).toEqual([
      {
        subjectId: 'ev-1',
        reason: 'repaired-replay',
        state: 'repairing'
      }
    ]);
    expect(reconcileReplayRepairSubjects(['ev-1'], 'restored-replay')).toEqual([
      {
        subjectId: 'ev-1',
        reason: 'restored-replay',
        state: 'confirmed'
      }
    ]);
    expect(reconcileNegentropyRepairSubjects(['ev-2'])).toEqual([
      {
        subjectId: 'ev-2',
        reason: 'repaired-negentropy',
        state: 'repairing'
      }
    ]);
  });

  it('uses a dedicated requestKey scope for negentropy repair fetches', () => {
    const filters = [{ kinds: [1], authors: ['pubkey-a'] }];

    expect(
      createNegentropyRepairRequestKey({
        filters,
        relayUrl: 'wss://relay.contract.test'
      })
    ).not.toBe(
      createRuntimeRequestKey({
        mode: 'backward',
        filters,
        overlay: {
          relays: ['wss://relay.contract.test'],
          includeDefaultReadRelays: false
        },
        scope: 'timeline:repair:fallback'
      })
    );
  });
});
