# Auftakt Security Ingress Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure no relay EVENT reaches storage, plugins, or public APIs until it passes NIP-01 shape validation, event id recomputation, and Schnorr signature verification.

**Architecture:** Add a small core validator and a coordinator ingress wrapper. Relay transport can still parse packets, but only the ingress wrapper may call materialization or emit to consumers.

**Tech Stack:** TypeScript, Vitest, `@auftakt/core`, `@auftakt/resonote`, `@noble/curves`, `nostr-typedef`

---

## File Structure

- Create: `packages/core/src/event-validation.ts`
  - Owns relay event shape validation and verification result vocabulary.
- Create: `packages/core/src/event-validation.contract.test.ts`
  - Locks valid, invalid-id, invalid-signature, and malformed event behavior.
- Modify: `packages/core/src/index.ts`
  - Exports validator vocabulary.
- Create: `packages/resonote/src/event-ingress.ts`
  - Applies validator before materialization callbacks.
- Create: `packages/resonote/src/event-ingress.contract.test.ts`
  - Proves invalid relay events are quarantined and not emitted.
- Modify: `packages/resonote/src/runtime.ts`
  - Routes relay packets through `ingestRelayEvent()` in existing materializing read paths.

### Task 1: Add Core Event Validation

**Files:**

- Create: `packages/core/src/event-validation.ts`
- Create: `packages/core/src/event-validation.contract.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing validation contract test**

```ts
import { finalizeEvent } from './crypto.js';
import { validateRelayEvent } from './event-validation.js';

