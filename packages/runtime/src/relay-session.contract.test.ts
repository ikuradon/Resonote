import type { EventSigner, RequestKey, SignedEventShape, UnsignedEvent } from '@auftakt/core';
import { createRuntimeRequestKey } from '@auftakt/core';
import { REPAIR_REQUEST_COALESCING_SCOPE } from '@auftakt/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBackwardReq, createForwardReq, createRelaySession, nip07Signer } from './index.js';

type Listener = (event?: unknown) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  readonly sent: unknown[] = [];
  readonly listeners: Record<string, Listener[]> = {
    open: [],
    message: [],
    error: [],
    close: []
  };
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
const TEMP_RELAY_URL = 'wss://relay-temp.contract.test';

function createContractSigner(pubkey = 'pubkey-a'): EventSigner {
  let next = 0;
  return {
    getPublicKey: () => pubkey,
    signEvent: (event: UnsignedEvent): SignedEventShape => {
      next += 1;
      return {
        ...event,
        pubkey,
        id: `signed-event-${next}`,
        sig: `signed-sig-${next}`
      };
    }
  };
}

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
    vi.useRealTimers();
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: originalWebSocket
    });
  });

  it('reconnect replays forward streams by logical requestKey', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const req = createForwardReq({
      requestKey: 'rq:v1:contract-reconnect' as RequestKey
    });
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

  it('queues REQ commands while relay is reconnecting and flushes after open', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const req = createBackwardReq({
      requestKey: 'rq:v1:contract-queued-req' as RequestKey
    });
    const sub = session.use(req).subscribe({});

    req.emit({ kinds: [1] });
    req.over();

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    expect(socket.sent).toEqual([]);

    socket.open();
    await waitUntil(() => socket.sent.length > 0);
    expect(socket.sent[0]).toEqual(expect.arrayContaining(['REQ']));

    sub.unsubscribe();
    session.dispose();
  });

  it('unsubscribe removes replay record and stops restoration', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const req = createForwardReq({
      requestKey: 'rq:v1:contract-unsubscribe' as RequestKey
    });
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
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const req = createBackwardReq({
      requestKey: 'rq:v1:contract-backward-eose' as RequestKey
    });
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
    expect(socket.sent[1]).toEqual(['CLOSE', subId]);

    sub.unsubscribe();
    session.dispose();
  });

  it('surfaces relay OK acknowledgements for published events', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
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

  it('binds NIP-07 provider methods to window.nostr', async () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    const provider = {
      pubkey: 'provider-bound-pubkey',
      async getPublicKey(this: { pubkey: string }) {
        return this.pubkey;
      },
      async signEvent(this: { pubkey: string }, event: UnsignedEvent) {
        return {
          ...event,
          pubkey: this.pubkey,
          id: 'provider-bound-event',
          sig: 'provider-bound-sig'
        };
      }
    };

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: { nostr: provider }
    });

    try {
      const signer = nip07Signer();

      await expect(signer.getPublicKey()).resolves.toBe('provider-bound-pubkey');
      await expect(
        signer.signEvent({
          kind: 1,
          content: 'hello',
          created_at: 1,
          tags: []
        })
      ).resolves.toMatchObject({
        pubkey: 'provider-bound-pubkey',
        id: 'provider-bound-event',
        sig: 'provider-bound-sig'
      });
    } finally {
      if (originalWindow === undefined) {
        Reflect.deleteProperty(globalThis, 'window');
      } else {
        Object.defineProperty(globalThis, 'window', {
          configurable: true,
          writable: true,
          value: originalWindow
        });
      }
    }
  });

  it('drops a queued EVENT when its initial relay connection fails', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const failedEvent = {
      id: 'event-connect-failed',
      pubkey: 'pubkey-a',
      sig: 'sig-a',
      kind: 1,
      content: 'failed publish',
      created_at: 1,
      tags: []
    };
    const retriedEvent = {
      id: 'event-after-reconnect',
      pubkey: 'pubkey-a',
      sig: 'sig-b',
      kind: 1,
      content: 'fresh publish',
      created_at: 2,
      tags: []
    };
    const failedPackets: Array<{ ok: boolean; done: boolean }> = [];
    let failedCompleted = false;

    const failedSub = session.send(failedEvent).subscribe({
      next: (packet) => failedPackets.push(packet),
      complete: () => {
        failedCompleted = true;
      }
    });

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const failedSocket = latestSocket();
    failedSocket.error(new Error('connect failed'));

    await waitUntil(() => failedPackets.length === 1 && failedCompleted);
    expect(failedPackets[0]).toMatchObject({ ok: false, done: true });

    const freshSub = session.send(retriedEvent).subscribe({});

    await waitUntil(() => FakeWebSocket.instances.length >= 2);
    const freshSocket = latestSocket();
    freshSocket.open();
    await waitUntil(() => freshSocket.sent.length > 0);

    expect(freshSocket.sent).toEqual([['EVENT', retriedEvent]]);

    failedSub.unsubscribe();
    freshSub.unsubscribe();
    session.dispose();
  });

  it('answers NIP-42 AUTH challenges and retries auth-required EVENT writes', async () => {
    const signer = createContractSigner('pubkey-auth');
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const packets: Array<{
      from: string;
      eventId: string;
      ok: boolean;
      notice?: string;
      done: boolean;
    }> = [];
    let completed = false;

    const sub = session
      .send(
        {
          kind: 1,
          content: 'hello auth',
          created_at: 1,
          tags: []
        },
        { signer }
      )
      .subscribe({
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
    await waitUntil(() => socket.sent.length === 1);

    const firstEventPacket = socket.sent[0] as ['EVENT', SignedEventShape];
    expect(firstEventPacket[0]).toBe('EVENT');
    socket.message(['AUTH', 'challenge-event']);
    socket.message([
      'OK',
      firstEventPacket[1].id,
      false,
      'auth-required: authenticate before publishing'
    ]);

    await waitUntil(() => socket.sent.length === 2);
    const authPacket = socket.sent[1] as ['AUTH', SignedEventShape];
    expect(authPacket).toEqual([
      'AUTH',
      expect.objectContaining({
        kind: 22242,
        pubkey: 'pubkey-auth',
        content: '',
        tags: [
          ['relay', RELAY_URL],
          ['challenge', 'challenge-event']
        ]
      })
    ]);

    socket.message(['OK', authPacket[1].id, true, '']);
    await waitUntil(() => socket.sent.length === 3);
    expect(socket.sent[2]).toEqual(firstEventPacket);

    socket.message(['OK', firstEventPacket[1].id, true, 'accepted']);
    await waitUntil(() => completed);
    expect(packets).toEqual([
      {
        from: RELAY_URL,
        eventId: firstEventPacket[1].id,
        ok: true,
        notice: 'accepted',
        done: true
      }
    ]);

    sub.unsubscribe();
    session.dispose();
  });

  it('authenticates before publishing NIP-70 protected events when a challenge is known', async () => {
    const signer = createContractSigner('pubkey-protected');
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const req = createForwardReq({
      requestKey: 'rq:v1:contract-protected-auth-bootstrap' as RequestKey
    });
    const readSub = session.use(req, { signer }).subscribe({});

    req.emit({ kinds: [1] });
    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length === 1);
    socket.message(['AUTH', 'challenge-protected']);

    const writeSub = session
      .send(
        {
          kind: 1,
          content: 'protected',
          created_at: 2,
          tags: [['-']]
        },
        { signer }
      )
      .subscribe({});

    await waitUntil(() => socket.sent.length === 2);
    const authPacket = socket.sent[1] as ['AUTH', SignedEventShape];
    expect(authPacket[0]).toBe('AUTH');
    expect(authPacket[1]).toMatchObject({
      kind: 22242,
      pubkey: 'pubkey-protected',
      tags: [
        ['relay', RELAY_URL],
        ['challenge', 'challenge-protected']
      ]
    });
    socket.message(['OK', authPacket[1].id, true, '']);

    await waitUntil(() => socket.sent.length === 3);
    expect(socket.sent[2]).toEqual([
      'EVENT',
      expect.objectContaining({
        pubkey: 'pubkey-protected',
        content: 'protected',
        tags: [['-']]
      })
    ]);

    writeSub.unsubscribe();
    readSub.unsubscribe();
    session.dispose();
  });

  it('answers NIP-42 AUTH challenges and retries auth-required REQ shards', async () => {
    const signer = createContractSigner('pubkey-reader');
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const req = createBackwardReq({
      requestKey: 'rq:v1:contract-auth-required-req' as RequestKey
    });
    const received: string[] = [];
    let completed = false;

    const sub = session.use(req, { signer }).subscribe({
      next: (packet) => {
        received.push(packet.event.id);
      },
      complete: () => {
        completed = true;
      }
    });

    req.emit({ kinds: [4] });
    req.over();

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length === 1);

    const firstReq = socket.sent[0] as ['REQ', string, Record<string, unknown>];
    socket.message(['AUTH', 'challenge-req']);
    socket.message(['CLOSED', firstReq[1], 'auth-required: authenticate before reading']);

    await waitUntil(() => socket.sent.length === 2);
    const authPacket = socket.sent[1] as ['AUTH', SignedEventShape];
    expect(authPacket[1]).toMatchObject({
      kind: 22242,
      pubkey: 'pubkey-reader',
      tags: [
        ['relay', RELAY_URL],
        ['challenge', 'challenge-req']
      ]
    });
    socket.message(['OK', authPacket[1].id, true, '']);

    await waitUntil(() => socket.sent.length === 3);
    const retriedReq = socket.sent[2] as ['REQ', string, Record<string, unknown>];
    expect(retriedReq[0]).toBe('REQ');
    expect(retriedReq[1]).not.toBe(firstReq[1]);
    expect(retriedReq[2]).toEqual({ kinds: [4] });

    socket.message([
      'EVENT',
      retriedReq[1],
      {
        id: 'auth-visible-event',
        pubkey: 'pubkey-a',
        content: 'dm',
        created_at: 1,
        tags: [],
        kind: 4
      }
    ]);
    socket.message(['EOSE', retriedReq[1]]);

    await waitUntil(() => completed);
    expect(received).toEqual(['auth-visible-event']);

    sub.unsubscribe();
    session.dispose();
  });

  it('typed runtime observation marks one relay success + one relay backoff as degraded relay', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL, RELAY_B_URL],
      eoseTimeout: 100
    });
    const req = createForwardReq({
      requestKey: 'rq:v1:contract-degraded-relay' as RequestKey
    });
    const statePackets: Array<{ from: string; state: string; aggregate: string }> = [];

    const stateSub = session.createConnectionStateObservable().subscribe({
      next: (packet) => {
        statePackets.push({
          from: packet.from,
          state: packet.state,
          aggregate: packet.aggregate.state
        });
      }
    });
    const sub = session.use(req).subscribe({});

    req.emit({ kinds: [1], authors: ['pubkey-a'] });

    await waitUntil(() => FakeWebSocket.instances.length >= 2);
    const socketA = FakeWebSocket.instances.find((socket) => socket.url === RELAY_URL);
    const socketB = FakeWebSocket.instances.find((socket) => socket.url === RELAY_B_URL);
    if (!socketA || !socketB) {
      throw new Error('missing sockets for both relays');
    }

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
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const req = createForwardReq({
      requestKey: 'rq:v1:contract-all-disconnect' as RequestKey
    });
    const states: string[] = [];

    const stateSub = session.createConnectionStateObservable().subscribe({
      next: (packet) => {
        states.push(packet.aggregate.state);
      }
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

  it('keeps default relays open after backward request completion', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100,
      relayLifecycle: {
        idleDisconnectMs: 10,
        retry: { strategy: 'off' }
      }
    });
    const req = createBackwardReq({
      requestKey: 'rq:v1:contract-default-lazy-keep' as RequestKey
    });
    let completed = false;

    const sub = session.use(req).subscribe({
      complete: () => {
        completed = true;
      }
    });

    req.emit({ kinds: [1] });
    req.over();

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length > 0);

    const [, subId] = socket.sent[0] as [string, string, Record<string, unknown>];
    socket.message(['EOSE', subId]);
    await waitUntil(() => completed);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(socket.readyState).toBe(FakeWebSocket.OPEN);
    expect(session.getRelayStatus(RELAY_URL)?.connection).toBe('open');

    sub.unsubscribe();
    session.dispose();
  });

  it('deduplicates normalized relay selections against default relays', async () => {
    const normalizedRelayUrl = `${RELAY_URL}/`;
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const req = createBackwardReq({
      requestKey: 'rq:v1:contract-default-normalized-dedupe' as RequestKey
    });

    const sub = session
      .use(req, {
        on: {
          relays: [normalizedRelayUrl]
        }
      })
      .subscribe({});
    req.emit({ kinds: [1] });
    req.over();

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(FakeWebSocket.instances.map((socket) => socket.url)).toEqual([RELAY_URL]);

    sub.unsubscribe();
    session.dispose();
  });

  it('keeps normalized default relay selections open after backward request completion', async () => {
    const normalizedRelayUrl = `${RELAY_URL}/`;
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100,
      relayLifecycle: {
        idleDisconnectMs: 10,
        retry: { strategy: 'off' }
      }
    });
    const req = createBackwardReq({
      requestKey: 'rq:v1:contract-default-normalized-lazy-keep' as RequestKey
    });
    let completed = false;

    const sub = session
      .use(req, {
        on: {
          defaultReadRelays: false,
          relays: [normalizedRelayUrl]
        }
      })
      .subscribe({
        complete: () => {
          completed = true;
        }
      });

    req.emit({ kinds: [1] });
    req.over();

    await waitUntil(() =>
      FakeWebSocket.instances.some((socket) => socket.url === normalizedRelayUrl)
    );
    const socket = FakeWebSocket.instances.find((entry) => entry.url === normalizedRelayUrl);
    if (!socket) throw new Error('normalized default socket was not created');
    socket.open();
    await waitUntil(() => socket.sent.length > 0);

    const [, subId] = socket.sent[0] as [string, string, Record<string, unknown>];
    socket.message(['EOSE', subId]);
    await waitUntil(() => completed);
    expect(socket.sent[1]).toEqual(['CLOSE', subId]);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(socket.readyState).toBe(FakeWebSocket.OPEN);
    expect(session.getRelayStatus(normalizedRelayUrl)?.connection).toBe('open');

    sub.unsubscribe();
    session.dispose();
  });

  it('idle-disconnects temporary relays after backward request completion', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100,
      relayLifecycle: {
        idleDisconnectMs: 10,
        retry: { strategy: 'off' }
      }
    });
    const req = createBackwardReq({
      requestKey: 'rq:v1:contract-temporary-idle' as RequestKey
    });
    const states: Array<{ from: string; state: string; reason: string }> = [];
    let completed = false;

    const stateSub = session.createConnectionStateObservable().subscribe({
      next: (packet) => {
        states.push({ from: packet.from, state: packet.state, reason: packet.reason });
      }
    });
    const sub = session
      .use(req, {
        on: {
          defaultReadRelays: false,
          relays: [TEMP_RELAY_URL]
        }
      })
      .subscribe({
        complete: () => {
          completed = true;
        }
      });

    req.emit({ kinds: [1] });
    req.over();

    await waitUntil(() => FakeWebSocket.instances.some((socket) => socket.url === TEMP_RELAY_URL));
    const socket = FakeWebSocket.instances.find((entry) => entry.url === TEMP_RELAY_URL);
    if (!socket) throw new Error('temporary socket was not created');
    socket.open();
    await waitUntil(() => socket.sent.length > 0);

    const [, subId] = socket.sent[0] as [string, string, Record<string, unknown>];
    socket.message(['EOSE', subId]);
    await waitUntil(() => completed);
    await waitUntil(() => session.getRelayStatus(TEMP_RELAY_URL)?.reason === 'idle-timeout');

    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    expect(session.getRelayStatus(TEMP_RELAY_URL)).toMatchObject({
      connection: 'idle',
      reason: 'idle-timeout'
    });
    expect(states).toContainEqual({
      from: TEMP_RELAY_URL,
      state: 'idle',
      reason: 'idle-timeout'
    });

    stateSub.unsubscribe();
    sub.unsubscribe();
    session.dispose();
  });

  it('reconnects forward streams only after configured backoff delay', async () => {
    vi.useFakeTimers();
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100,
      relayLifecycle: {
        retry: {
          strategy: 'exponential',
          initialDelayMs: 50,
          maxDelayMs: 100,
          maxAttempts: 2
        }
      }
    });
    const req = createForwardReq({
      requestKey: 'rq:v1:contract-delayed-reconnect' as RequestKey
    });
    const states: Array<{ state: string; reason: string }> = [];

    const stateSub = session.createConnectionStateObservable().subscribe({
      next: (packet) => {
        if (packet.from === RELAY_URL) states.push({ state: packet.state, reason: packet.reason });
      }
    });
    const sub = session.use(req).subscribe({});

    req.emit({ kinds: [1], authors: ['pubkey-a'] });

    await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBe(1));
    const firstSocket = latestSocket();
    firstSocket.open();
    await vi.waitFor(() => expect(firstSocket.sent.length).toBeGreaterThan(0));

    firstSocket.close();
    expect(states).toContainEqual({ state: 'backoff', reason: 'reconnect-scheduled' });
    await vi.advanceTimersByTimeAsync(49);
    expect(FakeWebSocket.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBe(2));
    const secondSocket = latestSocket();
    secondSocket.open();
    await vi.waitFor(() => expect(secondSocket.sent.length).toBeGreaterThan(0));

    expect(secondSocket.sent[0]).toEqual([
      'REQ',
      expect.stringMatching(/^auftakt-/),
      { authors: ['pubkey-a'], kinds: [1] }
    ]);

    stateSub.unsubscribe();
    sub.unsubscribe();
    session.dispose();
  });

  it('does not reconnect when retry strategy is off', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100,
      relayLifecycle: {
        retry: { strategy: 'off' }
      }
    });
    const req = createForwardReq({
      requestKey: 'rq:v1:contract-retry-off' as RequestKey
    });
    const sub = session.use(req).subscribe({});

    req.emit({ kinds: [1] });

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const firstSocket = latestSocket();
    firstSocket.open();
    await waitUntil(() => firstSocket.sent.length > 0);

    firstSocket.close();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(session.getRelayStatus(RELAY_URL)).toMatchObject({
      connection: 'degraded',
      reason: 'retry-exhausted'
    });

    sub.unsubscribe();
    session.dispose();
  });

  it('reconnect emits replaying -> live transition in typed observation', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const req = createForwardReq({
      requestKey: 'rq:v1:contract-replay-observation' as RequestKey
    });
    const states: Array<{ relay: string; state: string; aggregate: string; reason: string }> = [];

    const stateSub = session.createConnectionStateObservable().subscribe({
      next: (packet) => {
        states.push({
          relay: packet.from,
          state: packet.state,
          aggregate: packet.aggregate.state,
          reason: packet.reason
        });
      }
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
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const leftReq = createForwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'forward',
        scope: 'contract:coalesce:left',
        filters: [leftFilter]
      })
    });
    const rightReq = createForwardReq({
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
      {
        '#e': ['event-a', 'event-b'],
        authors: ['pubkey-a', 'pubkey-b'],
        kinds: [1]
      }
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
    const session = createRelaySession({
      defaultRelays: [RELAY_URL, RELAY_B_URL],
      eoseTimeout: 100,
      requestOptimizer: {
        defaultMaxFiltersPerRequest: 2,
        relayMaxFiltersPerRequest: {
          [RELAY_B_URL]: 1
        }
      }
    });
    const req = createForwardReq({
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
    if (!socketA || !socketB) {
      throw new Error('missing sockets for both relays');
    }

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

  it('adapts queued shards when a relay learns max_filters from CLOSED', async () => {
    const filters = [{ ids: ['a'] }, { ids: ['b'] }, { ids: ['c'] }];
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100,
      requestOptimizer: {
        defaultMaxFiltersPerRequest: 2
      }
    });
    const req = createBackwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'backward',
        scope: 'contract:adaptive-max-filters',
        filters
      })
    });

    const sub = session.use(req).subscribe({});
    req.emit(filters);
    req.over();

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length === 1);

    expect((socket.sent[0] as [string, string, ...unknown[]]).slice(2)).toEqual([
      { ids: ['a'] },
      { ids: ['b'] }
    ]);

    const failedSubId = (socket.sent[0] as [string, string, ...unknown[]])[1];
    socket.message(['CLOSED', failedSubId, 'too many filters: max 1']);

    await waitUntil(() => socket.sent.length === 4);
    expect(
      socket.sent.slice(1).map((packet) => (packet as [string, string, ...unknown[]]).slice(2))
    ).toEqual([[{ ids: ['a'] }], [{ ids: ['b'] }], [{ ids: ['c'] }]]);
    expect(session.getRelayCapabilitySnapshot(RELAY_URL)).toMatchObject({
      maxFilters: 1,
      source: 'learned'
    });

    sub.unsubscribe();
    session.dispose();
  });

  it('reconnect replays relay-specific shard policy for capability-aware queueing', async () => {
    const filters = [
      { authors: ['pubkey-c'], kinds: [1] },
      { authors: ['pubkey-a'], kinds: [1] },
      { authors: ['pubkey-b'], kinds: [1] }
    ];
    const session = createRelaySession({
      defaultRelays: [RELAY_URL, RELAY_B_URL],
      eoseTimeout: 100,
      requestOptimizer: {
        defaultMaxFiltersPerRequest: 2,
        relayMaxFiltersPerRequest: {
          [RELAY_B_URL]: 1
        }
      }
    });
    const req = createForwardReq({
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
    if (!socketA || !socketB) {
      throw new Error('missing sockets for both relays');
    }

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
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const leftReq = createForwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'forward',
        scope: 'contract:shared-replay:left',
        filters: [leftFilter]
      })
    });
    const rightReq = createForwardReq({
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
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const leftReq = createForwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'forward',
        scope: 'contract:shared-replay-cycle:left',
        filters: [leftFilter]
      })
    });
    const rightReq = createForwardReq({
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
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const appReq = createBackwardReq({
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
    const repairReq = createBackwardReq({
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
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const leftReq = createForwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'forward',
        scope: 'contract:shared-unshare:left',
        filters: [leftFilter]
      })
    });
    const rightReq = createForwardReq({
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
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const req = createForwardReq({
      requestKey: 'rq:v1:contract-disposed' as RequestKey
    });
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
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });

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
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });

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

  it('sends NIP-45 COUNT requests and resolves count responses', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const hll = '00'.repeat(256);

    const pending = session.requestCount({
      relayUrl: RELAY_URL,
      filters: [{ kinds: [7], '#e': ['target-event'] }],
      timeoutMs: 100
    });

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length > 0);

    const countPacket = socket.sent[0] as [string, string, Record<string, unknown>];
    expect(countPacket[0]).toBe('COUNT');
    expect(countPacket[1]).toMatch(/^count-/);
    expect(countPacket[2]).toEqual({ '#e': ['target-event'], kinds: [7] });

    socket.message(['COUNT', countPacket[1], { count: 12, approximate: true, hll }]);

    await expect(pending).resolves.toEqual({
      capability: 'supported',
      count: 12,
      approximate: true,
      hll
    });

    session.dispose();
  });

  it('reports unsupported NIP-45 COUNT when relay closes the request', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });

    const pending = session.requestCount({
      relayUrl: RELAY_URL,
      filters: [{ kinds: [1059], '#p': ['pubkey-a'] }],
      timeoutMs: 100
    });

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length > 0);

    const countPacket = socket.sent[0] as [string, string, Record<string, unknown>];
    socket.message(['CLOSED', countPacket[1], 'auth-required: cannot count DMs']);

    await expect(pending).resolves.toEqual({
      capability: 'unsupported',
      reason: 'auth-required: cannot count DMs'
    });

    session.dispose();
  });

  it('rejects malformed NIP-45 COUNT payloads and empty local count requests', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });

    await expect(
      session.requestCount({
        relayUrl: RELAY_URL,
        filters: [],
        timeoutMs: 100
      })
    ).resolves.toEqual({
      capability: 'failed',
      reason: 'missing-filters'
    });

    const pending = session.requestCount({
      relayUrl: RELAY_URL,
      filters: [{ kinds: [1] }],
      timeoutMs: 100
    });

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length > 0);

    const countPacket = socket.sent[0] as [string, string, Record<string, unknown>];
    socket.message(['COUNT', countPacket[1], { count: 1.5 }]);

    await expect(pending).resolves.toEqual({
      capability: 'failed',
      reason: 'invalid-count-response'
    });

    session.dispose();
  });

  it('rejects requests that omit canonical requestKey instead of inventing a legacy fallback', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100
    });
    const req = createForwardReq();

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

  it('queues backward shards by max_subscriptions and releases them after EOSE', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100,
      requestOptimizer: {
        relayCapabilities: {
          [RELAY_URL]: {
            relayUrl: RELAY_URL,
            maxFilters: 1,
            maxSubscriptions: 1,
            supportedNips: [1, 11],
            source: 'nip11',
            expiresAt: 3_600,
            stale: false
          }
        }
      }
    });
    const req = createBackwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'backward',
        scope: 'contract:max-subscriptions-queue',
        filters: [{ ids: ['a'] }, { ids: ['b'] }, { ids: ['c'] }]
      })
    });

    const sub = session.use(req).subscribe({});
    req.emit([{ ids: ['a'] }, { ids: ['b'] }, { ids: ['c'] }]);
    req.over();

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length === 1);

    expect(session.getRelayCapabilitySnapshot(RELAY_URL)).toMatchObject({
      queueDepth: 2,
      activeSubscriptions: 1
    });

    const firstSubId = (socket.sent[0] as [string, string, ...unknown[]])[1];
    socket.message(['EOSE', firstSubId]);
    await waitUntil(() => socket.sent.length === 3);
    expect(socket.sent[1]).toEqual(['CLOSE', firstSubId]);

    expect(session.getRelayCapabilitySnapshot(RELAY_URL)).toMatchObject({
      queueDepth: 1,
      activeSubscriptions: 1
    });

    const secondSubId = (socket.sent[2] as [string, string, ...unknown[]])[1];
    socket.message(['EOSE', secondSubId]);
    await waitUntil(() => socket.sent.length === 5);
    expect(socket.sent[3]).toEqual(['CLOSE', secondSubId]);

    expect(session.getRelayCapabilitySnapshot(RELAY_URL)).toMatchObject({
      queueDepth: 0,
      activeSubscriptions: 1
    });

    sub.unsubscribe();
    session.dispose();
  });

  it('publishes capability packets when shard queue state changes', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100,
      requestOptimizer: {
        relayCapabilities: {
          [RELAY_URL]: {
            relayUrl: RELAY_URL,
            maxFilters: 1,
            maxSubscriptions: 1,
            supportedNips: [],
            source: 'learned',
            expiresAt: null,
            stale: false
          }
        }
      }
    });
    const packets: Array<{ queueDepth: number; activeSubscriptions: number }> = [];
    const capabilitySub = session.createRelayCapabilityObservable().subscribe({
      next: (packet) => {
        if (packet.from === RELAY_URL) {
          packets.push({
            queueDepth: packet.capability.queueDepth,
            activeSubscriptions: packet.capability.activeSubscriptions
          });
        }
      }
    });
    const req = createBackwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'backward',
        scope: 'contract:queue-observation',
        filters: [{ ids: ['a'] }, { ids: ['b'] }]
      })
    });

    const sub = session.use(req).subscribe({});
    req.emit([{ ids: ['a'] }, { ids: ['b'] }]);
    req.over();

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() =>
      packets.some((packet) => packet.queueDepth === 1 && packet.activeSubscriptions === 1)
    );

    const firstSubId = (socket.sent[0] as [string, string, ...unknown[]])[1];
    socket.message(['EOSE', firstSubId]);
    await waitUntil(() =>
      packets.some((packet) => packet.queueDepth === 0 && packet.activeSubscriptions === 1)
    );

    capabilitySub.unsubscribe();
    sub.unsubscribe();
    session.dispose();
  });

  it('learns max_filters from CLOSED and reports the safety bound', async () => {
    const learned: unknown[] = [];
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100,
      requestOptimizer: {
        defaultMaxFiltersPerRequest: 3,
        onCapabilityLearned: (event) => learned.push(event)
      }
    });
    const req = createBackwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'backward',
        scope: 'contract:learn-max-filters',
        filters: [{ ids: ['a'] }, { ids: ['b'] }, { ids: ['c'] }]
      })
    });

    const sub = session.use(req).subscribe({});
    req.emit([{ ids: ['a'] }, { ids: ['b'] }, { ids: ['c'] }]);
    req.over();

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length === 1);

    const subId = (socket.sent[0] as [string, string, ...unknown[]])[1];
    socket.message(['CLOSED', subId, 'too many filters: max_filters=1']);

    await waitUntil(() => learned.length === 1);
    expect(learned[0]).toEqual({
      relayUrl: RELAY_URL,
      kind: 'maxFilters',
      value: 1,
      reason: 'too many filters: max_filters=1'
    });

    sub.unsubscribe();
    session.dispose();
  });

  it('emits normalized capability state after temporary relay idle disconnect', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100,
      relayLifecycle: {
        idleDisconnectMs: 10,
        retry: { strategy: 'off' }
      }
    });
    const req = createBackwardReq({
      requestKey: 'rq:v1:contract-idle-capability-observation' as RequestKey
    });
    const capabilityPackets: Array<{
      from: string;
      queueDepth: number;
      activeSubscriptions: number;
    }> = [];
    let completed = false;

    const capabilitySub = session.createRelayCapabilityObservable().subscribe({
      next: (packet) => {
        if (packet.from === TEMP_RELAY_URL) {
          capabilityPackets.push({
            from: packet.from,
            queueDepth: packet.capability.queueDepth,
            activeSubscriptions: packet.capability.activeSubscriptions
          });
        }
      }
    });
    const sub = session
      .use(req, {
        on: {
          defaultReadRelays: false,
          relays: [TEMP_RELAY_URL]
        }
      })
      .subscribe({
        complete: () => {
          completed = true;
        }
      });

    req.emit({ kinds: [1] });
    req.over();

    await waitUntil(() => FakeWebSocket.instances.some((socket) => socket.url === TEMP_RELAY_URL));
    const socket = FakeWebSocket.instances.find((entry) => entry.url === TEMP_RELAY_URL);
    if (!socket) throw new Error('temporary socket was not created');
    socket.open();
    await waitUntil(() => socket.sent.length > 0);

    const [, subId] = socket.sent[0] as [string, string, Record<string, unknown>];
    socket.message(['EOSE', subId]);
    await waitUntil(() => completed);
    await waitUntil(() => session.getRelayStatus(TEMP_RELAY_URL)?.reason === 'idle-timeout');

    expect(capabilityPackets).toContainEqual({
      from: TEMP_RELAY_URL,
      queueDepth: 0,
      activeSubscriptions: 0
    });

    capabilitySub.unsubscribe();
    sub.unsubscribe();
    session.dispose();
  });

  it('emits a duplicate event id once per logical consumer across shards', async () => {
    const session = createRelaySession({
      defaultRelays: [RELAY_URL],
      eoseTimeout: 100,
      requestOptimizer: {
        relayCapabilities: {
          [RELAY_URL]: {
            relayUrl: RELAY_URL,
            maxFilters: 1,
            maxSubscriptions: null,
            supportedNips: [],
            source: 'learned',
            expiresAt: null,
            stale: false
          }
        }
      }
    });
    const req = createForwardReq({
      requestKey: createRuntimeRequestKey({
        mode: 'forward',
        scope: 'contract:dedup-shards',
        filters: [{ ids: ['same'] }, { authors: ['pubkey-a'] }]
      })
    });
    const received: string[] = [];

    const sub = session.use(req).subscribe({
      next: (packet) => received.push(packet.event.id)
    });
    req.emit([{ ids: ['same'] }, { authors: ['pubkey-a'] }]);

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = latestSocket();
    socket.open();
    await waitUntil(() => socket.sent.length === 2);

    const firstSubId = (socket.sent[0] as [string, string, ...unknown[]])[1];
    const secondSubId = (socket.sent[1] as [string, string, ...unknown[]])[1];
    const event = {
      id: 'same-event',
      pubkey: 'pubkey-a',
      content: 'dupe',
      created_at: 1,
      tags: [],
      kind: 1
    };

    socket.message(['EVENT', firstSubId, event]);
    socket.message(['EVENT', secondSubId, event]);

    await waitUntil(() => received.length === 1);
    expect(received).toEqual(['same-event']);

    sub.unsubscribe();
    session.dispose();
  });
});
