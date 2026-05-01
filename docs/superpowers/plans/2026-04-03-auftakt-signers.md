# auftakt Signers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** nip07Signer / seckeySigner / noopSigner の 3 種を実装し、rx-nostr の signer と同等機能を提供する

**Architecture:** `core/signers/` 配下に各 signer を独立ファイルで作成。`EventSigner` interface (Plan A Task 1 で追加済み) を実装。既存の `createSigner` スタブは変更せず共存

**Tech Stack:** TypeScript, vitest, nostr-tools/pure (finalizeEvent), nostr-tools/nip19 (decode nsec)

**Dependencies:** Plan A Task 1 (types.ts に EventSigner 追加) が完了していること。それ以外は Plan A と並行実行可能

---

## File Structure

| File                                                          | 責務                       |
| ------------------------------------------------------------- | -------------------------- |
| `src/shared/nostr/auftakt/core/signers/nip07-signer.ts`       | window.nostr ラッパー      |
| `src/shared/nostr/auftakt/core/signers/nip07-signer.test.ts`  | テスト                     |
| `src/shared/nostr/auftakt/core/signers/seckey-signer.ts`      | nsec/hex 秘密鍵署名        |
| `src/shared/nostr/auftakt/core/signers/seckey-signer.test.ts` | テスト                     |
| `src/shared/nostr/auftakt/core/signers/noop-signer.ts`        | パススルー (pre-signed 用) |
| `src/shared/nostr/auftakt/core/signers/noop-signer.test.ts`   | テスト                     |
| `src/shared/nostr/auftakt/core/signers/index.ts`              | re-export                  |

---

### Task 1: noopSigner

**Files:**

- Create: `src/shared/nostr/auftakt/core/signers/noop-signer.ts`
- Test: `src/shared/nostr/auftakt/core/signers/noop-signer.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/signers/noop-signer.test.ts
import { describe, expect, it } from 'vitest';

import { noopSigner } from './noop-signer.js';

describe('noopSigner', () => {
  it('returns the event as-is without modification', async () => {
    const signer = noopSigner();
    const event = { id: 'abc', pubkey: 'pub', sig: 'sig', kind: 1, content: '', tags: [] };
    const result = await signer.signEvent(event);
    expect(result).toEqual(event);
  });

  it('throws on getPublicKey', async () => {
    const signer = noopSigner();
    await expect(signer.getPublicKey()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: テスト fail を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/signers/noop-signer.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装**

```typescript
// src/shared/nostr/auftakt/core/signers/noop-signer.ts
import type { EventSigner } from '../types.js';

export function noopSigner(): EventSigner {
  return {
    async signEvent(params) {
      return params;
    },
    async getPublicKey() {
      throw new Error('noopSigner cannot derive pubkey. Provide pubkey externally.');
    }
  };
}
```

- [ ] **Step 4: テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/signers/noop-signer.test.ts`
Expected: 2 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/signers/noop-signer.ts src/shared/nostr/auftakt/core/signers/noop-signer.test.ts
git commit -m "feat: add noopSigner for pre-signed events"
```

---

### Task 2: seckeySigner

**Files:**

- Create: `src/shared/nostr/auftakt/core/signers/seckey-signer.ts`
- Test: `src/shared/nostr/auftakt/core/signers/seckey-signer.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/signers/seckey-signer.test.ts
import { describe, expect, it } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nsecEncode } from 'nostr-tools/nip19';
import { hexToBytes } from 'nostr-tools/utils';

import { seckeySigner } from './seckey-signer.js';

