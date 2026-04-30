# Auftakt Nostr-Tools Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `nostr-tools` direct import と direct dependency を撤去し、`packages/auftakt` の `nip19 / crypto / client` 内製 API へ置換する。

**Architecture:** まず `nip19` を `packages/auftakt` に追加して UI/shared 側の direct import を剥がす。次に `crypto` を追加して server / resolver / integration test を移行し、最後に `client` を `SimplePool` 依存から切り替えて `package.json` から `nostr-tools` を削除する。

**Tech Stack:** TypeScript, Vitest, Svelte, Hono, pnpm, WebSocket, `@noble/*`, `@scure/*`

---

### Task 1: Add Auftakt NIP-19 Module

**Files:**

- Create: `packages/auftakt/src/nip19/index.ts`
- Create: `packages/auftakt/src/nip19/index.test.ts`
- Modify: `packages/auftakt/src/index.ts`
- Modify: `src/shared/nostr/helpers.ts`
- Modify: `src/lib/components/CommentActionMenu.svelte`
- Modify: `src/lib/components/NoteInput.svelte`
- Modify: `src/features/profiles/domain/profile-model.ts`
- Modify: `src/features/comments/ui/comment-form-view-model.svelte.ts`
- Modify: `src/features/comments/ui/mention-candidates.ts`
- Modify: `src/features/comments/ui/mention-candidates.test.ts`
- Modify: `src/shared/nostr/content-parser.test.ts`
- Modify: `src/shared/nostr/nip19-decode.test.ts`
- Modify: `src/shared/nostr/events.test.ts`

- [ ] **Step 1: `packages/auftakt` 側の failing test を書く**

```ts
import { describe, expect, it } from 'vitest';

import { decodeNip19, encodeNevent, encodeNote, encodeNprofile, encodeNpub } from './index.js';

const PUBKEY = 'f'.repeat(64);
const EVENT_ID = 'e'.repeat(64);
const RELAY = 'wss://relay.example.com';

describe('auftakt nip19', () => {
  it('npub を encode / decode できる', () => {
    const encoded = encodeNpub(PUBKEY);

    expect(decodeNip19(encoded)).toEqual({ type: 'npub', pubkey: PUBKEY });
  });

  it('nevent / nprofile を encode / decode できる', () => {
    const nevent = encodeNevent({ id: EVENT_ID, relays: [RELAY], author: PUBKEY });
    const nprofile = encodeNprofile({ pubkey: PUBKEY, relays: [RELAY] });

    expect(decodeNip19(nevent)).toEqual({
      type: 'nevent',
      eventId: EVENT_ID,
      relays: [RELAY],
      author: PUBKEY,
      kind: undefined
    });
    expect(decodeNip19(nprofile)).toEqual({
      type: 'nprofile',
      pubkey: PUBKEY,
      relays: [RELAY]
    });
  });

  it('note を encode / decode できる', () => {
    const encoded = encodeNote(EVENT_ID);

    expect(decodeNip19(encoded)).toEqual({ type: 'note', eventId: EVENT_ID });
  });
});
```

- [ ] **Step 2: RED を確認する**

Run:

```bash
pnpm exec vitest run packages/auftakt/src/nip19/index.test.ts
```

Expected: FAIL。`packages/auftakt/src/nip19/index.ts` が未実装で import error になる。

- [ ] **Step 3: `packages/auftakt` に最小実装を書く**

```ts
import { bech32 } from '@scure/base';

export type DecodedNip19 =
  | { type: 'npub'; pubkey: string }
  | { type: 'nprofile'; pubkey: string; relays: string[] }
  | { type: 'nevent'; eventId: string; relays: string[]; author?: string; kind?: number }
  | { type: 'note'; eventId: string }
  | null;

export function encodeNpub(pubkey: string): string {
  /* ... */
}
export function encodeNote(eventId: string): string {
  /* ... */
}
export function encodeNevent(input: {
  id: string;
  relays?: string[];
  author?: string;
  kind?: number;
}): string {
  /* ... */
}
export function encodeNprofile(input: { pubkey: string; relays?: string[] }): string {
  /* ... */
}
export function decodeNip19(value: string): DecodedNip19 {
  /* ... */
}
```

