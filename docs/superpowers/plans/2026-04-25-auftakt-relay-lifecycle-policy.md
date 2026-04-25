# Auftakt Relay Lifecycle Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add coordinator-safe relay lifecycle policy to `@auftakt/core` so default relays use lazy-keep behavior, temporary relays idle-disconnect, and forward streams reconnect through bounded backoff.

**Architecture:** Keep lifecycle execution inside `packages/core/src/relay-session.ts`, where WebSocket transport, replay, queueing, relay observation, and capability observation already meet. Add a small `relay-lifecycle.ts` vocabulary/helper module for policy normalization and reconnect delay calculation, then wire it into `RelaySession` without adding any public raw transport surface. `@auftakt/resonote` and `$shared/auftakt/resonote.ts` continue to observe normalized relay status through existing APIs.

**Tech Stack:** TypeScript, RxJS `Observable`/`Subject`, Vitest, fake `WebSocket`, `@auftakt/core` package exports.

---

## Scope Check

The approved handoff roadmap has four independent waves. This plan implements only Wave 1: Relay Lifecycle Policy.

This plan does not implement relay selection/outbox routing, entity handles, or NIP inventory refresh automation. It also does not redesign relay capability queue behavior; it uses the existing queue and capability observation hooks.

## File Structure

- Create `packages/core/src/relay-lifecycle.ts`
  - Owns relay lifecycle option types, defaults, normalization, and reconnect delay calculation.
- Create `packages/core/src/relay-lifecycle.contract.test.ts`
  - Locks default lazy-keep/lazy policy and bounded reconnect math.
- Modify `packages/core/src/index.ts`
  - Exports lifecycle types and helpers through the package root.
- Modify `packages/core/src/vocabulary.ts`
  - Adds normalized observation reasons for idle timeout, reconnect scheduling, and retry exhaustion.
- Modify `packages/core/src/relay-session.ts`
  - Stores per-relay lifecycle policy, marks default relays as `lazy-keep`, marks explicit non-default relays as `lazy`, schedules idle disconnect for lazy relays, and schedules bounded reconnect for unexpected closes.
- Modify `packages/core/src/relay-session.contract.test.ts`
  - Adds regression tests for default relay lazy-keep, temporary relay idle disconnect, delayed reconnect, retry-off behavior, and replay after reconnect.
- Modify `packages/core/src/public-api.contract.test.ts`
  - Locks package-root export availability for lifecycle helpers.

---

### Task 1: Add Relay Lifecycle Policy Model

**Files:**

- Create: `packages/core/src/relay-lifecycle.contract.test.ts`
- Create: `packages/core/src/relay-lifecycle.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/public-api.contract.test.ts`

- [ ] **Step 1: Write failing lifecycle model tests**

Create `packages/core/src/relay-lifecycle.contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  calculateRelayReconnectDelay,
  normalizeRelayLifecycleOptions,
  type RelayLifecycleRetryPolicy
} from './index.js';

describe('relay lifecycle policy model', () => {
  it('defaults session relays to lazy-keep and temporary relays to lazy idle disconnect', () => {
    const policy = normalizeRelayLifecycleOptions();

    expect(policy.defaultRelay).toMatchObject({
      mode: 'lazy-keep',
      idleDisconnectMs: 10_000,
      retry: {
        strategy: 'exponential',
        initialDelayMs: 0,
        maxDelayMs: 60_000,
        maxAttempts: Number.POSITIVE_INFINITY
      }
    });
    expect(policy.temporaryRelay).toMatchObject({
      mode: 'lazy',
      idleDisconnectMs: 10_000,
      retry: {
        strategy: 'exponential',
        initialDelayMs: 0,
        maxDelayMs: 60_000,
        maxAttempts: Number.POSITIVE_INFINITY
      }
    });
  });

  it('normalizes configured idle timeout and retry bounds', () => {
    const policy = normalizeRelayLifecycleOptions({
      idleDisconnectMs: 25,
      retry: {
        strategy: 'exponential',
        initialDelayMs: 50,
        maxDelayMs: 120,
        maxAttempts: 3
      }
    });

    expect(policy.defaultRelay.retry).toEqual({
      strategy: 'exponential',
      initialDelayMs: 50,
      maxDelayMs: 120,
      maxAttempts: 3
    });
    expect(policy.temporaryRelay.idleDisconnectMs).toBe(25);
  });

  it('calculates bounded reconnect delays', () => {
    const retry: RelayLifecycleRetryPolicy = {
      strategy: 'exponential',
      initialDelayMs: 50,
      maxDelayMs: 120,
      maxAttempts: 3
    };

    expect(calculateRelayReconnectDelay(1, retry)).toBe(50);
    expect(calculateRelayReconnectDelay(2, retry)).toBe(100);
    expect(calculateRelayReconnectDelay(3, retry)).toBe(120);
    expect(calculateRelayReconnectDelay(4, retry)).toBeNull();
  });

  it('returns null when reconnect strategy is off', () => {
    expect(
      calculateRelayReconnectDelay(1, {
        strategy: 'off',
        initialDelayMs: 50,
        maxDelayMs: 120,
        maxAttempts: 3
      })
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused lifecycle model test and confirm failure**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-lifecycle.contract.test.ts
```

