# auftakt Publishable + Signer 補完パススルー 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** auftakt の send/cast が Draft と署名済み NostrEvent の両方を受け付けるようにし、signer を rx-nostr 同等の補完パススルー方式に変更し、castSigned / publishSignedEvent から rx-nostr 依存を除去する。

**Architecture:** signer が「足りないフィールドを補完 → 全フィールドが揃っていればパススルー」を一手に引き受ける。`#publish()` は署名の詳細を知らず、入力をそのまま signer に渡す。castSigned / publishSignedEvent は auftakt session 一本化。

**Tech Stack:** TypeScript, Svelte 5, vitest, nostr-tools/pure

---

## File Structure

| ファイル                                                 | 責務                                                    |
| -------------------------------------------------------- | ------------------------------------------------------- |
| `src/shared/nostr/auftakt/core/types.ts`                 | `Publishable` 型 + `ensureEventFields()` 定義           |
| `src/shared/nostr/auftakt/core/signers/nip07-signer.ts`  | NIP-07 signer: pubkey/created_at/tags 補完 + パススルー |
| `src/shared/nostr/auftakt/core/signers/seckey-signer.ts` | 秘密鍵 signer: パススルーガード追加                     |
| `src/shared/nostr/auftakt/core/signers/noop-signer.ts`   | 変更なし                                                |
| `src/shared/nostr/auftakt/core/models/session.ts`        | send/cast → Publishable、#publish() 簡素化              |
| `src/shared/nostr/client.ts`                             | castSigned: rx-nostr 除去                               |
| `src/shared/nostr/publish-signed.ts`                     | publishSignedEvent/publishSignedEvents: rx-nostr 除去   |
| `src/shared/nostr/gateway.ts`                            | re-export 型更新                                        |
| `docs/auftakt/spec.md`                                   | §3.4, §3.6, §9.8, §14.2 更新                            |

---

### Task 1: `ensureEventFields` + `Publishable` 型を types.ts に追加

**Files:**

- Modify: `src/shared/nostr/auftakt/core/types.ts`
- Create: `src/shared/nostr/auftakt/core/ensure-event-fields.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/shared/nostr/auftakt/core/ensure-event-fields.test.ts
import { describe, expect, it } from 'vitest';

import { ensureEventFields } from './types.js';

describe('ensureEventFields', () => {
  const validEvent = {
    id: 'abc123',
    pubkey: 'pub123',
    created_at: 1700000000,
    kind: 1,
    tags: [['p', 'someone']],
    content: 'hello',
    sig: 'sig123'
  };

  it('returns true for a complete event', () => {
    expect(ensureEventFields(validEvent)).toBe(true);
  });

  it('returns false when id is missing', () => {
    const { id: _, ...rest } = validEvent;
    expect(ensureEventFields(rest)).toBe(false);
  });

  it('returns false when sig is missing', () => {
    const { sig: _, ...rest } = validEvent;
    expect(ensureEventFields(rest)).toBe(false);
  });

  it('returns false when kind is missing', () => {
    const { kind: _, ...rest } = validEvent;
    expect(ensureEventFields(rest)).toBe(false);
  });

  it('returns false when pubkey is missing', () => {
    const { pubkey: _, ...rest } = validEvent;
    expect(ensureEventFields(rest)).toBe(false);
  });

  it('returns false when content is missing', () => {
    const { content: _, ...rest } = validEvent;
    expect(ensureEventFields(rest)).toBe(false);
  });

  it('returns false when created_at is missing', () => {
    const { created_at: _, ...rest } = validEvent;
    expect(ensureEventFields(rest)).toBe(false);
  });

  it('returns false when tags is not an array', () => {
    expect(ensureEventFields({ ...validEvent, tags: 'not-array' })).toBe(false);
  });

  it('returns false when a tag element is an object', () => {
    expect(ensureEventFields({ ...validEvent, tags: [['p', { nested: true }]] })).toBe(false);
  });

  it('returns false when a tag is not an array', () => {
    expect(ensureEventFields({ ...validEvent, tags: ['not-an-array'] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/nostr/auftakt/core/ensure-event-fields.test.ts`