- [ ] **Step 4: GREEN を確認する**

Run:

```bash
pnpm exec vitest run packages/auftakt/src/nip19/index.test.ts
```

Expected: PASS。

- [ ] **Step 5: app 側の import を `packages/auftakt` に置換する failing test を書く**

```ts
import { npubEncode } from 'nostr-tools/nip19';
```

上記を残しているテストを、次の import に差し替えたうえで既存 assertion を維持する。

```ts
import { encodeNpub as npubEncode } from '$packages/auftakt/src/nip19/index.js';
```

対象:

- `src/features/comments/ui/mention-candidates.test.ts`
- `src/shared/nostr/content-parser.test.ts`
- `src/shared/nostr/nip19-decode.test.ts`
- `src/shared/nostr/events.test.ts`

- [ ] **Step 6: app 側の import 差し替えで RED を確認する**

Run:

```bash
pnpm exec vitest run \
  src/features/comments/ui/mention-candidates.test.ts \
  src/shared/nostr/content-parser.test.ts \
  src/shared/nostr/nip19-decode.test.ts \
  src/shared/nostr/events.test.ts
```

Expected: FAIL。`packages/auftakt/src/index.ts` から未 export、または `src/shared/nostr/helpers.ts` の decode 実装が未接続で落ちる。

- [ ] **Step 7: app / shared 実装を最小修正する**

```ts
// packages/auftakt/src/index.ts
export * from './nip19/index.js';

// src/shared/nostr/helpers.ts
import { decodeNip19 } from '$packages/auftakt/src/index.js';

// src/lib/components/CommentActionMenu.svelte
import { encodeNevent as neventEncode } from '$packages/auftakt/src/index.js';
```

同様に `npubEncode`, `noteEncode`, `nprofileEncode` の参照を `packages/auftakt` export に寄せる。

- [ ] **Step 8: Task 1 の回帰を確認する**

Run:

```bash
pnpm exec vitest run \
  packages/auftakt/src/nip19/index.test.ts \
  src/features/comments/ui/mention-candidates.test.ts \
  src/shared/nostr/content-parser.test.ts \
  src/shared/nostr/nip19-decode.test.ts \
  src/shared/nostr/events.test.ts
```

Expected: PASS。

- [ ] **Step 9: コミットする**

```bash
git add packages/auftakt/src/nip19 packages/auftakt/src/index.ts src/shared/nostr/helpers.ts src/lib/components/CommentActionMenu.svelte src/lib/components/NoteInput.svelte src/features/profiles/domain/profile-model.ts src/features/comments/ui/comment-form-view-model.svelte.ts src/features/comments/ui/mention-candidates.ts src/features/comments/ui/mention-candidates.test.ts src/shared/nostr/content-parser.test.ts src/shared/nostr/nip19-decode.test.ts src/shared/nostr/events.test.ts
git commit -m "feat: add auftakt nip19 module"
```

### Task 2: Add Auftakt Crypto Module

**Files:**

- Create: `packages/auftakt/src/crypto/index.ts`
- Create: `packages/auftakt/src/crypto/index.test.ts`
- Modify: `packages/auftakt/src/index.ts`
- Modify: `src/shared/content/podcast-resolver.ts`
- Modify: `src/shared/content/podcast-resolver.test.ts`
- Modify: `src/server/api/system.ts`
- Modify: `src/server/api/system.test.ts`
- Modify: `src/server/api/podcast.ts`
- Modify: `src/server/api/app.test.ts`
- Modify: `src/shared/nostr/client-integration.test.ts`
- Modify: `src/shared/nostr/relay-integration.test.ts`
- Modify: `package.json`

- [ ] **Step 1: `crypto` の failing test を書く**