Expected: FAIL because `relay-lifecycle.ts` and its package-root exports do not exist.

- [ ] **Step 3: Add lifecycle policy implementation**

Create `packages/core/src/relay-lifecycle.ts`:

```ts
export type RelayLifecycleMode = 'lazy' | 'lazy-keep';
export type RelayReconnectStrategy = 'exponential' | 'off';

export interface RelayLifecycleRetryOptions {
  readonly strategy?: RelayReconnectStrategy;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly maxAttempts?: number;
}

export interface RelayLifecycleRetryPolicy {
  readonly strategy: RelayReconnectStrategy;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly maxAttempts: number;
}

export interface RelayLifecycleOptions {
  readonly idleDisconnectMs?: number;
  readonly retry?: RelayLifecycleRetryOptions;
}

export interface RelayLifecyclePolicy {
  readonly mode: RelayLifecycleMode;
  readonly idleDisconnectMs: number;
  readonly retry: RelayLifecycleRetryPolicy;
}

export interface NormalizedRelayLifecycleOptions {
  readonly defaultRelay: RelayLifecyclePolicy;
  readonly temporaryRelay: RelayLifecyclePolicy;
}

const DEFAULT_IDLE_DISCONNECT_MS = 10_000;
const DEFAULT_RECONNECT_INITIAL_DELAY_MS = 0;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 60_000;

export function normalizeRelayLifecycleOptions(
  options: RelayLifecycleOptions = {}
): NormalizedRelayLifecycleOptions {
  const idleDisconnectMs = normalizePositiveMs(
    options.idleDisconnectMs,
    DEFAULT_IDLE_DISCONNECT_MS
  );
  const retry = normalizeRetryPolicy(options.retry);

  return {
    defaultRelay: {
      mode: 'lazy-keep',
      idleDisconnectMs,
      retry
    },
    temporaryRelay: {
      mode: 'lazy',
      idleDisconnectMs,
      retry
    }
  };
}

export function calculateRelayReconnectDelay(
  attempt: number,
  retry: RelayLifecycleRetryPolicy
): number | null {
  if (retry.strategy === 'off') return null;
  if (!Number.isFinite(attempt) || attempt < 1) return retry.initialDelayMs;
  if (attempt > retry.maxAttempts) return null;

  const exponentialDelay = retry.initialDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(retry.maxDelayMs, exponentialDelay);
}

function normalizeRetryPolicy(
  options: RelayLifecycleRetryOptions | undefined
): RelayLifecycleRetryPolicy {
  return {
    strategy: options?.strategy ?? 'exponential',
    initialDelayMs: normalizeNonNegativeMs(
      options?.initialDelayMs,
      DEFAULT_RECONNECT_INITIAL_DELAY_MS
    ),
    maxDelayMs: normalizePositiveMs(options?.maxDelayMs, DEFAULT_RECONNECT_MAX_DELAY_MS),
    maxAttempts: normalizeMaxAttempts(options?.maxAttempts)
  };
}

function normalizePositiveMs(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return fallback;
  return Math.floor(value);
}

function normalizeNonNegativeMs(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

function normalizeMaxAttempts(value: number | undefined): number {
  if (typeof value !== 'number') return Number.POSITIVE_INFINITY;
  if (value === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(value) || value < 0) return Number.POSITIVE_INFINITY;
  return Math.floor(value);
}
```

