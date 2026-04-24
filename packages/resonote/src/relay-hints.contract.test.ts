import { describe, expect, it } from 'vitest';

import { createHotEventIndex } from './hot-event-index.js';

describe('hot relay hint index', () => {
  it('keeps hot relay hints by event id', () => {
    const index = createHotEventIndex();
    index.applyRelayHint({
      eventId: 'e1',
      relayUrl: 'wss://relay.example',
      source: 'seen',
      lastSeenAt: 1
    });

    expect(index.getRelayHints('e1')).toEqual([
      { eventId: 'e1', relayUrl: 'wss://relay.example', source: 'seen', lastSeenAt: 1 }
    ]);
  });
});