```ts
import { describe, expect, it } from 'vitest';

import { bytesToHex, getPublicKey, hexToBytes, signEvent, verifyEvent } from './index.js';

describe('auftakt crypto', () => {
  it('hex と bytes を相互変換できる', () => {
    const hex = '11'.repeat(32);
    expect(bytesToHex(hexToBytes(hex))).toBe(hex);
  });

  it('sign / verify できる', async () => {
    const secret = hexToBytes('22'.repeat(32));
    const event = await signEvent(
      {
        kind: 1,
        created_at: 1,
        tags: [],
        content: 'hello'
      },
      secret
    );

    expect(event.pubkey).toBe(getPublicKey(secret));
    expect(verifyEvent(event)).toBe(true);
  });
});
```

- [ ] **Step 2: RED を確認する**

Run:

```bash
pnpm exec vitest run packages/auftakt/src/crypto/index.test.ts
```

Expected: FAIL。`packages/auftakt/src/crypto/index.ts` が未実装。

- [ ] **Step 3: `crypto` の最小実装を書く**

```ts
import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';

export function hexToBytes(hex: string): Uint8Array {
  /* ... */
}
export function bytesToHex(bytes: Uint8Array): string {
  /* ... */
}
export function getPublicKey(secret: Uint8Array): string {
  /* ... */
}
export function getEventHash(event: UnsignedNostrEvent): string {
  /* ... */
}
export async function signEvent(
  event: UnsignedNostrEvent,
  secret: Uint8Array
): Promise<NostrEvent> {
  /* ... */
}
export function verifyEvent(event: NostrEvent): boolean {
  /* ... */
}
```

- [ ] **Step 4: GREEN を確認する**

Run:

```bash
pnpm exec vitest run packages/auftakt/src/crypto/index.test.ts
```

Expected: PASS。

- [ ] **Step 5: server / resolver 側の import を差し替える failing test を書く**

`nostr-tools/pure` / `nostr-tools/utils` を mock しているテストを `packages/auftakt` export に向けて差し替える。

対象:

- `src/shared/content/podcast-resolver.test.ts`
- `src/server/api/app.test.ts`
- `src/server/api/system.test.ts`
- `src/shared/nostr/client-integration.test.ts`
- `src/shared/nostr/relay-integration.test.ts`

- [ ] **Step 6: RED を確認する**

Run:

```bash
pnpm exec vitest run \
  src/shared/content/podcast-resolver.test.ts \
  src/server/api/system.test.ts \
  src/shared/nostr/client-integration.test.ts \
  src/shared/nostr/relay-integration.test.ts
```

Expected: FAIL。server / resolver 実装がまだ `nostr-tools` を import している。

- [ ] **Step 7: 実装を最小修正する**

```ts
// packages/auftakt/src/index.ts
export * from './crypto/index.js';

// src/shared/content/podcast-resolver.ts
import { verifyEvent } from '$packages/auftakt/src/index.js';

// src/server/api/system.ts
import { getPublicKey, hexToBytes } from '$packages/auftakt/src/index.js';

// src/server/api/podcast.ts
import { signEvent as finalizeEvent, hexToBytes } from '$packages/auftakt/src/index.js';
```

`src/server/api/podcast.ts` では `signBookmarkEvent()` の戻り値 shape が従来の signed event と一致することを維持する。

- [ ] **Step 8: Task 2 の回帰を確認する**

Run:

```bash
pnpm exec vitest run \
  packages/auftakt/src/crypto/index.test.ts \
  src/shared/content/podcast-resolver.test.ts \
  src/server/api/system.test.ts \
  src/server/api/app.test.ts \
  src/shared/nostr/client-integration.test.ts \
  src/shared/nostr/relay-integration.test.ts
```

Expected: PASS。

- [ ] **Step 9: 依存を追加・コミットする**

```bash
pnpm install @noble/curves @noble/hashes
git add package.json pnpm-lock.yaml packages/auftakt/src/crypto packages/auftakt/src/index.ts src/shared/content/podcast-resolver.ts src/shared/content/podcast-resolver.test.ts src/server/api/system.ts src/server/api/system.test.ts src/server/api/podcast.ts src/server/api/app.test.ts src/shared/nostr/client-integration.test.ts src/shared/nostr/relay-integration.test.ts
git commit -m "feat: add auftakt crypto module"
```