- [ ] **Step 4: Export lifecycle policy types and helpers**

In `packages/core/src/index.ts`, add this export block after the relay capability exports:

```ts
export type {
  NormalizedRelayLifecycleOptions,
  RelayLifecycleMode,
  RelayLifecycleOptions,
  RelayLifecyclePolicy,
  RelayLifecycleRetryOptions,
  RelayLifecycleRetryPolicy,
  RelayReconnectStrategy
} from './relay-lifecycle.js';
export { calculateRelayReconnectDelay, normalizeRelayLifecycleOptions } from './relay-lifecycle.js';
```

- [ ] **Step 5: Lock public API exports**

In `packages/core/src/public-api.contract.test.ts`, extend the `expected package-root names` assertion:

```ts
expect(mod).toEqual(
  expect.objectContaining({
    buildRequestExecutionPlan: expect.any(Function),
    calculateRelayReconnectDelay: expect.any(Function),
    createRuntimeRequestKey: expect.any(Function),
    createRxNostrSession: expect.any(Function),
    filterNegentropyEventRefs: expect.any(Function),
    normalizeRelayLifecycleOptions: expect.any(Function),
    reconcileReplayRepairSubjects: expect.any(Function),
    reduceReadSettlement: expect.any(Function),
    validateRelayEvent: expect.any(Function)
  })
);
```

- [ ] **Step 6: Run lifecycle model and public API tests**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-lifecycle.contract.test.ts packages/core/src/public-api.contract.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add packages/core/src/relay-lifecycle.ts packages/core/src/relay-lifecycle.contract.test.ts packages/core/src/index.ts packages/core/src/public-api.contract.test.ts
git commit -m "feat(auftakt): add relay lifecycle policy model"
```

Expected: commit includes only the lifecycle model, exports, and tests.

---

### Task 2: Add Session Lifecycle Contracts

**Files:**

- Modify: `packages/core/src/vocabulary.ts`
- Modify: `packages/core/src/relay-session.contract.test.ts`
- Modify in Task 3: `packages/core/src/relay-session.ts`

- [ ] **Step 1: Add observation reasons for lifecycle policy**

In `packages/core/src/vocabulary.ts`, replace `RelayObservationReason` with:

```ts
export type RelayObservationReason =
  | 'boot'
  | 'connecting'
  | 'opened'
  | 'disconnected'
  | 'connect-failed'
  | 'idle-timeout'
  | 'reconnect-scheduled'
  | 'retry-exhausted'
  | 'replay-started'
  | 'replay-finished'
  | 'replay-failed'
  | 'disposed';
```

- [ ] **Step 2: Update relay-session test imports and constants**

In `packages/core/src/relay-session.contract.test.ts`, change the Vitest import to include `vi`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
```

Add this constant after `RELAY_B_URL`:

```ts
const TEMP_RELAY_URL = 'wss://relay-temp.contract.test';
```

In the existing `afterEach`, add `vi.useRealTimers();` before restoring `WebSocket`:

```ts
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    writable: true,
    value: originalWebSocket
  });
});
```

- [ ] **Step 3: Add failing lazy-keep and temporary idle tests**

Append these tests inside the existing `describe('relay replay request identity contract', () => { ... })` block, after the current `aggregate session becomes degraded when all relays disconnect` test:

```ts
it('keeps default relays open after backward request completion', async () => {
  const session = createRxNostrSession({
    defaultRelays: [RELAY_URL],
    eoseTimeout: 100,
    relayLifecycle: {
      idleDisconnectMs: 10,
      retry: { strategy: 'off' }
    }
  });
  const req = createRxBackwardReq({
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

it('idle-disconnects temporary relays after backward request completion', async () => {
  const session = createRxNostrSession({
    defaultRelays: [RELAY_URL],
    eoseTimeout: 100,
    relayLifecycle: {
      idleDisconnectMs: 10,
      retry: { strategy: 'off' }
    }
  });
  const req = createRxBackwardReq({
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
```

