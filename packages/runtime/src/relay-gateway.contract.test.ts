import { describe, expect, it, vi } from 'vitest';

import { createRelayGateway } from './relay-gateway.js';

describe('RelayGateway verification planner', () => {
  it('wraps ordinary REQ fallback results as internal relay candidates', async () => {
    const reqFetch = vi.fn(async () => [
      { id: 'remote', pubkey: 'p1', created_at: 1, kind: 1, tags: [], content: '', sig: 'sig' }
    ]);
    const gateway = createRelayGateway({
      requestNegentropySync: vi.fn(async () => ({
        capability: 'unsupported',
        reason: 'relay-error'
      })),
      fetchByReq: reqFetch,
      listLocalRefs: vi.fn(async () => [])
    });

    const result = await gateway.verify([{ kinds: [1] }], { relayUrl: 'wss://relay.example' });

    expect(reqFetch).toHaveBeenCalledWith([{ kinds: [1] }], { relayUrl: 'wss://relay.example' });
    expect(result.strategy).toBe('fallback-req');
    expect(result).not.toHaveProperty('events');
    expect(result.candidates).toEqual([
      {
        relayUrl: 'wss://relay.example',
        event: {
          id: 'remote',
          pubkey: 'p1',
          created_at: 1,
          kind: 1,
          tags: [],
          content: '',
          sig: 'sig'
        }
      }
    ]);
  });

  it('wraps missing ids found by negentropy as internal relay candidates', async () => {
    const missingId = 'a'.repeat(64);
    const fetchByReq = vi.fn(async () => [
      { id: missingId, pubkey: 'p1', created_at: 1, kind: 1, tags: [], content: '', sig: 'sig' }
    ]);
    const gateway = createRelayGateway({
      requestNegentropySync: vi.fn(async () => ({
        capability: 'supported',
        messageHex: `6100000201${missingId}`
      })),
      fetchByReq,
      listLocalRefs: vi.fn(async () => [])
    });

    const result = await gateway.verify([{ kinds: [1] }], { relayUrl: 'wss://relay.example' });

    expect(fetchByReq).toHaveBeenCalledWith([{ ids: [missingId] }], {
      relayUrl: 'wss://relay.example'
    });
    expect(result).not.toHaveProperty('events');
    expect(result.candidates).toEqual([
      {
        relayUrl: 'wss://relay.example',
        event: {
          id: missingId,
          pubkey: 'p1',
          created_at: 1,
          kind: 1,
          tags: [],
          content: '',
          sig: 'sig'
        }
      }
    ]);
  });

  it('opens ordinary negentropy verification with a hex initial message', async () => {
    const requestNegentropySync = vi.fn(async () => ({
      capability: 'supported' as const,
      messageHex: '6100000200'
    }));
    const gateway = createRelayGateway({
      requestNegentropySync,
      fetchByReq: vi.fn(async () => []),
      listLocalRefs: vi.fn(async () => [])
    });

    await gateway.verify([{ kinds: [1] }], { relayUrl: 'wss://relay.example' });

    expect(requestNegentropySync).toHaveBeenCalledWith({
      relayUrl: 'wss://relay.example',
      filter: { kinds: [1] },
      initialMessageHex: '6100000200'
    });
  });

  it('falls back to REQ for multiple filters so later filters are not skipped', async () => {
    const secondFilterEvent = {
      id: 'second-filter-event',
      pubkey: 'p1',
      created_at: 2,
      kind: 1,
      tags: [['d', 'second']],
      content: '',
      sig: 'sig'
    };
    const requestNegentropySync = vi.fn(async () => ({
      capability: 'supported' as const,
      messageHex: JSON.stringify({ remoteOnlyIds: [] })
    }));
    const fetchByReq = vi.fn(async () => [secondFilterEvent]);
    const gateway = createRelayGateway({
      requestNegentropySync,
      fetchByReq,
      listLocalRefs: vi.fn(async () => [])
    });
    const filters = [
      { kinds: [1], '#d': ['first'] },
      { kinds: [1], '#d': ['second'] }
    ];

    const result = await gateway.verify(filters, { relayUrl: 'wss://relay.example' });

    expect(requestNegentropySync).not.toHaveBeenCalled();
    expect(fetchByReq).toHaveBeenCalledWith(filters, { relayUrl: 'wss://relay.example' });
    expect(result).toEqual({
      strategy: 'fallback-req',
      candidates: [{ event: secondFilterEvent, relayUrl: 'wss://relay.example' }]
    });
  });

  it('falls back to REQ when local negentropy refs cannot be listed', async () => {
    const event = { id: 'event-from-req', created_at: 123 };
    const requestNegentropySync = vi.fn(async () => ({
      capability: 'supported' as const,
      messageHex: JSON.stringify({ remoteOnlyIds: ['should-not-be-used'] })
    }));
    const fetchByReq = vi.fn(async () => [event]);

    const gateway = createRelayGateway({
      requestNegentropySync,
      fetchByReq,
      listLocalRefs: async () => {
        throw new Error('refs unavailable');
      }
    });

    const result = await gateway.verify([{ kinds: [1] }], { relayUrl: 'wss://relay.example/' });

    expect(result).toEqual({
      strategy: 'fallback-req',
      candidates: [{ event, relayUrl: 'wss://relay.example/' }]
    });
    expect(requestNegentropySync).not.toHaveBeenCalled();
    expect(fetchByReq).toHaveBeenCalledWith([{ kinds: [1] }], {
      relayUrl: 'wss://relay.example/'
    });
  });
});