### Task 3: Replace `SimplePool` With Auftakt Client

**Files:**

- Create: `packages/auftakt/src/transport/client/index.ts`
- Create: `packages/auftakt/src/transport/client/index.test.ts`
- Modify: `packages/auftakt/src/index.ts`
- Modify: `src/shared/nostr/client.ts`
- Modify: `src/shared/nostr/client.test.ts`
- Modify: `src/shared/nostr/client-integration.test.ts`
- Modify: `src/shared/nostr/relay-integration.test.ts`
- Modify: `src/shared/nostr/auftakt-runtime.ts`

- [ ] **Step 1: `client` contract の failing test を書く**

```ts
import { describe, expect, it, vi } from 'vitest';

import { createClient } from './index.js';

describe('auftakt client', () => {
  it('query / subscribe / publish を提供する', async () => {
    const client = createClient({ defaultRelays: ['wss://relay.example.com'] });

    expect(typeof client.queryEvents).toBe('function');
    expect(typeof client.subscribeLiveEvents).toBe('function');
    expect(typeof client.publish).toBe('function');

    await client.dispose();
  });
});
```

- [ ] **Step 2: RED を確認する**

Run:

```bash
pnpm exec vitest run packages/auftakt/src/transport/client/index.test.ts
```

Expected: FAIL。`createClient` 未実装。

- [ ] **Step 3: `packages/auftakt` に最小 client 実装を書く**

```ts
export interface AuftaktClient {
  queryEvents(
    filters: Array<Record<string, unknown>>,
    options?: QueryOptions
  ): Promise<NostrEvent[]>;
  queryLatestEvent(
    filter: Record<string, unknown>,
    options?: QueryOptions
  ): Promise<NostrEvent | null>;
  subscribeBackwardEvents(
    filters: Array<Record<string, unknown>>,
    options: SubscriptionOptions
  ): Subscription;
  subscribeLiveEvents(
    filters: Array<Record<string, unknown>>,
    options: SubscriptionOptions
  ): Subscription;
  publish(event: NostrEvent, relayHints?: string[]): Promise<void>;
  observeRelayStates(subscriber: (packet: RelayConnectionStatePacket) => void): Subscription;
  dispose(): Promise<void>;
}

export function createClient(input: { defaultRelays: string[] }): AuftaktClient {
  /* ... */
}
```

- [ ] **Step 4: GREEN を確認する**

Run:

```bash
pnpm exec vitest run packages/auftakt/src/transport/client/index.test.ts
```

Expected: PASS。

- [ ] **Step 5: `src/shared/nostr/client.ts` を `packages/auftakt` wrapper に変える failing test を書く**

`src/shared/nostr/client.test.ts` の mock 対象を `nostr-tools` ではなく `packages/auftakt/src/transport/client` に変える。

```ts
vi.mock('$packages/auftakt/src/index.js', () => ({
  createClient: vi.fn(() => mockedClient)
}));
```

- [ ] **Step 6: RED を確認する**

Run:

```bash
pnpm exec vitest run \
  src/shared/nostr/client.test.ts \
  src/shared/nostr/client-integration.test.ts \
  src/shared/nostr/relay-integration.test.ts
```

Expected: FAIL。`src/shared/nostr/client.ts` がまだ `SimplePool` を直接持つ。

- [ ] **Step 7: wrapper と runtime を最小修正する**

```ts
// packages/auftakt/src/index.ts
export * from './transport/client/index.js';

// src/shared/nostr/client.ts
import { createClient as createAuftaktClient } from '$packages/auftakt/src/index.js';

const state = {
  client: createAuftaktClient({ defaultRelays: DEFAULT_RELAYS }),
  defaultRelays: [...DEFAULT_RELAYS]
};
```

`queryEvents`, `queryLatestEvent`, `subscribeBackwardEvents`, `subscribeLiveEvents`, `publishSignedEvent`, relay state observable は既存 public contract を維持したまま `AuftaktClient` へ委譲する。

