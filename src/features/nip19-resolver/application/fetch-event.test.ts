import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchNostrEventByIdMock } = vi.hoisted(() => ({
  fetchNostrEventByIdMock: vi.fn()
}));

vi.mock('$shared/auftakt/resonote.js', () => ({
  fetchNostrEventById: fetchNostrEventByIdMock
}));

import { fetchNostrEvent } from './fetch-event.js';

describe('fetchNostrEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the event provided by the relay', async () => {
    fetchNostrEventByIdMock.mockResolvedValue({
      kind: 1111,
      tags: [['I', 'spotify:track:abc']],
      content: 'hello'
    });

    const result = await fetchNostrEvent('event-id-1', []);
    expect(result).toEqual({ kind: 1111, tags: [['I', 'spotify:track:abc']], content: 'hello' });
  });

  it('returns null when the relay provides no event before EOSE', async () => {
    fetchNostrEventByIdMock.mockResolvedValue(null);
    await expect(fetchNostrEvent('event-id-2', [])).resolves.toBeNull();
  });

  it('passes temporary relay options when hints are provided', async () => {
    fetchNostrEventByIdMock.mockResolvedValue(null);
    const hints = ['wss://relay.example.com', 'wss://relay2.example.com'];

    await fetchNostrEvent('event-id-4', hints);

    expect(fetchNostrEventByIdMock).toHaveBeenCalledWith('event-id-4', hints);
  });

  it('passes timeout-only options when relayHints is empty', async () => {
    fetchNostrEventByIdMock.mockResolvedValue(null);
    await fetchNostrEvent('event-id-5', []);
    expect(fetchNostrEventByIdMock).toHaveBeenCalledWith('event-id-5', []);
  });

  it('emits the correct filter via gateway bridge', async () => {
    fetchNostrEventByIdMock.mockResolvedValue(null);
    await fetchNostrEvent('my-event-id', []);
    expect(fetchNostrEventByIdMock).toHaveBeenCalledWith('my-event-id', []);
  });

  it('returns the partial event found before an upstream error when bridge resolves it', async () => {
    fetchNostrEventByIdMock.mockResolvedValue({ kind: 1111, tags: [], content: 'partial' });
    await expect(fetchNostrEvent('event-id-6', [])).resolves.toEqual({
      kind: 1111,
      tags: [],
      content: 'partial'
    });
  });
});
