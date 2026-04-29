import { describe, expect, it } from 'vitest';

import {
  mergeTimelineEvents,
  paginateTimelineWindow,
  sortTimelineByCreatedAtDesc
} from './index.js';

describe('core timeline window helpers', () => {
  it('sorts, merges, and paginates events without runtime execution state', () => {
    const older = { id: 'b', pubkey: 'p', kind: 1, content: '', tags: [], created_at: 1, sig: 's' };
    const newer = { id: 'a', pubkey: 'p', kind: 1, content: '', tags: [], created_at: 2, sig: 's' };

    expect(sortTimelineByCreatedAtDesc([older, newer]).map((event) => event.id)).toEqual([
      'a',
      'b'
    ]);
    expect(mergeTimelineEvents([older], [older, newer]).map((event) => event.id)).toEqual([
      'a',
      'b'
    ]);
    expect(paginateTimelineWindow([older, newer], 1)).toEqual({ items: [newer], nextCursor: 2 });
  });
});
