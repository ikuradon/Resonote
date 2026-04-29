import { createEventCoordinator } from '@auftakt/runtime';
import { describe, expect, it, vi } from 'vitest';

describe('EventCoordinator degraded storage', () => {
  it('does not claim durable settlement when store writes fail', async () => {
    const coordinator = createEventCoordinator({
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn(async () => {
          throw new Error('quota');
        })
      },
      relay: { verify: vi.fn(async () => []) }
    });

    const result = await coordinator.materializeFromRelay(
      { id: 'e1', pubkey: 'p1', created_at: 1, kind: 1, tags: [], content: '' },
      'wss://relay.example'
    );

    expect(result).toEqual({ stored: false, durability: 'degraded' });
  });
});
