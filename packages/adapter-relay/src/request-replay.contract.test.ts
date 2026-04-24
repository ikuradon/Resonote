import type { RequestKey } from '@auftakt/core';
import { createRuntimeRequestKey, REPAIR_REQUEST_COALESCING_SCOPE } from '@auftakt/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRxBackwardReq, createRxForwardReq, createRxNostrSession } from './index.js';

type Listener = (event?: unknown) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  readonly sent: unknown[] = [];
  readonly listeners: Record<string, Listener[]> = { open: [], message: [], error: [], close: [] };
  readyState = FakeWebSocket.CONNECTING;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: 'open' | 'message' | 'error' | 'close', listener: Listener): void {
    this.listeners[type].push(listener);
  }

  send(payload: string): void {
    this.sent.push(JSON.parse(payload));
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close');
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open');
  }

  message(packet: unknown): void {
    this.emit('message', { data: JSON.stringify(packet) });
  }

  error(error: unknown = new Error('socket-error')): void {
    this.emit('error', error);
  }

  private emit(type: 'open' | 'message' | 'error' | 'close', event?: unknown): void {
    for (const listener of this.listeners[type]) {
      listener(event);
    }
  }
}

const RELAY_URL = 'wss://relay.contract.test';
const RELAY_B_URL = 'wss://relay-b.contract.test';

function latestSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error('socket was not created');
  return socket;
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('waitUntil timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('relay replay request identity contract', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: FakeWebSocket
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: originalWebSocket
    });
  });

  it('reconnect replays forward streams by logical requestKey', async () => {
    const session = createRxNostrSession({ defaultRelays: [RELAY_URL], eoseTimeout: 100 });
    const req = createRxForwardReq({ requestKey: 'rq:v1:contract-reconnect' as RequestKey });
    const received: string[] = [];

    const sub = session.use(req).subscribe({
      next: (packet) => {
        received.push(packet.event.id);
      }
    });

    req.emit({ kinds: [1], authors: ['pubkey-a'] });

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const firstSocket = latestSocket();
    firstSocket.open();
    await waitUntil(() => firstSocket.sent.length > 0);

    const firstReq = firstSocket.sent[0] as [string, string, Record<string, unknown>];
    expect(firstReq[0]).toBe('REQ');

    firstSocket.close();
    await waitUntil(() => FakeWebSocket.instances.length >= 2);

    const secondSocket = latestSocket();
    secondSocket.open();
    await waitUntil(() => secondSocket.sent.length > 0);

    const secondReq = secondSocket.sent[0] as [string, string, Record<string, unknown>];
    expect(secondReq[0]).toBe('REQ');
    expect(secondReq[1]).not.toBe(firstReq[1]);
    expect(secondReq[2]).toEqual({ authors: ['pubkey-a'], kinds: [1] });

    secondSocket.message([
      'EVENT',
      secondReq[1],
      {
        id: 'event-after-reconnect',
        pubkey: 'pubkey-a',
        content: 'ok',
        created_at: 1,
        tags: [],
        kind: 1
      }
    ]);

    await waitUntil(() => received.includes('event-after-reconnect'));

    sub.unsubscribe();
    session.dispose();
  });

  it('unsubscribe removes replay record and stops restoration', async () => {
    const session = createRxNostrSession({ defaultRelays: [RELAY_URL], eoseTimeout: 100 });
    const req = createRxForwardReq({ requestKey: 'rq:v1:contract-unsubscribe' as RequestKey });
    const sub = session.use(req).subscribe({});

    req.emit({ kinds: [1], authors: ['pubkey-a'] });

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length > 0);

    sub.unsubscribe();
    const socketsBeforeClose = FakeWebSocket.instances.length;
    socket.close();

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(FakeWebSocket.instances.length).toBe(socketsBeforeClose);

    session.dispose();
  });

  it('completes backward requests after relay EOSE closes the pending subscription', async () => {
    const session = createRxNostrSession({ defaultRelays: [RELAY_URL], eoseTimeout: 100 });
    const req = createRxBackwardReq({ requestKey: 'rq:v1:contract-backward-eose' as RequestKey });
    let completed = false;

    const sub = session.use(req).subscribe({
      complete: () => {
        completed = true;
      }
    });

    req.emit({ kinds: [1], authors: ['pubkey-a'] });
    req.over();

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length > 0);

    const [reqType, subId, filter] = socket.sent[0] as [string, string, Record<string, unknown>];
    expect(reqType).toBe('REQ');
    expect(filter).toEqual({ authors: ['pubkey-a'], kinds: [1] });

    socket.message(['EOSE', subId]);

    await waitUntil(() => completed);

    sub.unsubscribe();
    session.dispose();
  });

  it('surfaces relay OK acknowledgements for published events', async () => {
    const session = createRxNostrSession({ defaultRelays: [RELAY_URL], eoseTimeout: 100 });
    const packets: Array<{
      from: string;
      eventId: string;
      ok: boolean;
      notice?: string;
      done: boolean;
    }> = [];
    let completed = false;
    const event = {
      id: 'event-ok-ack',
      pubkey: 'pubkey-a',
      sig: 'sig-a',
      kind: 1,
      content: 'hello',
      created_at: 1,
      tags: []
    };

    const sub = session.send(event).subscribe({
      next: (packet) => {
        packets.push(packet);
      },
      complete: () => {
        completed = true;
      }
    });

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length > 0);

    expect(socket.sent[0]).toEqual(['EVENT', event]);

    socket.message(['OK', event.id, true, 'accepted']);

    await waitUntil(() => packets.length === 1 && completed);
    expect(packets[0]).toEqual({
      from: RELAY_URL,
      eventId: event.id,
      ok: true,
      notice: 'accepted',
      done: true
    });

    sub.unsubscribe();
    session.dispose();
  });

  it('typed runtime observation marks one relay success + one relay backoff as degraded relay', async () => {
    const session = createRxNostrSession({
      defaultRelays: [RELAY_URL, RELAY_B_URL],
      eoseTimeout: 100
    });
    const req = createRxForwardReq({ requestKey: 'rq:v1:contract-degraded-relay' as RequestKey });
    const statePackets: Array<{ from: string; state: string; aggregate: string }> = [];

    const stateSub = session.createConnectionStateObservable().subscribe((packet) => {
      statePackets.push({
        from: packet.from,
        state: packet.state,
        aggregate: packet.aggregate.state
      });
    });
    const sub = session.use(req).subscribe({});

    req.emit({ kinds: [1], authors: ['pubkey-a'] });

    await waitUntil(() => FakeWebSocket.instances.length >= 2);
    const socketA = FakeWebSocket.instances.find((socket) => socket.url === RELAY_URL);
    const socketB = FakeWebSocket.instances.find((socket) => socket.url === RELAY_B_URL);
    if (!socketA || !socketB) throw new Error('missing sockets for both relays');

    socketA.open();
    socketB.open();
    await waitUntil(() => socketA.sent.length > 0 && socketB.sent.length > 0);

    socketB.close();

    await waitUntil(() =>
      statePackets.some(
        (packet) =>
          packet.from === RELAY_B_URL && (packet.state === 'backoff' || packet.state === 'degraded')
      )
    );

    const statusA = session.getRelayStatus(RELAY_URL);
    expect(statusA?.connection).toBe('open');
    expect(
      statePackets.some(
        (packet) =>
          packet.from === RELAY_B_URL && packet.aggregate.match(/^(live|degraded|connecting)$/)
      )
    ).toBe(true);

    stateSub.unsubscribe();
    sub.unsubscribe();
    session.dispose();
  });

  it('aggregate session becomes degraded when all relays disconnect', async () => {
    const session = createRxNostrSession({ defaultRelays: [RELAY_URL], eoseTimeout: 100 });
    const req = createRxForwardReq({ requestKey: 'rq:v1:contract-all-disconnect' as RequestKey });
    const states: string[] = [];

    const stateSub = session.createConnectionStateObservable().subscribe((packet) => {
      states.push(packet.aggregate.state);
    });
    const sub = session.use(req).subscribe({});

    req.emit({ kinds: [1], authors: ['pubkey-a'] });

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length > 0);

    socket.close();

    await waitUntil(() => states.includes('degraded'));
    expect(states.includes('degraded')).toBe(true);

    stateSub.unsubscribe();
    sub.unsubscribe();
    session.dispose();
  });

  it('reconnect emits replaying -> live transition in typed observation', async () => {
    const session = createRxNostrSession({ defaultRelays: [RELAY_URL], eoseTimeout: 100 });
    const req = createRxForwardReq({
      requestKey: 'rq:v1:contract-replay-observation' as RequestKey
    });
    const states: Array<{ relay: string; state: string; aggregate: string; reason: string }> = [];

    const stateSub = session.createConnectionStateObservable().subscribe((packet) => {
      states.push({
        relay: packet.from,
        state: packet.state,
        aggregate: packet.aggregate.state,
        reason: packet.reason
      });
    });
    const sub = session.use(req).subscribe({});

    req.emit({ kinds: [1], authors: ['pubkey-a'] });

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const firstSocket = latestSocket();
    firstSocket.open();
    await waitUntil(() => firstSocket.sent.length > 0);

    firstSocket.close();
    await waitUntil(() => FakeWebSocket.instances.length >= 2);
    const secondSocket = latestSocket();
    secondSocket.open();
    await waitUntil(() => secondSocket.sent.length > 0);

    await waitUntil(() => states.some((entry) => entry.state === 'replaying'));
    await waitUntil(() =>
      states.some((entry) => entry.state === 'open' && entry.reason === 'replay-finished')
    );

    expect(states.some((entry) => entry.aggregate === 'replaying')).toBe(true);
    expect(states.some((entry) => entry.aggregate === 'live')).toBe(true);

    stateSub.unsubscribe();
    sub.unsubscribe();
    session.dispose();
  });

  it('coalesces equal logical forward requests into one outbound REQ', async () => {
    const leftFilter = {
      authors: ['pubkey-b', 'pubkey-a'],
      kinds: [1],
      '#e': ['event-b', 'event-a']
    };
    const rightFilter = {
      '#e': ['event-a', 'event-b'],
      kinds: [1],
      authors: ['pubkey-a', 'pubkey-b']
    };
    const session = createRxNostrSession({ defaultRelays: [RELAY_URL], eoseTimeout: 100 });
    const leftReq = createRxForwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'forward',
        scope: 'contract:coalesce:left',
        filters: [leftFilter]
      })
    });
    const rightReq = createRxForwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'forward',
        scope: 'contract:coalesce:right',
        filters: [rightFilter]
      })
    });

    const leftSub = session.use(leftReq).subscribe({});
    const rightSub = session.use(rightReq).subscribe({});

    leftReq.emit(leftFilter);
    rightReq.emit(rightFilter);

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length === 1);

    expect(socket.sent).toHaveLength(1);
    expect(socket.sent[0]).toEqual([
      'REQ',
      expect.stringMatching(/^auftakt-/),
      { '#e': ['event-a', 'event-b'], authors: ['pubkey-a', 'pubkey-b'], kinds: [1] }
    ]);

    leftSub.unsubscribe();
    rightSub.unsubscribe();
    session.dispose();
  });

  it('queues shards by relay capability instead of naive per-request fan-out', async () => {
    const filters = [
      { authors: ['pubkey-c'], kinds: [1] },
      { authors: ['pubkey-a'], kinds: [1] },
      { authors: ['pubkey-b'], kinds: [1] }
    ];
    const session = createRxNostrSession({
      defaultRelays: [RELAY_URL, RELAY_B_URL],
      eoseTimeout: 100,
      requestOptimizer: {
        defaultMaxFiltersPerRequest: 2,
        relayMaxFiltersPerRequest: {
          [RELAY_B_URL]: 1
        }
      }
    });
    const req = createRxForwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'forward',
        scope: 'contract:capability-aware',
        filters
      })
    });

    const sub = session.use(req).subscribe({});
    req.emit(filters);

    await waitUntil(() => FakeWebSocket.instances.length >= 2);
    const socketA = FakeWebSocket.instances.find((socket) => socket.url === RELAY_URL);
    const socketB = FakeWebSocket.instances.find((socket) => socket.url === RELAY_B_URL);
    if (!socketA || !socketB) throw new Error('missing sockets for both relays');

    socketA.open();
    socketB.open();
    await waitUntil(() => socketA.sent.length === 2 && socketB.sent.length === 3);

    expect(
      socketA.sent.map((packet) => (packet as [string, string, ...unknown[]]).slice(2))
    ).toEqual([
      [
        { authors: ['pubkey-a'], kinds: [1] },
        { authors: ['pubkey-b'], kinds: [1] }
      ],
      [{ authors: ['pubkey-c'], kinds: [1] }]
    ]);
    expect(
      socketB.sent.map((packet) => (packet as [string, string, ...unknown[]]).slice(2))
    ).toEqual([
      [{ authors: ['pubkey-a'], kinds: [1] }],
      [{ authors: ['pubkey-b'], kinds: [1] }],
      [{ authors: ['pubkey-c'], kinds: [1] }]
    ]);

    sub.unsubscribe();
    session.dispose();
  });

  it('reconnect replays relay-specific shard policy for capability-aware queueing', async () => {
    const filters = [
      { authors: ['pubkey-c'], kinds: [1] },
      { authors: ['pubkey-a'], kinds: [1] },
      { authors: ['pubkey-b'], kinds: [1] }
    ];
    const session = createRxNostrSession({
      defaultRelays: [RELAY_URL, RELAY_B_URL],
      eoseTimeout: 100,
      requestOptimizer: {
        defaultMaxFiltersPerRequest: 2,
        relayMaxFiltersPerRequest: {
          [RELAY_B_URL]: 1
        }
      }
    });
    const req = createRxForwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'forward',
        scope: 'contract:capability-aware-reconnect',
        filters
      })
    });

    const sub = session.use(req).subscribe({});
    req.emit(filters);

    await waitUntil(() => FakeWebSocket.instances.length >= 2);
    const socketA = FakeWebSocket.instances.find((socket) => socket.url === RELAY_URL);
    const socketB = FakeWebSocket.instances.find((socket) => socket.url === RELAY_B_URL);
    if (!socketA || !socketB) throw new Error('missing sockets for both relays');

    socketA.open();
    socketB.open();
    await waitUntil(() => socketA.sent.length === 2 && socketB.sent.length === 3);

    socketB.close();

    await waitUntil(
      () => FakeWebSocket.instances.filter((socket) => socket.url === RELAY_B_URL).length >= 2
    );
    const replaySocketB = FakeWebSocket.instances
      .filter((socket) => socket.url === RELAY_B_URL)
      .at(-1);
    if (!replaySocketB) throw new Error('missing replay socket for relay B');

    replaySocketB.open();
    await waitUntil(() => replaySocketB.sent.length === 3);

    expect(
      replaySocketB.sent.map((packet) => (packet as [string, string, ...unknown[]]).slice(2))
    ).toEqual([
      [{ authors: ['pubkey-a'], kinds: [1] }],
      [{ authors: ['pubkey-b'], kinds: [1] }],
      [{ authors: ['pubkey-c'], kinds: [1] }]
    ]);

    sub.unsubscribe();
    session.dispose();
  });

  it('reconnect replays one shared logical group without duplicate outbound REQs', async () => {
    const leftFilter = { authors: ['pubkey-a', 'pubkey-b'], kinds: [1] };
    const rightFilter = { kinds: [1], authors: ['pubkey-b', 'pubkey-a'] };
    const session = createRxNostrSession({ defaultRelays: [RELAY_URL], eoseTimeout: 100 });
    const leftReq = createRxForwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'forward',
        scope: 'contract:shared-replay:left',
        filters: [leftFilter]
      })
    });
    const rightReq = createRxForwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'forward',
        scope: 'contract:shared-replay:right',
        filters: [rightFilter]
      })
    });

    const leftSub = session.use(leftReq).subscribe({});
    const rightSub = session.use(rightReq).subscribe({});
    leftReq.emit(leftFilter);
    rightReq.emit(rightFilter);

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const firstSocket = latestSocket();
    firstSocket.open();
    await waitUntil(() => firstSocket.sent.length === 1);

    firstSocket.close();
    await waitUntil(() => FakeWebSocket.instances.length >= 2);
    const secondSocket = latestSocket();
    secondSocket.open();
    await waitUntil(() => secondSocket.sent.length === 1);

    expect(secondSocket.sent).toHaveLength(1);
    expect(secondSocket.sent[0]).toEqual([
      'REQ',
      expect.stringMatching(/^auftakt-/),
      { authors: ['pubkey-a', 'pubkey-b'], kinds: [1] }
    ]);

    leftSub.unsubscribe();
    rightSub.unsubscribe();
    session.dispose();
  });

  it('reconnect replays one shared logical group once per reconnect cycle', async () => {
    const leftFilter = { authors: ['pubkey-a', 'pubkey-b'], kinds: [1] };
    const rightFilter = { kinds: [1], authors: ['pubkey-b', 'pubkey-a'] };
    const session = createRxNostrSession({ defaultRelays: [RELAY_URL], eoseTimeout: 100 });
    const leftReq = createRxForwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'forward',
        scope: 'contract:shared-replay-cycle:left',
        filters: [leftFilter]
      })
    });
    const rightReq = createRxForwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'forward',
        scope: 'contract:shared-replay-cycle:right',
        filters: [rightFilter]
      })
    });

    const leftSub = session.use(leftReq).subscribe({});
    const rightSub = session.use(rightReq).subscribe({});
    leftReq.emit(leftFilter);
    rightReq.emit(rightFilter);

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const firstSocket = latestSocket();
    firstSocket.open();
    await waitUntil(() => firstSocket.sent.length === 1);

    firstSocket.close();
    await waitUntil(() => FakeWebSocket.instances.length >= 2);
    const secondSocket = latestSocket();
    secondSocket.open();
    await waitUntil(() => secondSocket.sent.length === 1);

    secondSocket.close();
    await waitUntil(() => FakeWebSocket.instances.length >= 3);
    const thirdSocket = latestSocket();
    thirdSocket.open();
    await waitUntil(() => thirdSocket.sent.length === 1);

    expect(firstSocket.sent).toHaveLength(1);
    expect(secondSocket.sent).toHaveLength(1);
    expect(thirdSocket.sent).toHaveLength(1);
    expect(thirdSocket.sent[0]).toEqual([
      'REQ',
      expect.stringMatching(/^auftakt-/),
      { authors: ['pubkey-a', 'pubkey-b'], kinds: [1] }
    ]);

    leftSub.unsubscribe();
    rightSub.unsubscribe();
    session.dispose();
  });

  it('does not coalesce repair traffic with app backward requests when filters match', async () => {
    const filter = { authors: ['pubkey-a'], kinds: [1] };
    const relaySelection = {
      on: {
        relays: [RELAY_URL],
        defaultReadRelays: false
      }
    };
    const session = createRxNostrSession({ defaultRelays: [RELAY_URL], eoseTimeout: 100 });
    const appReq = createRxBackwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'backward',
        scope: 'contract:repair-isolation:app',
        filters: [filter],
        overlay: {
          relays: [RELAY_URL],
          includeDefaultReadRelays: false
        }
      })
    });
    const repairReq = createRxBackwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'backward',
        scope: 'timeline:repair:negentropy',
        filters: [filter],
        overlay: {
          relays: [RELAY_URL],
          includeDefaultReadRelays: false
        }
      }),
      coalescingScope: REPAIR_REQUEST_COALESCING_SCOPE
    });

    const appSub = session.use(appReq, relaySelection).subscribe({});
    const repairSub = session.use(repairReq, relaySelection).subscribe({});
    appReq.emit(filter);
    repairReq.emit(filter);
    appReq.over();
    repairReq.over();

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length === 2);

    const [firstReq, secondReq] = socket.sent as Array<[string, string, Record<string, unknown>]>;
    expect(firstReq[0]).toBe('REQ');
    expect(secondReq[0]).toBe('REQ');
    expect(firstReq[1]).not.toBe(secondReq[1]);
    expect(firstReq[2]).toEqual({ authors: ['pubkey-a'], kinds: [1] });
    expect(secondReq[2]).toEqual({ authors: ['pubkey-a'], kinds: [1] });

    appSub.unsubscribe();
    repairSub.unsubscribe();
    session.dispose();
  });

  it('keeps shared transport active until the final logical consumer detaches', async () => {
    const leftFilter = { authors: ['pubkey-a', 'pubkey-b'], kinds: [1] };
    const rightFilter = { kinds: [1], authors: ['pubkey-b', 'pubkey-a'] };
    const session = createRxNostrSession({ defaultRelays: [RELAY_URL], eoseTimeout: 100 });
    const leftReq = createRxForwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'forward',
        scope: 'contract:shared-unshare:left',
        filters: [leftFilter]
      })
    });
    const rightReq = createRxForwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'forward',
        scope: 'contract:shared-unshare:right',
        filters: [rightFilter]
      })
    });

    const leftSub = session.use(leftReq).subscribe({});
    const rightSub = session.use(rightReq).subscribe({});
    leftReq.emit(leftFilter);
    rightReq.emit(rightFilter);

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length === 1);

    const [reqType, subId] = socket.sent[0] as [string, string, Record<string, unknown>];
    expect(reqType).toBe('REQ');

    leftSub.unsubscribe();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(socket.sent).toHaveLength(1);

    rightSub.unsubscribe();
    await waitUntil(() => socket.sent.length === 2);
    expect(socket.sent[1]).toEqual(['CLOSE', subId]);

    session.dispose();
  });

  it('dispose is represented as runtime-owned aggregate transition', async () => {
    const session = createRxNostrSession({ defaultRelays: [RELAY_URL], eoseTimeout: 100 });
    const req = createRxForwardReq({ requestKey: 'rq:v1:contract-disposed' as RequestKey });
    const sub = session.use(req).subscribe({});

    req.emit({ kinds: [1], authors: ['pubkey-a'] });

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    latestSocket().open();

    session.dispose();

    expect(session.getSessionObservation().state).toBe('disposed');
    expect(session.getSessionObservation().reason).toBe('disposed');

    sub.unsubscribe();
  });

  it('uses a dedicated negentropy subscription namespace and reports unsupported relays', async () => {
    const session = createRxNostrSession({ defaultRelays: [RELAY_URL], eoseTimeout: 100 });

    const pending = session.requestNegentropySync({
      relayUrl: RELAY_URL,
      filter: { kinds: [1], authors: ['pubkey-a'] },
      initialMessageHex: '6100000200',
      timeoutMs: 100
    });

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length > 0);

    const openPacket = socket.sent[0] as [string, string, Record<string, unknown>, string];
    expect(openPacket[0]).toBe('NEG-OPEN');
    expect(openPacket[1]).toMatch(/^neg-/);
    expect(openPacket[2]).toEqual({ authors: ['pubkey-a'], kinds: [1] });
    expect(openPacket[3]).toBe('6100000200');

    socket.message(['NEG-ERR', openPacket[1], 'unsupported: negentropy disabled']);

    await expect(pending).resolves.toEqual({
      capability: 'unsupported',
      reason: 'unsupported: negentropy disabled'
    });

    await waitUntil(() => socket.sent.length >= 2);
    expect(socket.sent.at(-1)).toEqual(['NEG-CLOSE', openPacket[1]]);

    session.dispose();
  });

  it('reports failed negentropy sync on timeout and closes the dedicated negentropy subscription', async () => {
    const session = createRxNostrSession({ defaultRelays: [RELAY_URL], eoseTimeout: 100 });

    const pending = session.requestNegentropySync({
      relayUrl: RELAY_URL,
      filter: { kinds: [1], authors: ['pubkey-a'] },
      initialMessageHex: '6100000200',
      timeoutMs: 20
    });

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length > 0);

    const openPacket = socket.sent[0] as [string, string, Record<string, unknown>, string];
    expect(openPacket[0]).toBe('NEG-OPEN');
    expect(openPacket[1]).toMatch(/^neg-/);

    await expect(pending).resolves.toEqual({
      capability: 'failed',
      reason: 'timeout'
    });

    await waitUntil(() => socket.sent.length >= 2);
    expect(socket.sent.at(-1)).toEqual(['NEG-CLOSE', openPacket[1]]);

    session.dispose();
  });

  it('rejects requests that omit canonical requestKey instead of inventing a legacy fallback', async () => {
    const session = createRxNostrSession({ defaultRelays: [RELAY_URL], eoseTimeout: 100 });
    const req = createRxForwardReq();

    await expect(
      new Promise<void>((resolve, reject) => {
        session.use(req).subscribe({
          next: () => resolve(),
          error: (error) => reject(error),
          complete: () => resolve()
        });
      })
    ).rejects.toThrow('Relay request is missing canonical requestKey for forward mode');

    session.dispose();
  });
});