Expected: FAIL — `ensureEventFields` is not exported from `./types.js`

- [ ] **Step 3: Add `ensureEventFields` and `Publishable` type to types.ts**

Add the following at the end of `src/shared/nostr/auftakt/core/types.ts`:

```typescript
export type Publishable = { kind: number; content: string; tags: string[][] } | NostrEvent;

export function ensureEventFields(event: Record<string, unknown>): event is NostrEvent {
  if (typeof event.id !== 'string') return false;
  if (typeof event.sig !== 'string') return false;
  if (typeof event.kind !== 'number') return false;
  if (typeof event.pubkey !== 'string') return false;
  if (typeof event.content !== 'string') return false;
  if (typeof event.created_at !== 'number') return false;
  if (!Array.isArray(event.tags)) return false;
  for (const tag of event.tags as unknown[]) {
    if (!Array.isArray(tag)) return false;
    for (const elem of tag as unknown[]) {
      if (typeof elem === 'object') return false;
    }
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/shared/nostr/auftakt/core/ensure-event-fields.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/types.ts src/shared/nostr/auftakt/core/ensure-event-fields.test.ts
git commit -m "feat(auftakt): add ensureEventFields type guard and Publishable type"
```

---

### Task 2: nip07Signer — pubkey 補完 + ensureEventFields パススルー

**Files:**

- Modify: `src/shared/nostr/auftakt/core/signers/nip07-signer.ts`
- Modify: `src/shared/nostr/auftakt/core/signers/nip07-signer.test.ts`

- [ ] **Step 1: Write failing tests for new behavior**

Add the following tests to the existing `describe('nip07Signer')` block in `nip07-signer.test.ts`:

```typescript
it('passes through a complete signed event without calling extension.signEvent', async () => {
  const mock = mockWindowNostr();
  try {
    const signer = nip07Signer();
    const signedEvent = {
      id: 'abc',
      pubkey: 'pub',
      created_at: 1700000000,
      kind: 1,
      tags: [],
      content: 'hello',
      sig: 'sig123'
    };
    const result = await signer.signEvent(signedEvent);

    expect(mock.signEvent).not.toHaveBeenCalled();
    expect(result).toEqual(signedEvent);
  } finally {
    clearWindowNostr();
  }
});

it('supplements pubkey from extension when missing', async () => {
  const mock = mockWindowNostr();
  try {
    const signer = nip07Signer();
    await signer.signEvent({ kind: 1, content: 'hi', tags: [] });

    const calledWith = mock.signEvent.mock.calls[0][0] as { pubkey: string };
    expect(calledWith.pubkey).toBe('mock-pubkey');
  } finally {
    clearWindowNostr();
  }
});

it('supplements created_at with current time when missing', async () => {
  const mock = mockWindowNostr();
  try {
    const signer = nip07Signer();
    const before = Math.floor(Date.now() / 1000);
    await signer.signEvent({ kind: 1, content: 'hi', tags: [] });
    const after = Math.floor(Date.now() / 1000);

    const calledWith = mock.signEvent.mock.calls[0][0] as { created_at: number };
    expect(calledWith.created_at).toBeGreaterThanOrEqual(before);
    expect(calledWith.created_at).toBeLessThanOrEqual(after);
  } finally {
    clearWindowNostr();
  }
});

it('preserves existing created_at when provided', async () => {
  const mock = mockWindowNostr();
  try {
    const signer = nip07Signer();
    await signer.signEvent({ kind: 1, content: 'hi', tags: [], created_at: 42 });

    const calledWith = mock.signEvent.mock.calls[0][0] as { created_at: number };
    expect(calledWith.created_at).toBe(42);
  } finally {
    clearWindowNostr();
  }
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `pnpm vitest run src/shared/nostr/auftakt/core/signers/nip07-signer.test.ts`
Expected: new tests FAIL (passthrough test fails because signEvent is still called; pubkey test fails because pubkey is not supplemented)

- [ ] **Step 3: Update nip07-signer.ts implementation**

Replace the entire contents of `src/shared/nostr/auftakt/core/signers/nip07-signer.ts`:

```typescript
import { ensureEventFields } from '../types.js';
import type { EventSigner } from '../types.js';