- [ ] **Step 4: Add failing reconnect/backoff tests**

Append these tests after the temporary idle test:

```ts
it('reconnects forward streams only after configured backoff delay', async () => {
  vi.useFakeTimers();
  const session = createRxNostrSession({
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
  const req = createRxForwardReq({
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
  const session = createRxNostrSession({
    defaultRelays: [RELAY_URL],
    eoseTimeout: 100,
    relayLifecycle: {
      retry: { strategy: 'off' }
    }
  });
  const req = createRxForwardReq({
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
```

- [ ] **Step 5: Run relay-session tests and confirm failure**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-session.contract.test.ts
```

Expected: FAIL because `CreateRelaySessionOptions` does not accept `relayLifecycle`, temporary relays do not idle-disconnect, and reconnect is still immediate/session-driven.

- [ ] **Step 6: Commit only the failing contracts**

Run:

```bash
git add packages/core/src/vocabulary.ts packages/core/src/relay-session.contract.test.ts
git commit -m "test(auftakt): specify relay lifecycle session policy"
```

Expected: commit succeeds with failing contracts that the next task makes pass.

---

### Task 3: Wire Lifecycle Policy Into Relay Session

**Files:**

- Modify: `packages/core/src/relay-session.ts`

- [ ] **Step 1: Import lifecycle helpers**

At the top of `packages/core/src/relay-session.ts`, add this import after the RxJS import:

```ts
import {
  calculateRelayReconnectDelay,
  normalizeRelayLifecycleOptions,
  type NormalizedRelayLifecycleOptions,
  type RelayLifecycleMode,
  type RelayLifecycleOptions,
  type RelayLifecyclePolicy
} from './relay-lifecycle.js';
```

- [ ] **Step 2: Extend session options**

Replace `CreateRelaySessionOptions` with:

```ts
export interface CreateRelaySessionOptions {
  readonly defaultRelays: readonly string[];
  readonly eoseTimeout?: number;
  readonly requestOptimizer?: RelayRequestOptimizerOptions;
  readonly relayLifecycle?: RelayLifecycleOptions;
}
```

- [ ] **Step 3: Replace `RelaySocket` with lifecycle-aware implementation**

Replace the entire `RelaySocket` class in `packages/core/src/relay-session.ts` with:

```ts
class RelaySocket {
  private ws: WebSocket | undefined;
  private connectPromise: Promise<WebSocket> | undefined;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly queue: unknown[] = [];
  private intentionalCloseReason: RelayObservationReason | undefined;
  private reconnectAttempts = 0;
  state: RelayConnectionState = 'idle';

  constructor(
    readonly url: string,
    private readonly getPolicy: () => RelayLifecyclePolicy,
    private readonly onMessage: (from: string, message: unknown) => void,
    private readonly onStateChange: (
      from: string,
      state: RelayConnectionState,
      reason?: RelayObservationReason
    ) => void
  ) {}

  async connect(): Promise<WebSocket> {
    this.cancelIdleTimer();
    this.cancelReconnectTimer();
    if (this.ws?.readyState === WebSocket.OPEN) return this.ws;
    if (this.connectPromise) return this.connectPromise;

    this.setState('connecting', 'connecting');
    this.connectPromise = new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(this.url);
      let opened = false;

      ws.addEventListener('open', () => {
        opened = true;
        this.ws = ws;
        this.connectPromise = undefined;
        this.intentionalCloseReason = undefined;
        this.reconnectAttempts = 0;
        this.setState('open', 'opened');
        this.flushQueue();
        resolve(ws);
      });

      ws.addEventListener('message', (event) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        try {
          this.onMessage(this.url, JSON.parse(raw));
        } catch {
          // ignore malformed packets
        }
      });

      ws.addEventListener('error', (error) => {
        if (!opened) {
          this.connectPromise = undefined;
          this.ws = undefined;
          this.setState('degraded', 'connect-failed');
          reject(error);
        }
      });

