import { describe, expect, it, vi } from 'vitest';

import { createEventCoordinator } from './event-coordinator.js';

describe('EventCoordinator read policy', () => {
  it('returns local hit immediately and schedules remote verification for localFirst', async () => {
    const verify = vi.fn(async () => []);
    const coordinator = createEventCoordinator({
      store: {
        getById: vi.fn(async () => ({
          id: 'e1',
          pubkey: 'p1',
          created_at: 1,
          kind: 1,
          tags: [],
          content: 'local'
        })),
        putWithReconcile: vi.fn()
      },
      relay: { verify }
    });

    const result = await coordinator.read({ ids: ['e1'] }, { policy: 'localFirst' });

    expect(result.events).toHaveLength(1);
    expect(result.settlement.phase).toBe('partial');
    expect(verify).toHaveBeenCalledWith(
      [{ ids: ['e1'] }],
      expect.objectContaining({ reason: 'localFirst' })
    );
  });

  it('does not schedule remote verification for cacheOnly', async () => {
    const verify = vi.fn(async () => []);
    const coordinator = createEventCoordinator({
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn()
      },
      relay: { verify }
    });

    await coordinator.read({ ids: ['missing'] }, { policy: 'cacheOnly' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('uses cacheOnly only when explicitly requested', async () => {
    const verify = vi.fn(async () => []);
    const coordinator = createEventCoordinator({
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn()
      },
      relay: { verify }
    });

    await coordinator.read({ ids: ['e1'] }, { policy: 'localFirst' });
    await coordinator.read({ ids: ['e1'] }, { policy: 'cacheOnly' });

    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('schedules verification for latest replaceable reads', async () => {
    const verify = vi.fn(async () => []);
    const coordinator = createEventCoordinator({
      store: {
        getById: vi.fn(async () => null),
        putWithReconcile: vi.fn()
      },
      relay: { verify }
    });

    await coordinator.read({ authors: ['alice'], kinds: [0], limit: 1 }, { policy: 'localFirst' });

    expect(verify).toHaveBeenCalledWith([{ authors: ['alice'], kinds: [0], limit: 1 }], {
      reason: 'localFirst'
    });
  });
});
