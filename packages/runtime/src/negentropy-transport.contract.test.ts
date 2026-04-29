import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRxNostrSession } from './index.js';

type Listener = (event?: unknown) => void;

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readonly sent: unknown[] = [];
  readonly listeners: Record<string, Listener[]> = { open: [], message: [], error: [], close: [] };
  readyState = 0;

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
    this.emit('close');
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open');
  }

  message(packet: unknown): void {
    this.emit('message', { data: JSON.stringify(packet) });
  }

  private emit(type: 'open' | 'message' | 'error' | 'close', event?: unknown): void {
    for (const listener of this.listeners[type]) listener(event);
  }
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitUntil timeout');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('@auftakt/runtime negentropy transport contract', () => {
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

  it('uses a dedicated negentropy subscription namespace and reports unsupported relays', async () => {
    const session = createRxNostrSession({
      defaultRelays: ['wss://relay.contract.test'],
      eoseTimeout: 100
    });

    const resultPromise = session.requestNegentropySync({
      relayUrl: 'wss://relay.contract.test',
      filter: { kinds: [1] },
      initialMessageHex: '00',
      timeoutMs: 100
    });

    await waitUntil(() => FakeWebSocket.instances.length > 0);
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await waitUntil(() => socket.sent.length > 0);

    const [openType, subId] = socket.sent[0] as [string, string, Record<string, unknown>, string];
    expect(openType).toBe('NEG-OPEN');
    expect(subId).toMatch(/^neg-/);

    socket.message(['NEG-ERR', subId, 'unsupported: negentropy disabled']);

    await expect(resultPromise).resolves.toMatchObject({
      capability: 'unsupported'
    });

    session.dispose();
  });
});