      ws.addEventListener('close', () => {
        this.ws = undefined;
        this.connectPromise = undefined;
        const reason = this.intentionalCloseReason;
        this.intentionalCloseReason = undefined;

        if (reason === 'idle-timeout') {
          this.setState('idle', 'idle-timeout');
          return;
        }

        if (reason) {
          this.setState('closed', reason);
          return;
        }

        if (opened) {
          this.scheduleReconnect();
          return;
        }

        this.setState('closed', 'connect-failed');
      });
    });

    return this.connectPromise;
  }

  async send(payload: unknown): Promise<void> {
    this.cancelIdleTimer();
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.queue.push(payload);
      await this.connect();
      return;
    }
    this.ws.send(JSON.stringify(payload));
  }

  scheduleIdleDisconnect(): void {
    const policy = this.getPolicy();
    if (policy.mode !== 'lazy') return;
    if (this.state !== 'open') return;
    if (this.idleTimer) return;

    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.intentionalCloseReason = 'idle-timeout';
        this.ws.close();
        return;
      }
      this.ws = undefined;
      this.connectPromise = undefined;
      this.setState('idle', 'idle-timeout');
    }, policy.idleDisconnectMs);
  }

  close(reason: RelayObservationReason = 'disposed'): void {
    this.cancelIdleTimer();
    this.cancelReconnectTimer();
    this.queue.splice(0);
    this.intentionalCloseReason = reason;

    if (this.ws) {
      this.ws.close();
      return;
    }

    this.ws = undefined;
    this.connectPromise = undefined;
    this.setState('closed', reason);
  }

  private scheduleReconnect(): void {
    const policy = this.getPolicy();
    const attempt = this.reconnectAttempts + 1;
    const delay = calculateRelayReconnectDelay(attempt, policy.retry);
    if (delay === null) {
      this.reconnectAttempts = attempt;
      this.setState('degraded', 'retry-exhausted');
      return;
    }

    this.reconnectAttempts = attempt;
    this.setState('backoff', 'reconnect-scheduled');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect().catch(() => {});
    }, delay);
  }

  private flushQueue(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    for (const payload of this.queue.splice(0)) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private cancelIdleTimer(): void {
    if (!this.idleTimer) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  private cancelReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private setState(next: RelayConnectionState, reason?: RelayObservationReason): void {
    this.state = next;
    this.onStateChange(this.url, next, reason);
  }
}
```

- [ ] **Step 4: Add lifecycle fields to `RelaySession`**

Inside `class RelaySession`, after the existing `relayCapabilities` field, add:

```ts
  private readonly relayLifecyclePolicies = new Map<string, RelayLifecyclePolicy>();
  private readonly relayLifecycleOptions: NormalizedRelayLifecycleOptions;
```

- [ ] **Step 5: Normalize lifecycle options in the constructor**

Replace the `RelaySession` constructor with:

```ts
  constructor(
    private readonly eoseTimeout: number,
    defaultRelays: readonly string[],
    private readonly requestOptimizer: RelayRequestOptimizerOptions,
    relayLifecycle: RelayLifecycleOptions = {}
  ) {
    this.relayLifecycleOptions = normalizeRelayLifecycleOptions(relayLifecycle);
    this.setDefaultRelays([...defaultRelays]);
    this.setRelayCapabilities(requestOptimizer.relayCapabilities ?? {});
    this.capabilityLearningHandler = requestOptimizer.onCapabilityLearned;
  }
```

- [ ] **Step 6: Make `setDefaultRelays()` register lazy-keep policies**

Inside `setDefaultRelays`, after `next.set(relay, { url: relay, read: true, write: true });`, add:

```ts
this.registerRelayLifecyclePolicy(relay, 'lazy-keep');
```

Inside the loop that closes removed connections, after `connection.close();`, add:

```ts
this.relayLifecyclePolicies.delete(url);
```

- [ ] **Step 7: Add lifecycle helper methods to `RelaySession`**

Add these private methods before `getConnection(url: string)`:

```ts
  private registerRelayLifecyclePolicy(url: string, mode: RelayLifecycleMode): void {
    const current = this.relayLifecyclePolicies.get(url);
    if (current?.mode === 'lazy-keep') return;
    if (current?.mode === mode) return;

    const policy =
      mode === 'lazy-keep'
        ? this.relayLifecycleOptions.defaultRelay
        : this.relayLifecycleOptions.temporaryRelay;
    this.relayLifecyclePolicies.set(url, policy);
  }

  private getRelayLifecyclePolicy(url: string): RelayLifecyclePolicy {
    const existing = this.relayLifecyclePolicies.get(url);
    if (existing) return existing;
    this.relayLifecyclePolicies.set(url, this.relayLifecycleOptions.temporaryRelay);
    return this.relayLifecycleOptions.temporaryRelay;
  }

  private maybeScheduleIdleDisconnect(relayUrl: string): void {
    const policy = this.getRelayLifecyclePolicy(relayUrl);
    if (policy.mode !== 'lazy') return;
    if (this.countActiveSubscriptions(relayUrl) > 0) return;
    if (this.countQueuedShards(relayUrl) > 0) return;
    if ((this.relayNeedsReplay.get(relayUrl)?.size ?? 0) > 0) return;

    this.connections.get(relayUrl)?.scheduleIdleDisconnect();
  }
```

- [ ] **Step 8: Update `getConnection()` for policy-aware sockets**

Replace `getConnection(url: string)` with:

```ts
  private getConnection(url: string): RelaySocket {
    let connection = this.connections.get(url);
    if (!connection) {
      connection = new RelaySocket(
        url,
        () => this.getRelayLifecyclePolicy(url),
        (from, message) => this.messages.next({ from, message }),
        (from, state, explicitReason) => {
          const reason =
            explicitReason ??
            (state === 'connecting'
              ? 'connecting'
              : state === 'open'
                ? 'opened'
                : state === 'degraded'
                  ? 'connect-failed'
                  : 'disconnected');
          this.updateRelayObservation(from, state, reason);
        }
      );
      this.connections.set(url, connection);
      this.updateRelayObservation(url, 'idle', 'boot');
    }
    return connection;
  }
```

- [ ] **Step 9: Register explicit relay selections as lazy temporary relays**

In `resolveReadRelays`, replace the final explicit relay loop with:

```ts
for (const relay of selection?.relays ?? []) {
  this.registerRelayLifecyclePolicy(relay, this.defaultRelays.has(relay) ? 'lazy-keep' : 'lazy');
  urls.add(relay);
}
```

In `resolveWriteRelays`, replace the final explicit relay loop with:

```ts
for (const relay of selection?.relays ?? []) {
  this.registerRelayLifecyclePolicy(relay, this.defaultRelays.has(relay) ? 'lazy-keep' : 'lazy');
  urls.add(relay);
}
```

- [ ] **Step 10: Stop session code from bypassing backoff**

In the forward branch of the `stateSub` inside `getOrCreateRequestGroup`, replace this block:

```ts
if (packet.state === 'backoff' || packet.state === 'closed' || packet.state === 'degraded') {
  this.markRelayNeedsReplay(packet.from, group.groupKey);
  void this.getConnection(packet.from)
    .connect()
    .catch(() => {});
  return;
}
```

with:

```ts
if (packet.state === 'backoff' || packet.state === 'closed' || packet.state === 'degraded') {
  this.markRelayNeedsReplay(packet.from, group.groupKey);
  return;
}
```

- [ ] **Step 11: Schedule temporary idle disconnect after relay work drains**

Add `this.maybeScheduleIdleDisconnect(relayUrl);` at the end of each of these methods, after the existing `this.publishRelayCapability(relayUrl);` call:

```ts
  private async closeRelayTransport(group: ActiveRequestGroup, relayUrl: string): Promise<void>
  private dropRelayPendingSubIds(group: ActiveRequestGroup, relayUrl: string): void
  private releaseRelaySubId(group: ActiveRequestGroup, relayUrl: string, subId: string): void
```

In `teardownRequestGroup`, inside the loop over `group.transportSubIds.entries()`, add this line after `this.publishRelayCapability(relayUrl);`:

```ts
this.maybeScheduleIdleDisconnect(relayUrl);
```

- [ ] **Step 12: Pass lifecycle options into `RelaySession`**

Replace `createRelaySession()` with:

```ts
export function createRelaySession(options: CreateRelaySessionOptions): RxNostr {
  return new RelaySession(
    options.eoseTimeout ?? 10_000,
    options.defaultRelays,
    options.requestOptimizer ?? {},
    options.relayLifecycle
  );
}
```

- [ ] **Step 13: Run relay-session tests**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-session.contract.test.ts
```

Expected: PASS. Existing replay tests should still pass because default reconnect delay is `0`, while the new configured-delay test proves bounded backoff behavior.

- [ ] **Step 14: Commit Task 3**

Run:

```bash
git add packages/core/src/relay-session.ts
git commit -m "feat(auftakt): apply relay lifecycle policy in sessions"
```

Expected: commit includes only `relay-session.ts`.

---

### Task 4: Lock Observation Compatibility And Strict Surface

**Files:**

- Modify: `packages/core/src/relay-observation.contract.test.ts`
- Modify: `packages/core/src/relay-session.contract.test.ts`

- [ ] **Step 1: Add observation normalization coverage for idle timeout**

In `packages/core/src/relay-observation.contract.test.ts`, append this assertion to the existing `marks backoff, closed, and degraded relay states as degraded observations` test:

```ts
expect(normalizeRelayObservation('wss://relay.test', 'idle', 'idle-timeout')).toMatchObject({
  connection: 'idle',
  degraded: false,
  reason: 'idle-timeout'
});
```

- [ ] **Step 2: Add capability observation coverage for idle disconnect**

Append this test inside the `relay replay request identity contract` describe block in `packages/core/src/relay-session.contract.test.ts`:

```ts
it('emits normalized capability state after temporary relay idle disconnect', async () => {
  const session = createRxNostrSession({
    defaultRelays: [RELAY_URL],
    eoseTimeout: 100,
    relayLifecycle: {
      idleDisconnectMs: 10,
      retry: { strategy: 'off' }
    }
  });
  const req = createRxBackwardReq({
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
```

- [ ] **Step 3: Run observation and session tests**

Run:

```bash
pnpm exec vitest run packages/core/src/relay-observation.contract.test.ts packages/core/src/relay-session.contract.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run strict closure guard**

Run:

```bash
pnpm run check:auftakt:strict-closure
```

Expected: PASS. This lifecycle work must not expose raw relay sessions through package or app-facing surfaces.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add packages/core/src/relay-observation.contract.test.ts packages/core/src/relay-session.contract.test.ts
git commit -m "test(auftakt): lock relay lifecycle observations"
```

Expected: commit includes only observation-related tests.

---

### Task 5: Final Verification

**Files:**

- No code changes expected.

- [ ] **Step 1: Run core package tests**

Run:

```bash
pnpm run test:auftakt:core
```

Expected: PASS.

- [ ] **Step 2: Run dependent Auftakt package tests**

Run:

```bash
pnpm run test:auftakt:resonote
```

Expected: PASS. Resonote should continue to observe relay state through existing normalized status APIs.

- [ ] **Step 3: Run strict guards**

Run:

```bash
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
```

Expected: both commands PASS.

- [ ] **Step 4: Run type check**

Run:

```bash
pnpm run check
```

Expected: PASS.

- [ ] **Step 5: Inspect git status**

Run:

```bash
git status --short
```

Expected: only unrelated pre-existing workspace changes remain. The lifecycle implementation commits should already be complete.

## Plan Self-Review

Spec coverage:

- Default relays use lazy-keep behavior: Task 2 and Task 3.
- Temporary relays use lazy idle disconnect: Task 2 and Task 3.
- Failed forward relays reconnect through bounded backoff: Task 2 and Task 3.
- Lifecycle state remains normalized relay status/capability observation: Task 4.
- Strict coordinator boundary remains intact: Task 4 and Task 5.

No placeholder sections remain in this plan. Type names introduced in Task 1 are reused consistently in Task 3. The plan intentionally excludes relay routing, entity handles, and NIP automation because those are separate roadmap waves.