- [ ] **Step 8: Task 3 の回帰を確認する**

Run:

```bash
pnpm exec vitest run \
  packages/auftakt/src/transport/client/index.test.ts \
  src/shared/nostr/client.test.ts \
  src/shared/nostr/client-integration.test.ts \
  src/shared/nostr/relay-integration.test.ts \
  src/shared/nostr/auftakt-runtime.test.ts
```

Expected: PASS。

- [ ] **Step 9: コミットする**

```bash
git add packages/auftakt/src/transport/client packages/auftakt/src/index.ts src/shared/nostr/client.ts src/shared/nostr/client.test.ts src/shared/nostr/client-integration.test.ts src/shared/nostr/relay-integration.test.ts src/shared/nostr/auftakt-runtime.ts
git commit -m "feat: add auftakt client transport"
```

### Task 4: Remove Direct Dependency And Run Final Regression

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: remaining files from `rg -l "nostr-tools" src packages`

- [ ] **Step 1: `nostr-tools` import 残件を固定する failing check を書く**

Run:

```bash
rg -n "nostr-tools" src packages package.json
```

Expected: `package.json` と未移行テストだけが残る、または FAIL 相当として残件が列挙される。

- [ ] **Step 2: direct dependency を削除する**

Run:

```bash
pnpm remove nostr-tools
```

Expected: `package.json` から direct dependency が消える。

- [ ] **Step 3: 残 import を解消する**

最後に以下を `packages/auftakt` export に寄せる。

- `src/features/comments/ui/comment-form-view-model.svelte.ts`
- `src/features/comments/ui/mention-candidates.ts`
- `src/features/profiles/domain/profile-model.ts`
- `src/lib/components/CommentActionMenu.svelte`
- `src/lib/components/NoteInput.svelte`
- `src/shared/nostr/helpers.ts`

- [ ] **Step 4: `nostr-tools` direct import が消えたことを確認する**

Run:

```bash
rg -n "nostr-tools" src packages package.json
```

Expected: no matches。

- [ ] **Step 5: 最終回帰を通す**

Run:

```bash
pnpm exec vitest run \
  packages/auftakt/src/nip19/index.test.ts \
  packages/auftakt/src/crypto/index.test.ts \
  packages/auftakt/src/transport/client/index.test.ts \
  src/shared/nostr/client.test.ts \
  src/shared/nostr/client-integration.test.ts \
  src/shared/nostr/relay-integration.test.ts \
  src/shared/nostr/auftakt-runtime.test.ts \
  src/shared/content/podcast-resolver.test.ts \
  src/server/api/system.test.ts \
  src/server/api/app.test.ts \
  src/shared/nostr/content-parser.test.ts \
  src/shared/nostr/nip19-decode.test.ts \
  src/shared/nostr/events.test.ts
```

Expected: PASS。

- [ ] **Step 6: コミットする**

```bash
git add package.json pnpm-lock.yaml packages/auftakt/src/index.ts packages/auftakt/src/nip19 packages/auftakt/src/crypto packages/auftakt/src/transport/client src/shared/nostr/client.ts src/shared/nostr/helpers.ts src/shared/content/podcast-resolver.ts src/server/api/system.ts src/server/api/podcast.ts src/lib/components/CommentActionMenu.svelte src/lib/components/NoteInput.svelte src/features/profiles/domain/profile-model.ts src/features/comments/ui/comment-form-view-model.svelte.ts src/features/comments/ui/mention-candidates.ts src/features/comments/ui/mention-candidates.test.ts src/shared/nostr/content-parser.test.ts src/shared/nostr/nip19-decode.test.ts src/shared/nostr/events.test.ts src/shared/nostr/client.test.ts src/shared/nostr/client-integration.test.ts src/shared/nostr/relay-integration.test.ts src/shared/content/podcast-resolver.test.ts src/server/api/app.test.ts src/server/api/system.test.ts
git commit -m "refactor: remove nostr-tools direct dependency"
```
