import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockPool, type MockRelay, type EventSigner } from '@ikuradon/tsunagiya';
import { EventBuilder } from '@ikuradon/tsunagiya/testing';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { DEFAULT_RELAYS } from './relays.js';

let pool: MockPool;
let relays: MockRelay[];
let signer: EventSigner;
let pubkey: string;
let sk: Uint8Array;

beforeEach(() => {
  pool = new MockPool();
  relays = DEFAULT_RELAYS.map((url) => pool.relay(url));
  pool.install();

  sk = generateSecretKey();
  pubkey = getPublicKey(sk);
  signer = {
    getPublicKey: () => pubkey,
    signEvent: (ev) => {
      const signed = finalizeEvent(ev, sk);
      return { id: signed.id, sig: signed.sig };
    }
  };

  // Mock window.nostr for castSigned (NIP-07)
  vi.stubGlobal('window', {
    ...globalThis.window,
    nostr: {
      getPublicKey: async () => pubkey,
      signEvent: async (event: {
        kind: number;
        content: string;
        tags: string[][];
        created_at: number;
      }) => finalizeEvent(event, sk)
    }
  });
});

afterEach(async () => {
  const { disposeRxNostr } = await import('./client.js');
  disposeRxNostr();
  pool.uninstall();
  vi.unstubAllGlobals();
});

function storeOnAll(event: ReturnType<EventBuilder['build']>) {
  for (const relay of relays) {
    relay.store(event);
  }
}

describe('fetchLatestEvent (integration with tsunagiya)', () => {
  it('should return the latest event matching kind and author', async () => {
    const older = await EventBuilder.kind(0)
      .content(JSON.stringify({ name: 'old' }))
      .createdAt(1000)
      .buildWith(signer);
    const newer = await EventBuilder.kind(0)
      .content(JSON.stringify({ name: 'new' }))
      .createdAt(2000)
      .buildWith(signer);

    storeOnAll(older);
    storeOnAll(newer);

    const { fetchLatestEvent } = await import('./client.js');
    const result = await fetchLatestEvent(pubkey, 0);

    expect(result).not.toBeNull();
    expect(result!.content).toBe(JSON.stringify({ name: 'new' }));
    expect(result!.created_at).toBe(2000);
  });

  it('should return null when no events match', async () => {
    const { fetchLatestEvent } = await import('./client.js');
    const result = await fetchLatestEvent(pubkey, 0);

    expect(result).toBeNull();
  });

  it('should return event tags', async () => {
    const event = await EventBuilder.kind(3)
      .content('')
      .tag('p', 'd'.repeat(64))
      .tag('p', 'e'.repeat(64))
      .buildWith(signer);

    storeOnAll(event);

    const { fetchLatestEvent } = await import('./client.js');
    const result = await fetchLatestEvent(pubkey, 3);

    expect(result).not.toBeNull();
    expect(result!.tags).toEqual(
      expect.arrayContaining([
        expect.arrayContaining(['p', 'd'.repeat(64)]),
        expect.arrayContaining(['p', 'e'.repeat(64)])
      ])
    );
  });
});

describe('castSigned (integration with tsunagiya)', () => {
  it('should publish a signed event to relays', async () => {
    const { castSigned } = await import('./client.js');

    await castSigned({
      kind: 1,
      content: 'Hello from test',
      tags: []
    });

    // Verify event was received by at least one relay
    const hasEvent = relays.some((relay) => relay.countEvents() > 0);
    expect(hasEvent).toBe(true);
  });

  it('should reject when all relays reject', async () => {
    for (const relay of relays) {
      relay.onEVENT((event) => ['OK', event.id, false, 'blocked']);
    }

    const { castSigned } = await import('./client.js');

    await expect(
      castSigned({
        kind: 1,
        content: 'Should fail',
        tags: []
      })
    ).rejects.toThrow('All relays rejected');
  });
});