describe('seckeySigner', () => {
  it('signs an event with a hex secret key', async () => {
    const sk = generateSecretKey();
    const hexKey = Buffer.from(sk).toString('hex');
    const signer = seckeySigner(hexKey);

    const result = await signer.signEvent({
      kind: 1,
      content: 'hello',
      tags: [],
      created_at: 1000
    });

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('sig');
    expect(result).toHaveProperty('pubkey');
    expect(result.kind).toBe(1);
    expect(result.content).toBe('hello');
  });

  it('signs an event with an nsec key', async () => {
    const sk = generateSecretKey();
    const nsec = nsecEncode(sk);
    const signer = seckeySigner(nsec);

    const result = await signer.signEvent({
      kind: 1,
      content: 'test',
      tags: [],
      created_at: 1000
    });

    expect(result).toHaveProperty('sig');
  });

  it('returns the correct public key', async () => {
    const sk = generateSecretKey();
    const expectedPubkey = getPublicKey(sk);
    const hexKey = Buffer.from(sk).toString('hex');
    const signer = seckeySigner(hexKey);

    const pubkey = await signer.getPublicKey();
    expect(pubkey).toBe(expectedPubkey);
  });

  it('throws on invalid key format', () => {
    expect(() => seckeySigner('invalid')).toThrow();
  });
});
```

- [ ] **Step 2: テスト fail を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/signers/seckey-signer.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装**

```typescript
// src/shared/nostr/auftakt/core/signers/seckey-signer.ts
import { decode } from 'nostr-tools/nip19';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { hexToBytes } from 'nostr-tools/utils';

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
    async signEvent(params) {
      const event = finalizeEvent(
        {
          kind: Number(params.kind ?? 1),
          content: String(params.content ?? ''),
          tags: (params.tags as string[][]) ?? [],
          created_at: Number(params.created_at ?? Math.floor(Date.now() / 1000))
        },
        secretKey
      );
      return event as unknown as Record<string, unknown>;
    },
    async getPublicKey() {
      return pubkey;
    }
  };
}
```

- [ ] **Step 4: テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/signers/seckey-signer.test.ts`
Expected: 4 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/signers/seckey-signer.ts src/shared/nostr/auftakt/core/signers/seckey-signer.test.ts
git commit -m "feat: add seckeySigner for hex and nsec secret keys"
```

---

### Task 3: nip07Signer

**Files:**

- Create: `src/shared/nostr/auftakt/core/signers/nip07-signer.ts`
- Test: `src/shared/nostr/auftakt/core/signers/nip07-signer.test.ts`

- [ ] **Step 1: failing test を書く**

```typescript
// src/shared/nostr/auftakt/core/signers/nip07-signer.test.ts
import { describe, expect, it, vi } from 'vitest';

import { nip07Signer } from './nip07-signer.js';

function mockWindowNostr() {
  const mock = {
    getPublicKey: vi.fn().mockResolvedValue('mock-pubkey'),
    signEvent: vi.fn().mockImplementation(async (event: Record<string, unknown>) => ({
      ...event,
      id: 'signed-id',
      sig: 'signed-sig',
      pubkey: 'mock-pubkey'
    }))
  };
  (globalThis as Record<string, unknown>).window = { nostr: mock };
  return mock;
}

function clearWindowNostr() {
  delete (globalThis as Record<string, unknown>).window;
}

