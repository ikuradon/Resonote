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
    const fetchByReq = vi.fn(async () => [
      { id: 'missing', pubkey: 'p1', created_at: 1, kind: 1, tags: [], content: '', sig: 'sig' }
    ]);
    const gateway = createRelayGateway({
      requestNegentropySync: vi.fn(async () => ({
        capability: 'supported',
        messageHex: JSON.stringify({ remoteOnlyIds: ['missing'] })
      })),
      fetchByReq,
      listLocalRefs: vi.fn(async () => [])
    });

    const result = await gateway.verify([{ kinds: [1] }], { relayUrl: 'wss://relay.example' });

    expect(fetchByReq).toHaveBeenCalledWith([{ ids: ['missing'] }], {
      relayUrl: 'wss://relay.example'
    });
    expect(result).not.toHaveProperty('events');
    expect(result.candidates).toEqual([
      {
        relayUrl: 'wss://relay.example',
        event: {
          id: 'missing',
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
});
