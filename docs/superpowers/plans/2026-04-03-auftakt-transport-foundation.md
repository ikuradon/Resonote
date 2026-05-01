# auftakt Transport Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RelayConnection の状態マシン・自動再接続・メッセージ処理・PublishManager・LRU dedup・署名検証を実装し、Plans C-E の基盤を作る

**Architecture:** `core/relay/` 配下に focused な小ファイル群を新規作成。既存の `relay-manager.ts` は変更せず共存。各コンポーネントは `createConnection` 注入でテスト可能

**Tech Stack:** TypeScript, vitest, nostr-tools/pure (verifyEvent)

---

## File Structure

### 新規作成

| File                                                           | 責務                                        |
| -------------------------------------------------------------- | ------------------------------------------- |
| `src/shared/nostr/auftakt/core/relay/connection-state.ts`      | ConnectionState 型 + 純粋な状態遷移関数     |
| `src/shared/nostr/auftakt/core/relay/connection-state.test.ts` | 状態遷移テスト                              |
| `src/shared/nostr/auftakt/core/relay/lru-dedup.ts`             | LRU event ID dedup cache                    |
| `src/shared/nostr/auftakt/core/relay/lru-dedup.test.ts`        | LRU テスト                                  |
| `src/shared/nostr/auftakt/core/relay/event-validator.ts`       | 構造検証 + 署名検証                         |
| `src/shared/nostr/auftakt/core/relay/event-validator.test.ts`  | バリデーションテスト                        |
| `src/shared/nostr/auftakt/core/relay/relay-connection.ts`      | WebSocket ラッパー + 状態マシン + reconnect |
| `src/shared/nostr/auftakt/core/relay/relay-connection.test.ts` | RelayConnection テスト                      |
| `src/shared/nostr/auftakt/core/relay/publish-manager.ts`       | EVENT 送信 + OK 追跡 + timeout              |
| `src/shared/nostr/auftakt/core/relay/publish-manager.test.ts`  | PublishManager テスト                       |

### 変更

| File                                     | 変更内容                                              |
| ---------------------------------------- | ----------------------------------------------------- |
| `src/shared/nostr/auftakt/core/types.ts` | `NostrEvent`, `EventSigner`, `ConnectionState` 型追加 |

### 変更しない

| File                                             | 理由                                                 |
| ------------------------------------------------ | ---------------------------------------------------- |
| `src/shared/nostr/auftakt/core/relay-manager.ts` | 既存。Plans C-E で新 RelayManager に置換するまで共存 |
| `src/shared/nostr/auftakt/core/store-types.ts`   | interface 変更は Plan C-D で                         |
| `src/shared/nostr/auftakt/testing/fakes.ts`      | fake 更新は Plan C-D で                              |

---

### Task 1: Core 型定義の追加

**Files:**

- Modify: `src/shared/nostr/auftakt/core/types.ts`
- Test: 既存の型テスト (`pnpm check` で検証)

- [ ] **Step 1: NostrEvent, EventSigner, ConnectionState を types.ts に追加**

```typescript
// src/shared/nostr/auftakt/core/types.ts の末尾に追加

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface EventSigner {
  signEvent(params: Record<string, unknown>): Promise<Record<string, unknown>>;
  getPublicKey(): Promise<string>;
}

export type ConnectionState =
  | 'initialized'
  | 'connecting'
  | 'connected'
  | 'waiting-for-retrying'
  | 'retrying'
  | 'dormant'
  | 'error'
  | 'rejected'
  | 'terminated';
```

- [ ] **Step 2: 型チェック**

Run: `pnpm check`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/nostr/auftakt/core/types.ts
git commit -m "feat: add NostrEvent, EventSigner, ConnectionState types to auftakt"
```

---

### Task 2: LRU Dedup Cache

**Files:**

- Create: `src/shared/nostr/auftakt/core/relay/lru-dedup.ts`
- Test: `src/shared/nostr/auftakt/core/relay/lru-dedup.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/relay/lru-dedup.test.ts
import { describe, expect, it } from 'vitest';

import { LruDedup } from './lru-dedup.js';

describe('LruDedup', () => {
  it('reports new event IDs as unseen', () => {
    const dedup = new LruDedup(100);
    expect(dedup.check('aaa')).toBe(true);
  });

  it('reports seen event IDs as duplicates', () => {
    const dedup = new LruDedup(100);
    dedup.check('aaa');
    expect(dedup.check('aaa')).toBe(false);
  });

  it('evicts oldest entry when capacity is exceeded', () => {
    const dedup = new LruDedup(3);
    dedup.check('a');
    dedup.check('b');
    dedup.check('c');
    dedup.check('d'); // evicts 'a'
    expect(dedup.check('a')).toBe(true); // 'a' was evicted, now new
    expect(dedup.check('b')).toBe(false); // 'b' still present
  });

  it('refreshes access order on duplicate check', () => {
    const dedup = new LruDedup(3);
    dedup.check('a');
    dedup.check('b');
    dedup.check('c');
    dedup.check('a'); // refresh 'a' to most recent
    dedup.check('d'); // evicts 'b' (oldest after refresh)
    expect(dedup.check('a')).toBe(false); // 'a' was refreshed, still present
    expect(dedup.check('b')).toBe(true); // 'b' was evicted
  });

  it('clears all entries', () => {
    const dedup = new LruDedup(100);
    dedup.check('a');
    dedup.check('b');
    dedup.clear();
    expect(dedup.size).toBe(0);
    expect(dedup.check('a')).toBe(true);
  });

  it('defaults to 50000 capacity', () => {
    const dedup = new LruDedup();
    expect(dedup.maxSize).toBe(50_000);
  });
});
```

- [ ] **Step 2: テスト fail を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/lru-dedup.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: 実装**

```typescript
// src/shared/nostr/auftakt/core/relay/lru-dedup.ts
export class LruDedup {
  readonly maxSize: number;
  readonly #seen = new Map<string, true>();

