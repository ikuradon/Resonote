import { describe, expect, it } from 'vitest';

import { createHotEventIndex } from './hot-event-index.js';

describe('HotEventIndex', () => {
  it('indexes by id and tag value', () => {
    const index = createHotEventIndex();
    index.applyVisible({
      id: 'e1',
      pubkey: 'p1',
      created_at: 1,
      kind: 1,
      tags: [['e', 'parent']],
      content: ''
    });

    expect(index.getById('e1')).toMatchObject({ id: 'e1' });
    expect(index.getByTagValue('e:parent')).toEqual([expect.objectContaining({ id: 'e1' })]);
  });

  it('suppresses deleted id and pubkey pairs', () => {
    const index = createHotEventIndex();
    index.applyDeletionIndex('target', 'alice');
    index.applyVisible({
      id: 'target',
      pubkey: 'alice',
      created_at: 1,
      kind: 1,
      tags: [],
      content: ''
    });

    expect(index.getById('target')).toBeNull();
  });
});
