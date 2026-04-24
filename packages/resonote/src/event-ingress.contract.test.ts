import { describe, expect, it, vi } from 'vitest';

import { ingestRelayEvent } from './event-ingress.js';

describe('ingestRelayEvent', () => {
  it('quarantines invalid relay events and does not materialize them', async () => {
    const materialize = vi.fn();
    const quarantine = vi.fn();

    const result = await ingestRelayEvent({
      relayUrl: 'wss://relay.example',
      event: { id: 'bad' },
      materialize,
      quarantine
    });

    expect(result).toEqual({ ok: false, reason: 'malformed' });
    expect(materialize).not.toHaveBeenCalled();
    expect(quarantine).toHaveBeenCalledWith({
      relayUrl: 'wss://relay.example',
      eventId: 'bad',
      reason: 'malformed',
      rawEvent: { id: 'bad' }
    });
  });

  it('returns false from materialization when validation fails', async () => {
    const materialized: unknown[] = [];
    const quarantined: unknown[] = [];

    const result = await ingestRelayEvent({
      relayUrl: 'wss://relay.example',
      event: { id: 'bad' },
      materialize: async (event) => {
        materialized.push(event);
        return true;
      },
      quarantine: (record) => {
        quarantined.push(record);
      }
    });

    expect(result.ok).toBe(false);
    expect(materialized).toEqual([]);
    expect(quarantined).toHaveLength(1);
  });
});