describe('nip07Signer', () => {
  it('delegates signEvent to window.nostr', async () => {
    const mock = mockWindowNostr();
    try {
      const signer = nip07Signer();
      const result = await signer.signEvent({ kind: 1, content: 'hi', tags: [] });

      expect(mock.signEvent).toHaveBeenCalledOnce();
      expect(result).toHaveProperty('sig', 'signed-sig');
    } finally {
      clearWindowNostr();
    }
  });

  it('appends fixed tags when configured', async () => {
    const mock = mockWindowNostr();
    try {
      const signer = nip07Signer({ tags: [['client', 'resonote']] });
      await signer.signEvent({ kind: 1, content: 'hi', tags: [['p', 'someone']] });

      const calledWith = mock.signEvent.mock.calls[0][0] as { tags: string[][] };
      expect(calledWith.tags).toEqual([
        ['p', 'someone'],
        ['client', 'resonote']
      ]);
    } finally {
      clearWindowNostr();
    }
  });

  it('delegates getPublicKey to window.nostr', async () => {
    mockWindowNostr();
    try {
      const signer = nip07Signer();
      const pubkey = await signer.getPublicKey();
      expect(pubkey).toBe('mock-pubkey');
    } finally {
      clearWindowNostr();
    }
  });

  it('throws when window.nostr is unavailable', async () => {
    clearWindowNostr();
    const signer = nip07Signer();
    await expect(signer.getPublicKey()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: テスト fail を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/signers/nip07-signer.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装**

```typescript
// src/shared/nostr/auftakt/core/signers/nip07-signer.ts
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
        tags: [...((params.tags as string[][]) ?? []), ...fixedTags],
        created_at:
          typeof params.created_at === 'number' ? params.created_at : Math.floor(Date.now() / 1000)
      };

      return extension.signEvent(event);
    },
    async getPublicKey() {
      const extension = getNostrExtension();
      return extension.getPublicKey();
    }
  };
}
```

- [ ] **Step 4: テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/core/signers/nip07-signer.test.ts`
Expected: 4 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/shared/nostr/auftakt/core/signers/nip07-signer.ts src/shared/nostr/auftakt/core/signers/nip07-signer.test.ts
git commit -m "feat: add nip07Signer for browser extension signing"
```

---

### Task 4: re-export index + 全体テスト

**Files:**

- Create: `src/shared/nostr/auftakt/core/signers/index.ts`

- [ ] **Step 1: index.ts を作成**

```typescript
// src/shared/nostr/auftakt/core/signers/index.ts
export { nip07Signer } from './nip07-signer.js';
export { noopSigner } from './noop-signer.js';
export { seckeySigner } from './seckey-signer.js';
```

- [ ] **Step 2: 全テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/`
Expected: 全テスト pass

- [ ] **Step 3: format + lint + check**

Run: `pnpm format:check && pnpm lint && pnpm check`

- [ ] **Step 4: Commit**

```bash
git add src/shared/nostr/auftakt/core/signers/index.ts
git commit -m "feat: add signer index re-exports"
```

---

### Task 5: Wiring — session.ts / store-types.ts の inline signer 型を EventSigner に統一

**Files:**

- Modify: `src/shared/nostr/auftakt/core/models/session.ts`
- Modify: `src/shared/nostr/auftakt/core/store-types.ts`

- [ ] **Step 1: store-types.ts の RelayManager.authenticate パラメータを EventSigner に変更**

```typescript
// store-types.ts の authenticate のsigner 引数を:
// Before: signer: { signEvent(...): Promise<...> }
// After:
import type { EventSigner } from './types.js';
// ... authenticate?(relaySet: RelaySet, signer: EventSigner): Promise<void>;
```

- [ ] **Step 2: session.ts の inline signer 型を EventSigner import に変更**

Session.open の `signer` パラメータ型と constructor の signer 型を `EventSigner` import に統一。

- [ ] **Step 3: 全テスト pass を確認**

Run: `pnpm exec vitest run src/shared/nostr/auftakt/`
Expected: 全テスト pass (createFakeSigner は既に同じシグネチャ)

- [ ] **Step 4: Commit**

```bash
git add src/shared/nostr/auftakt/core/models/session.ts src/shared/nostr/auftakt/core/store-types.ts
git commit -m "refactor: unify inline signer types to canonical EventSigner"
```

---

## Exit Criteria

- [ ] `noopSigner()` — パススルー、getPublicKey throws
- [ ] `seckeySigner(hex|nsec)` — hex/nsec 両対応、nostr-tools/pure で署名
- [ ] `nip07Signer()` — window.nostr 委譲、tags append オプション
- [ ] 全 signer が `EventSigner` interface を満たす
- [ ] session.ts / store-types.ts が canonical `EventSigner` を参照
- [ ] `pnpm format:check && pnpm lint && pnpm check` が全 pass
