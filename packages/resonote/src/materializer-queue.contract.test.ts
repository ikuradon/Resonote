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
});
