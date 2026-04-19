import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchBackwardFirstMock } = vi.hoisted(() => ({
  fetchBackwardFirstMock: vi.fn()
}));

vi.mock('$shared/nostr/gateway.js', () => ({
  fetchBackwardFirst: fetchBackwardFirstMock
}));

import { fetchNostrEvent } from './fetch-event.js';

describe('fetchNostrEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the event provided by the relay', async () => {
    fetchBackwardFirstMock.mockResolvedValue({
      kind: 1111,
      tags: [['I', 'spotify:track:abc']],
      content: 'hello'
    });

    const result = await fetchNostrEvent('event-id-1', []);
    expect(result).toEqual({ kind: 1111, tags: [['I', 'spotify:track:abc']], content: 'hello' });
  });

  it('returns null when the relay provides no event before EOSE', async () => {
    fetchBackwardFirstMock.mockResolvedValue(null);
    await expect(fetchNostrEvent('event-id-2', [])).resolves.toBeNull();
  });

  it('passes temporary relay options when hints are provided', async () => {
    fetchBackwardFirstMock.mockResolvedValue(null);
    const hints = ['wss://relay.example.com', 'wss://relay2.example.com'];

    await fetchNostrEvent('event-id-4', hints);

    expect(fetchBackwardFirstMock).toHaveBeenCalledWith([{ ids: ['event-id-4'] }], {
      overlay: { relays: hints, includeDefaultReadRelays: true },
      timeoutMs: 10_000
    });
  });

  it('passes timeout-only options when relayHints is empty', async () => {
    fetchBackwardFirstMock.mockResolvedValue(null);
    await fetchNostrEvent('event-id-5', []);
    expect(fetchBackwardFirstMock).toHaveBeenCalledWith([{ ids: ['event-id-5'] }], {
      timeoutMs: 10_000
    });
  });

  it('emits the correct filter via gateway bridge', async () => {
    fetchBackwardFirstMock.mockResolvedValue(null);
    await fetchNostrEvent('my-event-id', []);
    expect(fetchBackwardFirstMock).toHaveBeenCalledWith([{ ids: ['my-event-id'] }], {
      timeoutMs: 10_000
    });
  });

  it('returns the partial event found before an upstream error when bridge resolves it', async () => {
    fetchBackwardFirstMock.mockResolvedValue({ kind: 1111, tags: [], content: 'partial' });
    await expect(fetchNostrEvent('event-id-6', [])).resolves.toEqual({
      kind: 1111,
      tags: [],
      content: 'partial'
    });
  });
});