interface Nip07Extension {
  getPublicKey(): Promise<string>;
  signEvent(event: Record<string, unknown>): Promise<Record<string, unknown>>;
}

function getNostrExtension(): Nip07Extension {
  const nostr = (globalThis as Record<string, unknown>).window as
    | { nostr?: Nip07Extension }
    | undefined;

  if (!nostr?.nostr) {
    throw new Error('NIP-07 extension (window.nostr) is not available');
  }

  return nostr.nostr;
}

export function nip07Signer(options?: { tags?: string[][] }): EventSigner {
  const fixedTags = options?.tags ?? [];

  return {
    async signEvent(params) {
      const extension = getNostrExtension();
      const event = {
        ...params,
        pubkey: params.pubkey ?? (await extension.getPublicKey()),
        tags: [...(Array.isArray(params.tags) ? (params.tags as string[][]) : []), ...fixedTags],
        created_at: params.created_at ?? Math.floor(Date.now() / 1000)
      };

      if (ensureEventFields(event as Record<string, unknown>)) {
        return event;
      }

      return await extension.signEvent(event);
    },
    async getPublicKey() {
      const extension = getNostrExtension();
      return await extension.getPublicKey();
    }
  };
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pnpm vitest run src/shared/nostr/auftakt/core/signers/nip07-signer.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/signers/nip07-signer.ts src/shared/nostr/auftakt/core/signers/nip07-signer.test.ts
git commit -m "feat(auftakt): nip07Signer pubkey/created_at supplement + ensureEventFields passthrough"
```

---

### Task 3: seckeySigner — ensureEventFields パススルー

**Files:**

- Modify: `src/shared/nostr/auftakt/core/signers/seckey-signer.ts`
- Modify: `src/shared/nostr/auftakt/core/signers/seckey-signer.test.ts`

- [ ] **Step 1: Write failing test for passthrough**

Add to the existing `describe('seckeySigner')` block in `seckey-signer.test.ts`:

```typescript
it('passes through a complete signed event without re-signing', async () => {
  const sk = generateSecretKey();
  const hexKey = Buffer.from(sk).toString('hex');
  const signer = seckeySigner(hexKey);

  const signedEvent = {
    id: 'pre-signed-id',
    pubkey: 'other-pubkey',
    created_at: 1700000000,
    kind: 1,
    tags: [],
    content: 'already signed',
    sig: 'pre-signed-sig'
  };
  const result = await signer.signEvent(signedEvent);

  expect(result).toEqual(signedEvent);
  expect(result.id).toBe('pre-signed-id');
  expect(result.sig).toBe('pre-signed-sig');
  expect(result.pubkey).toBe('other-pubkey');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/nostr/auftakt/core/signers/seckey-signer.test.ts`
Expected: FAIL — seckeySigner re-signs and overrides id/sig/pubkey

- [ ] **Step 3: Update seckey-signer.ts implementation**

Replace the entire contents of `src/shared/nostr/auftakt/core/signers/seckey-signer.ts`:

```typescript
// src/shared/nostr/auftakt/core/signers/seckey-signer.ts
import { decode } from 'nostr-tools/nip19';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { hexToBytes } from 'nostr-tools/utils';

import { ensureEventFields } from '../types.js';
import type { EventSigner } from '../types.js';

function parseSecretKey(key: string): Uint8Array {
  if (key.startsWith('nsec1')) {
    const decoded = decode(key);
    if (decoded.type !== 'nsec') {
      throw new Error('Invalid nsec key');
    }
    return decoded.data;
  }

  if (/^[0-9a-f]{64}$/i.test(key)) {
    return hexToBytes(key);
  }

  throw new Error('Invalid secret key format. Provide hex (64 chars) or nsec1...');
}

export function seckeySigner(key: string): EventSigner {
  const secretKey = parseSecretKey(key);
  const pubkey = getPublicKey(secretKey);

  return {
    signEvent(params) {
      if (ensureEventFields(params as Record<string, unknown>)) {
        return Promise.resolve(params);
      }

      const event = finalizeEvent(
        {
          kind: Number(params.kind ?? 1),
          content: String(params.content ?? ''),
          tags: Array.isArray(params.tags) ? (params.tags as string[][]) : [],
          created_at: Number(params.created_at ?? Math.floor(Date.now() / 1000))
        },
        secretKey
      );
      return Promise.resolve(event as unknown as Record<string, unknown>);
    },
    getPublicKey() {
      return Promise.resolve(pubkey);
    }
  };
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pnpm vitest run src/shared/nostr/auftakt/core/signers/seckey-signer.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/signers/seckey-signer.ts src/shared/nostr/auftakt/core/signers/seckey-signer.test.ts
git commit -m "feat(auftakt): seckeySigner ensureEventFields passthrough"
```

---

### Task 4: Session `#publish()` / `send()` / `cast()` — Publishable 引数 + signer 委譲

**Files:**

- Modify: `src/shared/nostr/auftakt/core/models/session.ts`

- [ ] **Step 1: Update `#publish()` signature and remove pubkey/created_at override**

In `src/shared/nostr/auftakt/core/models/session.ts`, make these changes:

1. Add import at the top of the file:

```typescript
import type { Publishable } from '../types.js';
```

2. Change `#publish()` parameter type (line 281):

```typescript
// Before:
async #publish(
  draft: { kind: number; content: string; tags: string[][] },

// After:
async #publish(
  input: Publishable,
```

3. Change the signer call (lines 383-387):

```typescript
// Before:
signed = await this.signer.signEvent({
  ...draft,
  pubkey: this.pubkey,
  created_at: 1
});

// After:
signed = await this.signer.signEvent(input as Record<string, unknown>);
```

4. Update all references to `draft` inside `#publish()` to `input`:
   - Line 314-322: `persistOptimistic` uses `...draft` → `...input`
   - Line 326: `extractTaggedPubkeys(draft.tags)` → `extractTaggedPubkeys(input.tags)`
   - Line 349: `event: draft` → `event: input`
   - Line 361: `isProtectedEvent(draft.tags)` → `isProtectedEvent(input.tags)`
   - Line 367: `event: draft` → `event: input`

- [ ] **Step 2: Update `send()` signature**

Change the `send()` method parameter (line 473):

```typescript
// Before:
async send(
  draft: { kind: number; content: string; tags: string[][] },

// After:
async send(
  input: Publishable,
```

And the call to `#publish()` (line 500):

```typescript
// Before:
return this.#publish(draft, options);

// After:
return this.#publish(input, options);
```

- [ ] **Step 3: Update `cast()` signature**

Change the `cast()` method parameter (line 504):

```typescript
// Before:
cast(
  draft: { kind: number; content: string; tags: string[][] },

// After:
cast(
  input: Publishable,
```

Update internal references:

- Line 540: `event: draft` → `event: input`
- Line 556: `this.#publish(draft, {` → `this.#publish(input, {`

- [ ] **Step 4: Run existing tests to ensure no regressions**

Run: `pnpm vitest run src/shared/nostr/auftakt/`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/models/session.ts
git commit -m "feat(auftakt): session send/cast accept Publishable, delegate signing to signer"
```

---

### Task 5: `castSigned` — rx-nostr 除去

**Files:**

- Modify: `src/shared/nostr/client.ts`
- Modify: `src/shared/nostr/gateway.ts`

- [ ] **Step 1: Replace castSigned in client.ts**

Replace the `castSigned` function (lines 32-106) in `src/shared/nostr/client.ts`:

```typescript
export async function castSigned(
  params: Record<string, unknown>,
  options?: { successThreshold?: number }
): Promise<void> {
  const { getSession } = await import('$shared/nostr/auftakt-runtime.svelte.js');
  const session = getSession();
  if (!session) {
    throw new Error('No active auftakt session');
  }
  const result = await session.send(
    params as import('$shared/nostr/auftakt/core/types.js').Publishable,
    {
      completion: {
        mode: 'ratio',
        threshold: options?.successThreshold ?? 0.5
      }
    }
  );
  if (result.status === 'failed') {
    throw new Error(
      typeof result.failureReason === 'string'
        ? result.failureReason
        : 'All relays rejected the event'
    );
  }
}
```

- [ ] **Step 2: Remove unused `EventParameters` import from client.ts**

Remove line 1:

```typescript
// Remove: import type { EventParameters } from 'nostr-typedef';
```

Also remove from the `castSigned` function any reference to `nip07Signer` or rx-nostr send logic (the entire fallback block, lines 70-105).

- [ ] **Step 3: Update gateway.ts re-export type**

In `src/shared/nostr/gateway.ts`, remove the `EventParameters` re-export (lines 10, 32):

```typescript
// Remove: import type { EventParameters } from 'nostr-typedef';
// Remove: export type { EventParameters };
```

Add `Publishable` re-export:

```typescript
export type { Publishable } from '$shared/nostr/auftakt/core/types.js';
```

- [ ] **Step 4: Run lint to check for broken imports**

Run: `pnpm check`
Expected: No new errors related to castSigned or EventParameters (vendor negentropy errors are known/ignored)

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/client.ts src/shared/nostr/gateway.ts
git commit -m "feat: castSigned uses auftakt session only, remove rx-nostr fallback"
```

---

### Task 6: `publishSignedEvent` / `publishSignedEvents` — rx-nostr 除去

**Files:**

- Modify: `src/shared/nostr/publish-signed.ts`

- [ ] **Step 1: Replace publish-signed.ts**

Replace the entire contents of `src/shared/nostr/publish-signed.ts`:

```typescript
import type { PendingEvent } from './pending-publishes.js';
import {
  addPendingPublish,
  cleanExpired,
  getPendingPublishes,
  removePendingPublish
} from './pending-publishes.js';

type PublishableEvent = PendingEvent | Record<string, unknown>;

/** Convert to PendingEvent only if it has the required fields (id + sig). */
function toPendingEvent(event: PublishableEvent): PendingEvent | null {
  const e = event as unknown as Record<string, unknown>;
  if (typeof e.id === 'string' && typeof e.sig === 'string' && typeof e.kind === 'number') {
    return event as unknown as PendingEvent;
  }
  return null;
}

async function getSession() {
  const { getSession } = await import('$shared/nostr/auftakt-runtime.svelte.js');
  const session = getSession();
  if (!session) {
    throw new Error('No active auftakt session');
  }
  return session;
}

export async function retryPendingPublishes(): Promise<void> {
  await cleanExpired();
  const pending = await getPendingPublishes();
  for (const event of pending) {
    try {
      await publishSignedEvent(event);
      await removePendingPublish(event.id);
    } catch {
      // Will retry next time
    }
  }
}

export async function publishSignedEvent(event: PublishableEvent): Promise<void> {
  try {
    const session = await getSession();
    await session.send(event as import('$shared/nostr/auftakt/core/types.js').Publishable);
  } catch {
    const pending = toPendingEvent(event);
    if (pending) await addPendingPublish(pending);
  }
}

export async function publishSignedEvents(events: PublishableEvent[]): Promise<void> {
  if (events.length === 0) return;

  const session = await getSession();

  await Promise.allSettled(
    events.map(async (event) => {
      try {
        await session.send(event as import('$shared/nostr/auftakt/core/types.js').Publishable);
      } catch {
        const pending = toPendingEvent(event);
        if (pending) await addPendingPublish(pending);
      }
    })
  );
}
```

- [ ] **Step 2: Run lint and type check**

Run: `pnpm check`
Expected: No new errors related to publish-signed

- [ ] **Step 3: Commit**

```bash
git add src/shared/nostr/publish-signed.ts
git commit -m "feat: publishSignedEvent uses auftakt session only, remove rx-nostr dependency"
```

---

### Task 7: Check callers of `EventParameters` and fix imports

**Files:**

- Search & modify: any files importing `EventParameters` from gateway.ts

- [ ] **Step 1: Find all callers of `EventParameters`**

Run: `grep -rn 'EventParameters' src/ --include='*.ts' --include='*.svelte'`

For each file that imports `EventParameters` from `$shared/nostr/gateway.js`:

- If it uses `EventParameters` as a type for something passed to `castSigned`, replace with `Publishable` from the same gateway
- If it's used elsewhere (rx-nostr direct usage), evaluate case-by-case

- [ ] **Step 2: Fix each broken import**

Update each caller to import `Publishable` instead of `EventParameters` where appropriate.

- [ ] **Step 3: Run full type check**

Run: `pnpm check`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "refactor: replace EventParameters with Publishable in castSigned callers"
```

---

### Task 8: docs/auftakt/spec.md 更新

**Files:**

- Modify: `docs/auftakt/spec.md`

- [ ] **Step 1: Update §3.4 Publish API**

Replace lines 71-72:

```markdown
- `session.send(input: Publishable, options?)` — 同期 publish (結果を await)。Draft なら署名、NostrEvent ならパススルー
- `session.cast(input: Publishable, options?)` — fire-and-forget publish (handle 返却)。Draft なら署名、NostrEvent ならパススルー
```

- [ ] **Step 2: Update §3.6 Signer**

Replace lines 81-91 with:

````markdown
### 3.6 Signer (RL §5)

```typescript
interface EventSigner {
  signEvent(params: Record<string, unknown>): Promise<Record<string, unknown>>;
  getPublicKey(): Promise<string>;
}
```
````

**補完パススルー方式** (rx-nostr 準拠):

1. 足りないフィールド (`pubkey`, `created_at`, `tags`) を補完
2. `ensureEventFields()` で全フィールドの存在を検証
3. 全フィールドが揃っていれば署名済みとみなしパススルー
4. 揃っていなければ署名を実行

`ensureEventFields(event)`: id, sig, kind, pubkey, content, created_at, tags の全フィールドが正しい型で存在するかチェック。tags 内の各要素が配列であり、要素が object でないことも検証。

個別 factory: `nip07Signer()`, `seckeySigner(privkey)`, `noopSigner()`。
`auftakt/index.ts` から re-export。

````

- [ ] **Step 3: Update §9.8 Publish**

Replace line 376:
```markdown
Publish flow: `cast()` / `send()` → signer.signEvent(input) → signer が補完 + パススルー判定 → `onPublishing` callback (signing 完了後, GA E4) → pendingPublish 永続化 → relayManager.publish() → OK/CLOSE tracking。input が署名済み NostrEvent の場合、signer はパススルーして再署名しない。
````

- [ ] **Step 4: Update §14.2 Lifecycle**

Replace line 619:

```markdown
1. `cast()`/`send()` → `signer.signEvent(input)` (補完 + パススルー) → `putPendingPublish` → `relayManager.publish()`
```

- [ ] **Step 5: Commit**

```bash
git add docs/auftakt/spec.md
git commit -m "docs(auftakt): update spec for Publishable type and signer supplement-passthrough"
```

---

### Task 9: Pre-commit validation

**Files:** None (verification only)

- [ ] **Step 1: Run format check**

Run: `pnpm format:check`
Expected: PASS (or fix with `pnpm format`)

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 3: Run type check**

Run: `pnpm check`
Expected: No new errors (vendor negentropy errors are known/ignored)

- [ ] **Step 4: Run unit tests**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 5: Run E2E tests**

Run: `pnpm test:e2e`
Expected: ALL PASS

- [ ] **Step 6: Fix any failures and commit**

If any step fails, fix the issue and create a new commit for the fix.
