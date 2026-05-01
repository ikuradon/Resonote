import { describe, expect, it } from 'vitest';

import { createMaterializerQueue } from './materializer-queue.js';

describe('MaterializerQueue', () => {
  it('runs deletion work before normal relay events', async () => {
    const order: string[] = [];
    const queue = createMaterializerQueue();

    queue.enqueue({ priority: 'normal', run: async () => order.push('normal') });
    queue.enqueue({ priority: 'critical', run: async () => order.push('critical') });
    await queue.drain();

    expect(order).toEqual(['critical', 'normal']);
  });

  it('keeps concurrent drain callers pending until their queued work runs', async () => {
    const order: string[] = [];
    const queue = createMaterializerQueue();
    let releaseFirst: (() => void) | null = null;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    queue.enqueue({
      priority: 'normal',
      async run() {
        order.push('first:start');
        await firstGate;
        order.push('first:end');
      }
    });

    const firstDrain = queue.drain();
    await Promise.resolve();

    queue.enqueue({
      priority: 'normal',
      async run() {
        order.push('second');
      }
    });

    let secondSettled = false;
    const secondDrain = queue.drain().then(() => {
      secondSettled = true;
    });
    await Promise.resolve();

    expect(secondSettled).toBe(false);
    expect(order).toEqual(['first:start']);

    releaseFirst?.();
    await Promise.all([firstDrain, secondDrain]);

    expect(secondSettled).toBe(true);
    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });
});
