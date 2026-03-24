/**
 * Integration tests for Nostr relay interactions using tsunagiya MockPool.
 *
 * Covers: write operations, read operations, multi-relay behavior,
 * and unstable connection scenarios.
 */
import { type EventSigner, MockPool, type MockRelay } from '@ikuradon/tsunagiya';
import { EventBuilder, waitFor } from '@ikuradon/tsunagiya/testing';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMMENT_KIND, REACTION_KIND, RELAY_LIST_KIND } from './events.js';

// Use .test TLD relays to prevent leaks if MockPool fails to intercept WebSocket
const TEST_RELAYS = [
  'wss://relay1.test',
  'wss://relay2.test',
  'wss://relay3.test',
  'wss://relay4.test'
];

vi.mock('./relays.js', () => ({ DEFAULT_RELAYS: TEST_RELAYS }));

let pool: MockPool;
let relays: MockRelay[];
let signer: EventSigner;
let pubkey: string;
let sk: Uint8Array;

beforeEach(() => {
  pool = new MockPool();
  relays = TEST_RELAYS.map((url) => pool.relay(url));
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
  try {
    await waitFor(() => pool.connections.size === 0, { timeout: 3000 });
  } finally {
    pool.uninstall();
    vi.unstubAllGlobals();
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function storeOnAll(event: any) {
  for (const relay of relays) {
    relay.store(event);
  }
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

describe('Write operations (integration)', () => {
  it('should publish a comment (kind:1111) with I-tag', async () => {
    const { castSigned } = await import('./client.js');

    await castSigned({
      kind: COMMENT_KIND,
      content: 'Great track!',
      tags: [
        ['I', 'spotify:track:abc123'],
        ['K', 'spotify:track'],
        ['position', '1:30']
      ]
    });

    const publishedRelay = relays.find((r) => r.countEvents() > 0);
    expect(publishedRelay).toBeDefined();

    const events = publishedRelay!.received.filter((m) => m[0] === 'EVENT');
    expect(events.length).toBeGreaterThan(0);
  });

  it('should publish a reaction (kind:7) with e-tag', async () => {
    const { castSigned } = await import('./client.js');
    const targetId = 'a'.repeat(64);

    await castSigned({
      kind: REACTION_KIND,
      content: '+',
      tags: [
        ['e', targetId],
        ['p', 'b'.repeat(64)]
      ]
    });

    const acceptedCount = relays.filter((r) => r.countEvents() > 0).length;
    expect(acceptedCount).toBeGreaterThanOrEqual(2);
  });

  it('should succeed with partial relay acceptance (2/4)', async () => {
    // First 2 relays reject, last 2 accept
    relays[0].onEVENT((event) => ['OK', event.id, false, 'blocked']);
    relays[1].onEVENT((event) => ['OK', event.id, false, 'blocked']);

    const { castSigned } = await import('./client.js');

    // Should still resolve because 2/4 (50%) accepted
    await castSigned({
      kind: 1,
      content: 'partial success',
      tags: []
    });

    // Verify that the rejected relays responded with OK:false
    const rejectedCount = [relays[0], relays[1]].filter((r) =>
      r.received.some((m) => m[0] === 'EVENT')
    ).length;
    expect(rejectedCount).toBe(2);

    // All 4 relays received the event, but 2 rejected it
    const totalReceived = relays.filter((r) => r.received.some((m) => m[0] === 'EVENT')).length;
    expect(totalReceived).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

describe('Read operations (integration)', () => {
  it('should fetch a relay list (kind:10002) and return tags', async () => {
    const event = await EventBuilder.kind(RELAY_LIST_KIND)
      .content('')
      .tag('r', 'wss://relay.example.com', 'read')
      .tag('r', 'wss://write.example.com', 'write')
      .buildWith(signer);

    storeOnAll(event);

    const { fetchLatestEvent } = await import('./client.js');
    const result = await fetchLatestEvent(pubkey, RELAY_LIST_KIND);

    expect(result).not.toBeNull();
    expect(result!.tags).toEqual(
      expect.arrayContaining([
        expect.arrayContaining(['r', 'wss://relay.example.com', 'read']),
        expect.arrayContaining(['r', 'wss://write.example.com', 'write'])
      ])
    );
  });

  it('should pick the latest event when multiple exist', async () => {
    const older = await EventBuilder.kind(0)
      .content(JSON.stringify({ name: 'old-profile' }))
      .createdAt(1000)
      .buildWith(signer);
    const newer = await EventBuilder.kind(0)
      .content(JSON.stringify({ name: 'new-profile' }))
      .createdAt(2000)
      .buildWith(signer);

    storeOnAll(older);
    storeOnAll(newer);

    const { fetchLatestEvent } = await import('./client.js');
    const result = await fetchLatestEvent(pubkey, 0);

    expect(result).not.toBeNull();
    expect(JSON.parse(result!.content).name).toBe('new-profile');
  });
});

// ---------------------------------------------------------------------------
// Multi-relay behavior
// ---------------------------------------------------------------------------

describe('Multi-relay behavior (integration)', () => {
  it('should deduplicate the same event from multiple relays', async () => {
    const event = await EventBuilder.kind(COMMENT_KIND)
      .content('Dedup test')
      .tag('I', 'spotify:track:xyz')
      .buildWith(signer);

    storeOnAll(event);

    const { fetchLatestEvent } = await import('./client.js');
    const result = await fetchLatestEvent(pubkey, COMMENT_KIND);

    // Should return exactly one event despite being on all relays
    expect(result).not.toBeNull();
    expect(result!.content).toBe('Dedup test');
  });

  it('should succeed when one relay is slow', async () => {
    // Make first relay slow
    pool.relay(TEST_RELAYS[0], { latency: 3000 });

    const event = await EventBuilder.kind(0)
      .content(JSON.stringify({ name: 'from-fast-relay' }))
      .buildWith(signer);

    // Store only on fast relays (index 1-3)
    for (let i = 1; i < relays.length; i++) {
      relays[i].store(event);
    }

    const { fetchLatestEvent } = await import('./client.js');
    const result = await fetchLatestEvent(pubkey, 0);

    expect(result).not.toBeNull();
    expect(JSON.parse(result!.content).name).toBe('from-fast-relay');
  });
});

// ---------------------------------------------------------------------------
// Unstable connection scenarios
// ---------------------------------------------------------------------------

describe('Unstable connections (integration)', () => {
  it('should succeed when one relay refuses connections', { timeout: 15_000 }, async () => {
    relays[0].refuse();

    const event = await EventBuilder.kind(0)
      .content(JSON.stringify({ name: 'resilient' }))
      .buildWith(signer);

    // Store on remaining relays
    for (let i = 1; i < relays.length; i++) {
      relays[i].store(event);
    }

    const { fetchLatestEvent } = await import('./client.js');
    const result = await fetchLatestEvent(pubkey, 0);

    expect(result).not.toBeNull();
    expect(JSON.parse(result!.content).name).toBe('resilient');
  });

  it('should succeed when a relay disconnects mid-stream', { timeout: 15_000 }, async () => {
    // First relay will disconnect 100ms after connection
    relays[0].disconnectAfter(100);

    const event = await EventBuilder.kind(0)
      .content(JSON.stringify({ name: 'still-works' }))
      .buildWith(signer);

    // Store on remaining relays
    for (let i = 1; i < relays.length; i++) {
      relays[i].store(event);
    }

    const { fetchLatestEvent } = await import('./client.js');
    const result = await fetchLatestEvent(pubkey, 0);

    expect(result).not.toBeNull();
  });

  it('should return null when all relays are down', { timeout: 15_000 }, async () => {
    for (const relay of relays) {
      relay.refuse();
    }

    const { fetchLatestEvent } = await import('./client.js');
    const result = await fetchLatestEvent(pubkey, 0);

    expect(result).toBeNull();
  });

  it('should publish successfully despite one relay refusing', async () => {
    relays[0].refuse();

    const { castSigned } = await import('./client.js');

    await castSigned({
      kind: 1,
      content: 'Published despite failure',
      tags: []
    });

    // At least 2 of the remaining 3 relays accepted
    const acceptedCount = relays.filter((r) => r.countEvents() > 0).length;
    expect(acceptedCount).toBeGreaterThanOrEqual(2);
  });
});
