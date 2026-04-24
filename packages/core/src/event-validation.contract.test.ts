import { describe, expect, it } from 'vitest';

import { finalizeEvent } from './crypto.js';
import { validateRelayEvent } from './event-validation.js';

describe('validateRelayEvent', () => {
  it('accepts a finalized event', async () => {
    const secret = new Uint8Array(32);
    secret[31] = 1;
    const event = finalizeEvent({ kind: 1, created_at: 1, tags: [], content: 'hello' }, secret);

    await expect(validateRelayEvent(event)).resolves.toEqual({ ok: true, event });
  });

  it('rejects an event with a mismatched id', async () => {
    const secret = new Uint8Array(32);
    secret[31] = 1;
    const event = finalizeEvent({ kind: 1, created_at: 1, tags: [], content: 'hello' }, secret);

    await expect(validateRelayEvent({ ...event, id: '0'.repeat(64) })).resolves.toEqual({
      ok: false,
      reason: 'invalid-id'
    });
  });

  it('rejects malformed relay input', async () => {
    await expect(validateRelayEvent({ id: 'x' })).resolves.toEqual({
      ok: false,
      reason: 'malformed'
    });
  });
});