describe('validateRelayEvent', () => {
  it('accepts a finalized event', async () => {
    const secret = new Uint8Array(32);
    secret[31] = 1;
    const event = finalizeEvent({ kind: 1, created_at: 1, tags: [], content: 'hello' }, secret);

    await expect(validateRelayEvent(event)).resolves.toEqual({ ok: true, event });
  });

  it('rejects an event with a mismatched id', async () => {
    const secret = new Uint8Array(32);
    secret[31] = 1;
    const event = finalizeEvent({ kind: 1, created_at: 1, tags: [], content: 'hello' }, secret);

    await expect(validateRelayEvent({ ...event, id: '0'.repeat(64) })).resolves.toEqual({
      ok: false,
      reason: 'invalid-id'
    });
  });

  it('rejects malformed relay input', async () => {
    await expect(validateRelayEvent({ id: 'x' })).resolves.toEqual({
      ok: false,
      reason: 'malformed'
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm exec vitest run packages/core/src/event-validation.contract.test.ts`  
Expected: FAIL because `event-validation.ts` does not exist.

- [ ] **Step 3: Implement the validator**

```ts
import type { Event as NostrEvent } from 'nostr-typedef';
import { verifier } from './crypto.js';

export type RelayEventValidationFailureReason = 'malformed' | 'invalid-id' | 'invalid-signature';

export type RelayEventValidationResult =
  | { readonly ok: true; readonly event: NostrEvent }
  | { readonly ok: false; readonly reason: RelayEventValidationFailureReason };

function isHex(value: string, length: number): boolean {
  return value.length === length && /^[0-9a-f]+$/i.test(value);
}

function isStringTagArray(value: unknown): value is string[][] {
  return (
    Array.isArray(value) &&
    value.every((tag) => Array.isArray(tag) && tag.every((part) => typeof part === 'string'))
  );
}

export async function validateRelayEvent(input: unknown): Promise<RelayEventValidationResult> {
  const event = input as Partial<NostrEvent>;
  if (
    typeof event !== 'object' ||
    event === null ||
    typeof event.id !== 'string' ||
    typeof event.pubkey !== 'string' ||
    typeof event.sig !== 'string' ||
    typeof event.kind !== 'number' ||
    typeof event.created_at !== 'number' ||
    typeof event.content !== 'string' ||
    !isStringTagArray(event.tags)
  ) {
    return { ok: false, reason: 'malformed' };
  }

  if (!isHex(event.id, 64) || !isHex(event.pubkey, 64) || !isHex(event.sig, 128)) {
    return { ok: false, reason: 'malformed' };
  }

  const ok = await verifier(event);
  if (!ok) return { ok: false, reason: 'invalid-signature' };
  return { ok: true, event: event as NostrEvent };
}
```

- [ ] **Step 4: Export the validator**

Add to `packages/core/src/index.ts`:

```ts
export * from './event-validation.js';
```

- [ ] **Step 5: Run core validation tests**

Run: `pnpm exec vitest run packages/core/src/event-validation.contract.test.ts packages/core/src/public-api.contract.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/event-validation.ts packages/core/src/event-validation.contract.test.ts packages/core/src/index.ts
git commit -m "feat: add auftakt relay event validation gate"
```

### Task 2: Add Coordinator Ingress Wrapper

**Files:**

- Create: `packages/resonote/src/event-ingress.ts`
- Create: `packages/resonote/src/event-ingress.contract.test.ts`

- [ ] **Step 1: Write the failing ingress test**

```ts
import { ingestRelayEvent } from './event-ingress.js';

describe('ingestRelayEvent', () => {
  it('quarantines invalid relay events and does not materialize them', async () => {
    const materialize = vi.fn();
    const quarantine = vi.fn();

    const result = await ingestRelayEvent({
      relayUrl: 'wss://relay.example',
      event: { id: 'bad' },
      materialize,
      quarantine
    });

    expect(result).toEqual({ ok: false, reason: 'malformed' });
    expect(materialize).not.toHaveBeenCalled();
    expect(quarantine).toHaveBeenCalledWith({
      relayUrl: 'wss://relay.example',
      eventId: 'bad',
      reason: 'malformed',
      rawEvent: { id: 'bad' }
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm exec vitest run packages/resonote/src/event-ingress.contract.test.ts`  
Expected: FAIL because `event-ingress.ts` does not exist.

- [ ] **Step 3: Implement ingress wrapper**

```ts
import { validateRelayEvent, type RelayEventValidationFailureReason } from '@auftakt/core';
import type { Event as NostrEvent } from 'nostr-typedef';

export interface QuarantineRecord {
  readonly relayUrl: string;
  readonly eventId: string | null;
  readonly reason: RelayEventValidationFailureReason;
  readonly rawEvent: unknown;
}

export async function ingestRelayEvent(input: {
  readonly relayUrl: string;
  readonly event: unknown;
  readonly materialize: (event: NostrEvent, relayUrl: string) => Promise<boolean>;
  readonly quarantine: (record: QuarantineRecord) => Promise<void> | void;
}): Promise<
  | { ok: true; event: NostrEvent; stored: boolean }
  | { ok: false; reason: RelayEventValidationFailureReason }
> {
  const validation = await validateRelayEvent(input.event);
  if (!validation.ok) {
    await input.quarantine({
      relayUrl: input.relayUrl,
      eventId:
        typeof (input.event as { id?: unknown })?.id === 'string'
          ? (input.event as { id: string }).id
          : null,
      reason: validation.reason,
      rawEvent: input.event
    });
    return validation;
  }

  const stored = await input.materialize(validation.event, input.relayUrl);
  return { ok: true, event: validation.event, stored };
}
```

- [ ] **Step 4: Run ingress test**

Run: `pnpm exec vitest run packages/resonote/src/event-ingress.contract.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/resonote/src/event-ingress.ts packages/resonote/src/event-ingress.contract.test.ts
git commit -m "feat: gate relay events before materialization"
```

### Task 3: Route Existing Materializing Reads Through Ingress

**Files:**

- Modify: `packages/resonote/src/runtime.ts`
- Test: `packages/resonote/src/event-ingress.contract.test.ts`

- [ ] **Step 1: Add a regression test for read-path invalid event rejection**

Append to `packages/resonote/src/event-ingress.contract.test.ts`:

```ts
it('returns false from materialization when validation fails', async () => {
  const materialized: unknown[] = [];
  const quarantined: unknown[] = [];

  const result = await ingestRelayEvent({
    relayUrl: 'wss://relay.example',
    event: { id: 'bad' },
    materialize: async (event) => {
      materialized.push(event);
      return true;
    },
    quarantine: (record) => {
      quarantined.push(record);
    }
  });

  expect(result.ok).toBe(false);
  expect(materialized).toEqual([]);
  expect(quarantined).toHaveLength(1);
});
```

- [ ] **Step 2: Use `ingestRelayEvent()` in runtime materializing callbacks**

In `packages/resonote/src/runtime.ts`, replace direct `materializeIncomingEvent(runtime, packet.event)` calls in read paths with:

```ts
const result = await ingestRelayEvent({
  relayUrl: typeof packet.from === 'string' ? packet.from : '',
  event: packet.event,
  materialize: (event) => materializeIncomingEvent(runtime, event),
  quarantine: async () => {}
});
const accepted = result.ok && result.stored;
```

If the packet type currently lacks `from`, extend local packet casts to `{ event: StoredEvent; from?: string }`.

- [ ] **Step 3: Run package tests**

Run: `pnpm exec vitest run packages/resonote/src/event-ingress.contract.test.ts packages/resonote/src/public-api.contract.test.ts`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/resonote/src/runtime.ts packages/resonote/src/event-ingress.contract.test.ts
git commit -m "fix: enforce relay ingress validation in resonote reads"
```