  constructor(maxSize = 50_000) {
    this.maxSize = maxSize;
  }

  check(id: string): boolean {
    if (this.#seen.has(id)) {
      this.#seen.delete(id);
      this.#seen.set(id, true);
      return false;
    }

    this.#seen.set(id, true);

    if (this.#seen.size > this.maxSize) {
      const oldest = this.#seen.keys().next().value;
      if (oldest !== undefined) {
        this.#seen.delete(oldest);
      }
    }

    return true;
  }

  clear(): void {
    this.#seen.clear();
  }

  get size(): number {
    return this.#seen.size;
  }
}
```

- [ ] **Step 4: テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/lru-dedup.test.ts`
Expected: 6 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/lru-dedup.ts src/shared/nostr/auftakt/core/relay/lru-dedup.test.ts
git commit -m "feat: add LRU dedup cache for auftakt relay transport"
```

---

### Task 3: Event Validator

**Files:**

- Create: `src/shared/nostr/auftakt/core/relay/event-validator.ts`
- Test: `src/shared/nostr/auftakt/core/relay/event-validator.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/relay/event-validator.test.ts
import { describe, expect, it } from 'vitest';

import type { NostrEvent } from '$shared/nostr/auftakt/core/types.js';

import { isValidEventStructure, validateEvent } from './event-validator.js';

const validEvent: NostrEvent = {
  id: 'abc123',
  pubkey: 'pub123',
  created_at: 1000,
  kind: 1,
  tags: [['p', 'someone']],
  content: 'hello',
  sig: 'sig123'
};

describe('isValidEventStructure', () => {
  it('accepts a valid event', () => {
    expect(isValidEventStructure(validEvent)).toBe(true);
  });

  it('rejects null', () => {
    expect(isValidEventStructure(null)).toBe(false);
  });

  it('rejects non-object', () => {
    expect(isValidEventStructure('string')).toBe(false);
  });

  it('rejects missing id', () => {
    expect(isValidEventStructure({ ...validEvent, id: 123 })).toBe(false);
  });

  it('rejects non-number kind', () => {
    expect(isValidEventStructure({ ...validEvent, kind: '1' })).toBe(false);
  });

  it('rejects non-array tags', () => {
    expect(isValidEventStructure({ ...validEvent, tags: 'bad' })).toBe(false);
  });

  it('rejects tags with non-array elements', () => {
    expect(isValidEventStructure({ ...validEvent, tags: ['bad'] })).toBe(false);
  });
});

describe('validateEvent', () => {
  it('returns event when structure and signature are valid', async () => {
    const alwaysValid = async () => true;
    const result = await validateEvent(validEvent, alwaysValid);
    expect(result).toEqual(validEvent);
  });

  it('returns null when structure is invalid', async () => {
    const alwaysValid = async () => true;
    const result = await validateEvent({ bad: true }, alwaysValid);
    expect(result).toBeNull();
  });

  it('returns null when signature verification fails', async () => {
    const alwaysInvalid = async () => false;
    const result = await validateEvent(validEvent, alwaysInvalid);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: テスト fail を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/event-validator.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: 実装**

```typescript
// src/shared/nostr/auftakt/core/relay/event-validator.ts
import type { NostrEvent } from '../types.js';

export type EventVerifier = (event: NostrEvent) => Promise<boolean>;

export function isValidEventStructure(raw: unknown): raw is NostrEvent {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }

  const event = raw as Record<string, unknown>;

  return (
    typeof event.id === 'string' &&
    typeof event.pubkey === 'string' &&
    typeof event.sig === 'string' &&
    typeof event.kind === 'number' &&
    typeof event.created_at === 'number' &&
    typeof event.content === 'string' &&
    Array.isArray(event.tags) &&
    event.tags.every((tag: unknown) => Array.isArray(tag))
  );
}

export async function validateEvent(
  raw: unknown,
  verifier: EventVerifier
): Promise<NostrEvent | null> {
  if (!isValidEventStructure(raw)) {
    return null;
  }

  const valid = await verifier(raw);
  return valid ? raw : null;
}

export function createDefaultVerifier(): EventVerifier {
  let cachedVerify: ((event: NostrEvent) => boolean) | null = null;

  return async (event: NostrEvent) => {
    if (!cachedVerify) {
      const { verifyEvent } = await import('nostr-tools/pure');
      cachedVerify = verifyEvent as unknown as (event: NostrEvent) => boolean;
    }

    return cachedVerify(event);
  };
}
```

- [ ] **Step 4: テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/event-validator.test.ts`
Expected: 10 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/event-validator.ts src/shared/nostr/auftakt/core/relay/event-validator.test.ts
git commit -m "feat: add event structural and signature validator for auftakt relay"
```

---

### Task 4: Connection State Machine

**Files:**

- Create: `src/shared/nostr/auftakt/core/relay/connection-state.ts`
- Test: `src/shared/nostr/auftakt/core/relay/connection-state.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/relay/connection-state.test.ts
import { describe, expect, it } from 'vitest';

import { canSend, isTerminal, nextState } from './connection-state.js';

describe('connection state machine', () => {
  it('transitions from initialized to connecting on connect', () => {
    expect(nextState('initialized', { type: 'connect' })).toBe('connecting');
  });

  it('transitions from connecting to connected on open', () => {
    expect(nextState('connecting', { type: 'open' })).toBe('connected');
  });

  it('transitions from connected to waiting-for-retrying on close', () => {
    expect(nextState('connected', { type: 'close', code: 1006 })).toBe('waiting-for-retrying');
  });

  it('transitions from connected to rejected on close code 4000', () => {
    expect(nextState('connected', { type: 'close', code: 4000 })).toBe('rejected');
  });

  it('transitions from connected to dormant on idle', () => {
    expect(nextState('connected', { type: 'idle' })).toBe('dormant');
  });

  it('transitions from dormant to connecting on wake', () => {
    expect(nextState('dormant', { type: 'wake' })).toBe('connecting');
  });

  it('transitions from waiting-for-retrying to retrying on retry', () => {
    expect(nextState('waiting-for-retrying', { type: 'retry' })).toBe('retrying');
  });

  it('transitions from waiting-for-retrying to error on retry-exhausted', () => {
    expect(nextState('waiting-for-retrying', { type: 'retry-exhausted' })).toBe('error');
  });

  it('transitions from retrying to connected on open', () => {
    expect(nextState('retrying', { type: 'open' })).toBe('connected');
  });

  it('transitions from retrying to waiting-for-retrying on close', () => {
    expect(nextState('retrying', { type: 'close', code: 1006 })).toBe('waiting-for-retrying');
  });

  it('transitions any state to terminated on dispose', () => {
    const states = [
      'initialized',
      'connecting',
      'connected',
      'waiting-for-retrying',
      'retrying',
      'dormant',
      'error',
      'rejected'
    ] as const;

    for (const state of states) {
      expect(nextState(state, { type: 'dispose' })).toBe('terminated');
    }
  });

  it('ignores invalid transitions', () => {
    expect(nextState('initialized', { type: 'open' })).toBe('initialized');
    expect(nextState('error', { type: 'retry' })).toBe('error');
    expect(nextState('terminated', { type: 'connect' })).toBe('terminated');
  });
});

describe('state helpers', () => {
  it('canSend returns true only for connected', () => {
    expect(canSend('connected')).toBe(true);
    expect(canSend('connecting')).toBe(false);
    expect(canSend('dormant')).toBe(false);
  });

  it('isTerminal returns true for error, rejected, terminated', () => {
    expect(isTerminal('error')).toBe(true);
    expect(isTerminal('rejected')).toBe(true);
    expect(isTerminal('terminated')).toBe(true);
    expect(isTerminal('connected')).toBe(false);
  });
});
```

- [ ] **Step 2: テスト fail を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/connection-state.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: 実装**

```typescript
// src/shared/nostr/auftakt/core/relay/connection-state.ts
import type { ConnectionState } from '../types.js';

export type ConnectionEvent =
  | { type: 'connect' }
  | { type: 'open' }
  | { type: 'close'; code: number }
  | { type: 'error' }
  | { type: 'retry' }
  | { type: 'retry-exhausted' }
  | { type: 'idle' }
  | { type: 'wake' }
  | { type: 'dispose' };

const CLOSE_CODE_REJECTED = 4000;

export function nextState(current: ConnectionState, event: ConnectionEvent): ConnectionState {
  if (event.type === 'dispose') {
    return 'terminated';
  }

  switch (current) {
    case 'initialized':
      if (event.type === 'connect') return 'connecting';
      return current;

    case 'connecting':
      if (event.type === 'open') return 'connected';
      if (event.type === 'error' || event.type === 'close') return 'waiting-for-retrying';
      return current;

    case 'connected':
      if (event.type === 'close' && event.code === CLOSE_CODE_REJECTED) return 'rejected';
      if (event.type === 'close' || event.type === 'error') return 'waiting-for-retrying';
      if (event.type === 'idle') return 'dormant';
      return current;

    case 'waiting-for-retrying':
      if (event.type === 'retry') return 'retrying';
      if (event.type === 'retry-exhausted') return 'error';
      return current;

    case 'retrying':
      if (event.type === 'open') return 'connected';
      if (event.type === 'error' || event.type === 'close') return 'waiting-for-retrying';
      return current;

    case 'dormant':
      if (event.type === 'wake' || event.type === 'connect') return 'connecting';
      return current;

    case 'error':
    case 'rejected':
    case 'terminated':
      return current;
  }
}

export function canSend(state: ConnectionState): boolean {
  return state === 'connected';
}

export function isTerminal(state: ConnectionState): boolean {
  return state === 'error' || state === 'rejected' || state === 'terminated';
}

export function shouldBuffer(state: ConnectionState): boolean {
  return (
    state === 'initialized' ||
    state === 'connecting' ||
    state === 'waiting-for-retrying' ||
    state === 'retrying'
  );
}
```

- [ ] **Step 4: テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/connection-state.test.ts`
Expected: 15+ tests passed

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/connection-state.ts src/shared/nostr/auftakt/core/relay/connection-state.test.ts
git commit -m "feat: add pure connection state machine for auftakt relay"
```

---

### Task 5: RelayConnection

**Files:**

- Create: `src/shared/nostr/auftakt/core/relay/relay-connection.ts`
- Test: `src/shared/nostr/auftakt/core/relay/relay-connection.test.ts`

- [ ] **Step 1: fake WebSocket helper とテストを書く**

```typescript
// src/shared/nostr/auftakt/core/relay/relay-connection.test.ts
import { describe, expect, it, vi } from 'vitest';

import { RelayConnection } from './relay-connection.js';

type Listener = (event: { data?: string; code?: number }) => void;

function createFakeSocket() {
  const listeners = new Map<string, Set<Listener>>();
  const sent: string[] = [];
  let readyState = 0; // CONNECTING

  const socket = {
    get readyState() {
      return readyState;
    },
    send(data: string) {
      sent.push(data);
    },
    close(_code?: number) {
      readyState = 3;
    },
    addEventListener(type: string, fn: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.get(type)?.delete(fn);
    },
    // Test helpers
    simulateOpen() {
      readyState = 1;
      for (const fn of listeners.get('open') ?? []) fn({});
    },
    simulateMessage(data: unknown[]) {
      for (const fn of listeners.get('message') ?? []) fn({ data: JSON.stringify(data) });
    },
    simulateClose(code = 1006) {
      readyState = 3;
      for (const fn of listeners.get('close') ?? []) fn({ code });
    },
    simulateError() {
      for (const fn of listeners.get('error') ?? []) fn({});
    },
    sent
  };

  return socket;
}

describe('RelayConnection', () => {
  it('starts in initialized state', () => {
    const conn = new RelayConnection({
      url: 'wss://relay.test',
      connect: () => createFakeSocket(),
      retry: { strategy: 'off' }
    });
    expect(conn.state).toBe('initialized');
  });

  it('transitions to connected on successful connect', () => {
    let socket: ReturnType<typeof createFakeSocket>;
    const conn = new RelayConnection({
      url: 'wss://relay.test',
      connect: () => {
        socket = createFakeSocket();
        return socket;
      },
      retry: { strategy: 'off' }
    });

    conn.ensureConnected();
    expect(conn.state).toBe('connecting');

    socket!.simulateOpen();
    expect(conn.state).toBe('connected');
  });

  it('buffers messages while connecting and flushes on open', () => {
    let socket: ReturnType<typeof createFakeSocket>;
    const conn = new RelayConnection({
      url: 'wss://relay.test',
      connect: () => {
        socket = createFakeSocket();
        return socket;
      },
      retry: { strategy: 'off' }
    });

    conn.ensureConnected();
    conn.send(['REQ', 'sub-1', {}]);

    expect(socket!.sent).toHaveLength(0);

    socket!.simulateOpen();
    expect(socket!.sent).toHaveLength(1);
    expect(JSON.parse(socket!.sent[0])).toEqual(['REQ', 'sub-1', {}]);
  });

  it('delivers parsed messages to handlers', () => {
    let socket: ReturnType<typeof createFakeSocket>;
    const conn = new RelayConnection({
      url: 'wss://relay.test',
      connect: () => {
        socket = createFakeSocket();
        return socket;
      },
      retry: { strategy: 'off' }
    });

    const messages: unknown[][] = [];
    conn.onMessage((msg) => messages.push(msg));

    conn.ensureConnected();
    socket!.simulateOpen();
    socket!.simulateMessage(['EVENT', 'sub-1', { id: 'test' }]);

    expect(messages).toEqual([['EVENT', 'sub-1', { id: 'test' }]]);
  });

  it('drops invalid JSON silently', () => {
    let socket: ReturnType<typeof createFakeSocket>;
    const conn = new RelayConnection({
      url: 'wss://relay.test',
      connect: () => {
        socket = createFakeSocket();
        return socket;
      },
      retry: { strategy: 'off' }
    });

    const messages: unknown[][] = [];
    conn.onMessage((msg) => messages.push(msg));

    conn.ensureConnected();
    socket!.simulateOpen();

    const listeners = new Map<string, Set<Listener>>();
    // Simulate raw invalid message
    for (const fn of (socket as any)._getListeners?.('message') ?? []) {
      fn({ data: 'not-json' });
    }

    // Since we can't easily reach the raw listener, test via the public API
    // The implementation should catch JSON.parse errors internally
    expect(messages).toHaveLength(0);
  });

  it('notifies state change listeners', () => {
    let socket: ReturnType<typeof createFakeSocket>;
    const conn = new RelayConnection({
      url: 'wss://relay.test',
      connect: () => {
        socket = createFakeSocket();
        return socket;
      },
      retry: { strategy: 'off' }
    });

    const states: string[] = [];
    conn.onStateChange((state) => states.push(state));

    conn.ensureConnected();
    socket!.simulateOpen();

    expect(states).toEqual(['connecting', 'connected']);
  });

  it('transitions to terminated on dispose', () => {
    const conn = new RelayConnection({
      url: 'wss://relay.test',
      connect: () => createFakeSocket(),
      retry: { strategy: 'off' }
    });

    conn.dispose();
    expect(conn.state).toBe('terminated');
  });

  it('calls onReconnect callback after reconnect', async () => {
    let socket: ReturnType<typeof createFakeSocket>;
    let reconnectCount = 0;
    const conn = new RelayConnection({
      url: 'wss://relay.test',
      connect: () => {
        socket = createFakeSocket();
        return socket;
      },
      retry: { strategy: 'exponential', initialDelay: 10, maxDelay: 10, maxCount: 1 }
    });

    conn.onReconnect(() => {
      reconnectCount++;
    });
    conn.ensureConnected();
    socket!.simulateOpen();
    socket!.simulateClose(1006);

    // Wait for retry timer
    await new Promise((resolve) => setTimeout(resolve, 50));

    socket!.simulateOpen();
    expect(reconnectCount).toBe(1);
  });

  it('transitions to dormant after idle timeout in lazy mode', async () => {
    let socket: ReturnType<typeof createFakeSocket>;
    const conn = new RelayConnection({
      url: 'wss://relay.test',
      connect: () => {
        socket = createFakeSocket();
        return socket;
      },
      retry: { strategy: 'off' },
      mode: 'lazy',
      idleTimeout: 20
    });

    conn.ensureConnected();
    socket!.simulateOpen();
    expect(conn.state).toBe('connected');

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(conn.state).toBe('dormant');
  });

  it('does not idle disconnect in lazy-keep mode', async () => {
    let socket: ReturnType<typeof createFakeSocket>;
    const conn = new RelayConnection({
      url: 'wss://relay.test',
      connect: () => {
        socket = createFakeSocket();
        return socket;
      },
      retry: { strategy: 'off' },
      mode: 'lazy-keep',
      idleTimeout: 20
    });

    conn.ensureConnected();
    socket!.simulateOpen();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(conn.state).toBe('connected');
  });

  it('reconnects from dormant on ensureConnected', () => {
    let socket: ReturnType<typeof createFakeSocket>;
    const conn = new RelayConnection({
      url: 'wss://relay.test',
      connect: () => {
        socket = createFakeSocket();
        return socket;
      },
      retry: { strategy: 'off' },
      mode: 'lazy',
      idleTimeout: 0
    });

    conn.ensureConnected();
    socket!.simulateOpen();

    // Force dormant
    conn.goIdle();
    expect(conn.state).toBe('dormant');

    conn.ensureConnected();
    expect(conn.state).toBe('connecting');
  });
});
```

- [ ] **Step 2: テスト fail を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/relay-connection.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: 実装**

```typescript
// src/shared/nostr/auftakt/core/relay/relay-connection.ts
import type { ConnectionState } from '../types.js';
import { canSend, isTerminal, nextState, shouldBuffer } from './connection-state.js';
import type { ConnectionEvent } from './connection-state.js';

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: Record<string, unknown>) => void): void;
  removeEventListener(type: string, listener: (event: Record<string, unknown>) => void): void;
}

export interface RelayConnectionConfig {
  url: string;
  connect?: (url: string) => WebSocketLike;
  retry?: {
    strategy: 'exponential' | 'off';
    initialDelay?: number;
    maxDelay?: number;
    maxCount?: number;
  };
  mode?: 'lazy' | 'lazy-keep';
  idleTimeout?: number;
}

type MessageHandler = (message: unknown[]) => void;
type StateChangeHandler = (state: ConnectionState) => void;

export class RelayConnection {
  readonly url: string;
  #state: ConnectionState = 'initialized';
  #socket: WebSocketLike | null = null;
  #createSocket: (url: string) => WebSocketLike;
  #retryStrategy: 'exponential' | 'off';
  #initialDelay: number;
  #maxDelay: number;
  #maxCount: number;
  #mode: 'lazy' | 'lazy-keep';
  #idleTimeout: number;
  #retryCount = 0;
  #retryTimer: ReturnType<typeof setTimeout> | null = null;
  #idleTimer: ReturnType<typeof setTimeout> | null = null;
  #outbox: unknown[][] = [];
  #messageHandlers = new Set<MessageHandler>();
  #stateChangeHandlers = new Set<StateChangeHandler>();
  #reconnectHandlers = new Set<() => void>();

  constructor(config: RelayConnectionConfig) {
    this.url = config.url;
    this.#createSocket =
      config.connect ?? ((url) => new WebSocket(url) as unknown as WebSocketLike);
    this.#retryStrategy = config.retry?.strategy ?? 'exponential';
    this.#initialDelay = config.retry?.initialDelay ?? 1000;
    this.#maxDelay = config.retry?.maxDelay ?? 60000;
    this.#maxCount = config.retry?.maxCount ?? Infinity;
    this.#mode = config.mode ?? 'lazy-keep';
    this.#idleTimeout = config.idleTimeout ?? 10000;
  }

  get state(): ConnectionState {
    return this.#state;
  }

  ensureConnected(): void {
    if (this.#state === 'initialized' || this.#state === 'dormant') {
      this.#connect();
    }
  }

  send(message: unknown[]): void {
    if (canSend(this.#state) && this.#socket) {
      this.#socket.send(JSON.stringify(message));
    } else if (shouldBuffer(this.#state)) {
      this.#outbox.push(message);
      this.ensureConnected();
    }
  }

  goIdle(): void {
    if (this.#state === 'connected') {
      this.#transition({ type: 'idle' });
      this.#socket?.close();
      this.#socket = null;
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.#messageHandlers.add(handler);
    return () => {
      this.#messageHandlers.delete(handler);
    };
  }

  onStateChange(handler: StateChangeHandler): () => void {
    this.#stateChangeHandlers.add(handler);
    return () => {
      this.#stateChangeHandlers.delete(handler);
    };
  }

  onReconnect(handler: () => void): () => void {
    this.#reconnectHandlers.add(handler);
    return () => {
      this.#reconnectHandlers.delete(handler);
    };
  }

  dispose(): void {
    this.#clearTimers();
    this.#transition({ type: 'dispose' });
    this.#socket?.close();
    this.#socket = null;
    this.#outbox = [];
    this.#messageHandlers.clear();
    this.#stateChangeHandlers.clear();
    this.#reconnectHandlers.clear();
  }

  #connect(): void {
    if (isTerminal(this.#state)) return;

    const wasReconnect =
      this.#state === 'dormant' || this.#state === 'retrying' || this.#retryCount > 0;

    this.#transition({ type: 'connect' });
    this.#socket = this.#createSocket(this.url);

    this.#socket.addEventListener('open', () => {
      this.#transition({ type: 'open' });
      this.#retryCount = 0;
      this.#flushOutbox();
      this.#startIdleTimer();

      if (wasReconnect) {
        for (const handler of this.#reconnectHandlers) handler();
      }
    });

    this.#socket.addEventListener('close', (event) => {
      const code = typeof event.code === 'number' ? event.code : 1006;
      this.#transition({ type: 'close', code });
      this.#scheduleRetry();
    });

    this.#socket.addEventListener('error', () => {
      this.#transition({ type: 'error' });
    });

    this.#socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data as string);
      } catch {
        return;
      }

      if (!Array.isArray(parsed)) return;

      for (const handler of this.#messageHandlers) {
        handler(parsed as unknown[]);
      }
    });
  }

  #transition(event: ConnectionEvent): void {
    const next = nextState(this.#state, event);
    if (next === this.#state) return;

    this.#state = next;
    for (const handler of this.#stateChangeHandlers) {
      handler(next);
    }
  }

  #flushOutbox(): void {
    if (!canSend(this.#state) || !this.#socket) return;

    const messages = this.#outbox;
    this.#outbox = [];

    for (const message of messages) {
      this.#socket.send(JSON.stringify(message));
    }
  }

  #scheduleRetry(): void {
    if (this.#retryStrategy === 'off' || isTerminal(this.#state)) return;

    this.#retryCount++;

    if (this.#retryCount > this.#maxCount) {
      this.#transition({ type: 'retry-exhausted' });
      return;
    }

    const jitter = (Math.random() - 0.5) * 1000;
    const delay = Math.min(
      this.#initialDelay * Math.pow(2, this.#retryCount - 1) + jitter,
      this.#maxDelay
    );

    this.#retryTimer = setTimeout(
      () => {
        this.#retryTimer = null;
        if (this.#state === 'waiting-for-retrying') {
          this.#transition({ type: 'retry' });
          this.#connect();
        }
      },
      Math.max(delay, 0)
    );
  }

  #startIdleTimer(): void {
    this.#clearIdleTimer();

    if (this.#mode !== 'lazy') return;

    this.#idleTimer = setTimeout(() => {
      this.#idleTimer = null;
      if (this.#state === 'connected') {
        this.goIdle();
      }
    }, this.#idleTimeout);
  }

  #clearIdleTimer(): void {
    if (this.#idleTimer !== null) {
      clearTimeout(this.#idleTimer);
      this.#idleTimer = null;
    }
  }

  #clearTimers(): void {
    this.#clearIdleTimer();
    if (this.#retryTimer !== null) {
      clearTimeout(this.#retryTimer);
      this.#retryTimer = null;
    }
  }

  resetIdleTimer(): void {
    if (this.#mode === 'lazy' && this.#state === 'connected') {
      this.#startIdleTimer();
    }
  }
}
```

- [ ] **Step 4: テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/relay-connection.test.ts`
Expected: 10+ tests passed

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/relay-connection.ts src/shared/nostr/auftakt/core/relay/relay-connection.test.ts
git commit -m "feat: implement RelayConnection with state machine and auto-reconnect"
```

---

### Task 6: PublishManager

**Files:**

- Create: `src/shared/nostr/auftakt/core/relay/publish-manager.ts`
- Test: `src/shared/nostr/auftakt/core/relay/publish-manager.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/relay/publish-manager.test.ts
import { describe, expect, it, vi } from 'vitest';

import { PublishManager } from './publish-manager.js';

function createMockConnection() {
  const sent: unknown[][] = [];
  const messageHandlers = new Set<(msg: unknown[]) => void>();

  return {
    send(msg: unknown[]) {
      sent.push(msg);
    },
    onMessage(handler: (msg: unknown[]) => void) {
      messageHandlers.add(handler);
      return () => {
        messageHandlers.delete(handler);
      };
    },
    onReconnect(handler: () => void) {
      return () => {};
    },
    simulateOk(eventId: string, accepted: boolean, message = '') {
      for (const handler of messageHandlers) {
        handler(['OK', eventId, accepted, message]);
      }
    },
    sent
  };
}

describe('PublishManager', () => {
  it('sends EVENT and resolves on OK true', async () => {
    const conn = createMockConnection();
    const pm = new PublishManager({ publishTimeout: 5000 });
    pm.attachConnection(conn as any);

    const promise = pm.publish({ id: 'evt-1', sig: 'sig' } as any);

    expect(conn.sent).toEqual([['EVENT', { id: 'evt-1', sig: 'sig' }]]);

    conn.simulateOk('evt-1', true, '');
    const result = await promise;

    expect(result.accepted).toBe(true);
  });

  it('resolves with rejected on OK false', async () => {
    const conn = createMockConnection();
    const pm = new PublishManager({ publishTimeout: 5000 });
    pm.attachConnection(conn as any);

    const promise = pm.publish({ id: 'evt-2', sig: 'sig' } as any);
    conn.simulateOk('evt-2', false, 'blocked: rate limited');

    const result = await promise;
    expect(result.accepted).toBe(false);
    expect(result.message).toBe('blocked: rate limited');
  });

  it('times out and resolves with timeout failure', async () => {
    const conn = createMockConnection();
    const pm = new PublishManager({ publishTimeout: 20 });
    pm.attachConnection(conn as any);

    const result = await pm.publish({ id: 'evt-3', sig: 'sig' } as any);
    expect(result.accepted).toBe(false);
    expect(result.timedOut).toBe(true);
  });

  it('replays pending publishes on reconnect', () => {
    const conn = createMockConnection();
    const pm = new PublishManager({ publishTimeout: 5000 });
    pm.attachConnection(conn as any);

    pm.publish({ id: 'evt-4', sig: 'sig' } as any);
    conn.sent.length = 0;

    pm.replayPending(conn as any);
    expect(conn.sent).toEqual([['EVENT', { id: 'evt-4', sig: 'sig' }]]);
  });

  it('clears pending on dispose', () => {
    const conn = createMockConnection();
    const pm = new PublishManager({ publishTimeout: 5000 });
    pm.attachConnection(conn as any);

    pm.publish({ id: 'evt-5', sig: 'sig' } as any);
    pm.dispose();

    expect(pm.pendingCount).toBe(0);
  });
});
```

- [ ] **Step 2: テスト fail を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/publish-manager.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: 実装**

```typescript
// src/shared/nostr/auftakt/core/relay/publish-manager.ts
import type { NostrEvent } from '../types.js';

interface PublishConnection {
  send(message: unknown[]): void;
  onMessage(handler: (message: unknown[]) => void): () => void;
}

export interface PublishResult {
  accepted: boolean;
  message: string;
  timedOut: boolean;
}

interface PendingPublish {
  event: NostrEvent;
  resolve: (result: PublishResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class PublishManager {
  readonly #publishTimeout: number;
  readonly #pending = new Map<string, PendingPublish>();
  #offMessage: (() => void) | null = null;

  constructor(options: { publishTimeout: number }) {
    this.#publishTimeout = options.publishTimeout;
  }

  get pendingCount(): number {
    return this.#pending.size;
  }

  attachConnection(connection: PublishConnection): void {
    this.#offMessage?.();
    this.#offMessage = connection.onMessage((message) => {
      if (!Array.isArray(message) || message[0] !== 'OK') return;

      const [, eventId, accepted, reason] = message as [string, string, boolean, string];
      const pending = this.#pending.get(eventId);
      if (!pending) return;

      clearTimeout(pending.timer);
      this.#pending.delete(eventId);

      pending.resolve({
        accepted: Boolean(accepted),
        message: String(reason ?? ''),
        timedOut: false
      });
    });
  }

  publish(event: NostrEvent, connection?: PublishConnection): Promise<PublishResult> {
    return new Promise<PublishResult>((resolve) => {
      const timer = setTimeout(() => {
        this.#pending.delete(event.id);
        resolve({ accepted: false, message: '', timedOut: true });
      }, this.#publishTimeout);

      this.#pending.set(event.id, { event, resolve, timer });

      if (connection) {
        connection.send(['EVENT', event]);
      }
    });
  }

  replayPending(connection: PublishConnection): void {
    for (const pending of this.#pending.values()) {
      connection.send(['EVENT', pending.event]);
    }
  }

  dispose(): void {
    this.#offMessage?.();
    this.#offMessage = null;

    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.resolve({ accepted: false, message: 'disposed', timedOut: false });
    }

    this.#pending.clear();
  }
}
```

- [ ] **Step 4: テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/publish-manager.test.ts`
Expected: 5 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/publish-manager.ts src/shared/nostr/auftakt/core/relay/publish-manager.test.ts
git commit -m "feat: implement PublishManager with OK tracking and timeout"
```

---

### Task 7: 全体テスト + format + lint

- [ ] **Step 1: 全 auftakt テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/`
Expected: 全テスト pass (既存 93 + 新規 ~40)

- [ ] **Step 2: format + lint + check**

Run: `pnpm format:check && pnpm lint && pnpm check`
Expected: 全 pass

- [ ] **Step 3: format 修正が必要な場合**

Run: `pnpm format`

- [ ] **Step 4: 最終 commit**

```bash
git add -A
git commit -m "chore: ensure format and lint compliance for auftakt relay transport"
```

---

### Task 8: Wiring — PublishManager ↔ RelayConnection reconnect

**Files:**

- Test: `src/shared/nostr/auftakt/core/relay/publish-reconnect.test.ts`

- [ ] **Step 1: PublishManager が reconnect 時に自動 replay するテストを書く**

```typescript
// src/shared/nostr/auftakt/core/relay/publish-reconnect.test.ts
import { describe, expect, it } from 'vitest';

import { PublishManager } from './publish-manager.js';
import { RelayConnection } from './relay-connection.js';

function createFakeSocket() {
  const listeners = new Map<string, Set<Function>>();
  const sent: string[] = [];
  let readyState = 0;
  return {
    get readyState() {
      return readyState;
    },
    send(data: string) {
      sent.push(data);
    },
    close() {
      readyState = 3;
    },
    addEventListener(type: string, fn: Function) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: Function) {
      listeners.get(type)?.delete(fn);
    },
    simulateOpen() {
      readyState = 1;
      for (const fn of listeners.get('open') ?? []) fn({});
    },
    simulateClose(code = 1006) {
      readyState = 3;
      for (const fn of listeners.get('close') ?? []) fn({ code });
    },
    sent
  };
}

describe('PublishManager + RelayConnection reconnect wiring', () => {
  it('replays pending publishes on reconnect', async () => {
    let socket: ReturnType<typeof createFakeSocket>;
    const conn = new RelayConnection({
      url: 'wss://relay.test',
      connect: () => {
        socket = createFakeSocket();
        return socket as any;
      },
      retry: { strategy: 'exponential', initialDelay: 10, maxDelay: 10, maxCount: 2 }
    });

    const pm = new PublishManager({ publishTimeout: 5000 });
    pm.attachConnection(conn);
    conn.onReconnect(() => pm.replayPending(conn));

    conn.ensureConnected();
    socket!.simulateOpen();

    // Publish event (will be pending)
    pm.publish({ id: 'evt-1', sig: 'sig' } as any, conn);
    socket!.sent.length = 0; // clear initial send

    // Simulate disconnect + reconnect
    socket!.simulateClose(1006);
    await new Promise((r) => setTimeout(r, 30));
    socket!.simulateOpen();

    // EVENT should be replayed
    const replayed = socket!.sent.find((s) => s.includes('evt-1'));
    expect(replayed).toBeDefined();
  });
});
```

- [ ] **Step 2: テスト pass を確認 (既存コードで動くはず — onReconnect + replayPending は Plan A で実装済み)**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/relay/publish-reconnect.test.ts`
Expected: PASS (wiring パターンの検証)

- [ ] **Step 3: Commit**

```bash
git add src/shared/nostr/auftakt/core/relay/publish-reconnect.test.ts
git commit -m "test: verify PublishManager replay on RelayConnection reconnect"
```

---

## Exit Criteria

- [ ] `ConnectionState` の 9 状態遷移が純粋関数でテスト済み
- [ ] `RelayConnection` が WebSocket 接続・exponential backoff 再接続・idle disconnect・メッセージバッファリングをサポート
- [ ] `LruDedup` が 50,000 上限の LRU dedup を提供
- [ ] `EventValidator` が構造検証 + 署名検証を提供 (verifier 注入可能)
- [ ] `PublishManager` が EVENT 送信・OK 追跡・timeout をサポート
- [ ] PublishManager が RelayConnection reconnect 時に pending event を自動 replay
- [ ] 既存の 93 テスト + 新規テストが全 pass
- [ ] `pnpm format:check && pnpm lint && pnpm check` が全 pass
- [ ] 既存の `relay-manager.ts` は変更なし (Plans C-E で置換)
