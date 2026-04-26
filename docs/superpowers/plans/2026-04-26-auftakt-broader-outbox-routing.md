# Auftakt Broader Outbox Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove and implement broader coordinator-owned outbox routing for reply, reaction, mention, and addressable `a` tag publish flows.

**Architecture:** Keep `@auftakt/core` relay selection semantics unchanged. Extend `@auftakt/resonote` runtime candidate gathering so valid `a` tags contribute explicit relay hints and durable local target hints, then guard the behavior with package contract tests and the strict goal audit gate.

**Tech Stack:** TypeScript, Vitest, Auftakt workspace packages, Resonote coordinator runtime, existing strict audit scripts.

---

## File Structure

- Modify `packages/resonote/src/relay-selection-runtime.contract.test.ts`
  - Responsibility: focused relay selection runtime proof for addressable reads, addressable publish routing, and `default-only` suppression.
- Modify `packages/resonote/src/relay-routing-publish.contract.test.ts`
  - Responsibility: coordinator publish transport proof for reply, reaction, mention, explicit addressable hints, and durable addressable hints.
- Modify `packages/resonote/src/relay-selection-runtime.ts`
  - Responsibility: collect `a` tag relay candidates from explicit tag hints and locally resolved replaceable/addressable event relay hints.
- Modify `scripts/check-auftakt-strict-goal-audit.test.ts`
  - Responsibility: strict audit checker regression coverage for broader outbox evidence.
- Modify `scripts/check-auftakt-strict-goal-audit.ts`
  - Responsibility: require broader outbox implementation proof files and audit wording.
- Modify `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`
  - Responsibility: human-readable strict goal gap audit status and verification evidence.

---

### Task 1: Add Broader Outbox Routing Contract Tests

**Files:**

- Modify: `packages/resonote/src/relay-selection-runtime.contract.test.ts`
- Modify: `packages/resonote/src/relay-routing-publish.contract.test.ts`

- [ ] **Step 1: Extend the relay selection runtime fixture**

In `packages/resonote/src/relay-selection-runtime.contract.test.ts`, replace `createRuntimeFixture()` with this version:

```ts
function createRuntimeFixture() {
  const getRelayHints = vi.fn(async (eventId: string) => {
    if (eventId === 'target') {
      return [
        {
          eventId: 'target',
          relayUrl: 'wss://durable.example',
          source: 'seen' as const,
          lastSeenAt: 1
        }
      ];
    }
    if (eventId === 'addressable-target') {
      return [
        {
          eventId: 'addressable-target',
          relayUrl: 'wss://addressable-durable.example',
          source: 'seen' as const,
          lastSeenAt: 2
        }
      ];
    }
    return [];
  });
  const getByPubkeyAndKind = vi.fn(async (pubkey: string, kind: number) =>
    kind === 10002 && pubkey === 'alice'
      ? event({
          pubkey,
          kind,
          tags: [
            ['r', 'wss://alice-read.example', 'read'],
            ['r', 'wss://alice-write.example', 'write']
          ]
        })
      : null
  );
  const getByReplaceKey = vi.fn(async (pubkey: string, kind: number, dTag: string) =>
    pubkey === 'bob' && kind === 30023 && dTag === 'article'
      ? event({
          id: 'addressable-target',
          pubkey,
          kind,
          tags: [['d', dTag]],
          content: 'addressable article'
        })
      : null
  );

  return {
    async getDefaultRelays() {
      return ['wss://default.example'];
    },
    async getEventsDB() {
      return {
        getRelayHints,
        getByPubkeyAndKind,
        getByReplaceKey
      };
    },
    getRelayHints,
    getByPubkeyAndKind,
    getByReplaceKey
  };
}
```

- [ ] **Step 2: Add focused relay selection runtime tests**

Add these tests inside `describe('resonote relay selection runtime', ...)` before the default policy test:

```ts
it('builds addressable read overlays from author relay-list write relays', async () => {
  const runtime = createRuntimeFixture();

  const overlay = await buildReadRelayOverlay(runtime, {
    intent: 'read',
    filters: [{ kinds: [30023], authors: ['alice'], '#d': ['article'], limit: 1 }],
    policy
  });

  expect(runtime.getByPubkeyAndKind).toHaveBeenCalledWith('alice', 10002);
  expect(overlay).toEqual({
    relays: ['wss://default.example/', 'wss://alice-write.example/'],
    includeDefaultReadRelays: false
  });
});

it('builds publish options from addressable explicit relay hints', async () => {
  const runtime = createRuntimeFixture();

  const options = await buildPublishRelaySendOptions(runtime, {
    event: event({
      id: 'reply-to-addressable',
      pubkey: 'alice',
      kind: 1111,
      tags: [['a', '30023:bob:remote', 'wss://addressable-explicit.example']]
    }),
    policy
  });

  expect(runtime.getByReplaceKey).toHaveBeenCalledWith('bob', 30023, 'remote');
  expect(options).toEqual({
    on: {
      relays: [
        'wss://alice-write.example/',
        'wss://default.example/',
        'wss://addressable-explicit.example/'
      ],
      defaultWriteRelays: false
    }
  });
});

it('builds publish options from durable hints for local addressable targets', async () => {
  const runtime = createRuntimeFixture();

  const options = await buildPublishRelaySendOptions(runtime, {
    event: event({
      id: 'reply-to-local-addressable',
      pubkey: 'alice',
      kind: 1111,
      tags: [['a', '30023:bob:article']]
    }),
    policy
  });

  expect(runtime.getByReplaceKey).toHaveBeenCalledWith('bob', 30023, 'article');
  expect(runtime.getRelayHints).toHaveBeenCalledWith('addressable-target');
  expect(options).toEqual({
    on: {
      relays: [
        'wss://alice-write.example/',
        'wss://default.example/',
        'wss://addressable-durable.example/'
      ],
      defaultWriteRelays: false
    }
  });
});

it('default-only policy suppresses broader outbox publish candidates', async () => {
  const runtime = createRuntimeFixture();

  const options = await buildPublishRelaySendOptions(runtime, {
    event: event({
      id: 'broad-publish',
      pubkey: 'alice',
      kind: 1111,
      tags: [
        ['e', 'target', 'wss://explicit-target.example'],
        ['p', 'bob', 'wss://explicit-pubkey.example'],
        ['a', '30023:bob:article', 'wss://addressable-explicit.example']
      ]
    }),
    policy: { strategy: 'default-only' }
  });

  expect(options).toEqual({
    on: {
      relays: ['wss://default.example/'],
      defaultWriteRelays: false
    }
  });
});

it('ignores malformed addressable tags and invalid addressable relay hints', async () => {
  const runtime = createRuntimeFixture();

  const options = await buildPublishRelaySendOptions(runtime, {
    event: event({
      id: 'malformed-addressable',
      pubkey: 'alice',
      kind: 1111,
      tags: [
        ['a', '30023:bob', 'wss://malformed-explicit.example'],
        ['a', 'not-a-kind:bob:article', 'wss://invalid-kind.example'],
        ['a', '30023:bob:article', 'https://not-websocket.example']
      ]
    }),
    policy
  });

  expect(runtime.getByReplaceKey).toHaveBeenCalledWith('bob', 30023, 'article');
  expect(options).toEqual({
    on: {
      relays: [
        'wss://alice-write.example/',
        'wss://default.example/',
        'wss://addressable-durable.example/'
      ],
      defaultWriteRelays: false
    }
  });
});
```

- [ ] **Step 3: Extend the coordinator publish fixture**

In `packages/resonote/src/relay-routing-publish.contract.test.ts`, update `createRuntime()` so `getByPubkeyAndKind`, `getByReplaceKey`, and `getRelayHints` cover Bob and the local addressable target:

```ts
        getByPubkeyAndKind: async (pubkey: string, kind: number) => {
          if (kind !== 10002) return null;
          if (pubkey === 'alice') {
            return {
              id: 'alice-relay-list',
              pubkey,
              created_at: 1,
              kind,
              tags: [['r', 'wss://alice-write.example', 'write']],
              content: ''
            };
          }
          if (pubkey === 'bob') {
            return {
              id: 'bob-relay-list',
              pubkey,
              created_at: 1,
              kind,
              tags: [['r', 'wss://bob-read.example', 'read']],
              content: ''
            };
          }
          return null;
        },
        getByReplaceKey: async (pubkey: string, kind: number, dTag: string) =>
          pubkey === 'bob' && kind === 30023 && dTag === 'article'
            ? {
                id: 'addressable-target',
                pubkey,
                created_at: 2,
                kind,
                tags: [['d', dTag]],
                content: 'article'
              }
            : null,
        getRelayHints: async (eventId: string) => {
          if (eventId === 'target') {
            return [
              {
                eventId,
                relayUrl: 'wss://target-seen.example',
                source: 'seen' as const,
                lastSeenAt: 1
              }
            ];
          }
          if (eventId === 'addressable-target') {
            return [
              {
                eventId,
                relayUrl: 'wss://addressable-seen.example',
                source: 'seen' as const,
                lastSeenAt: 2
              }
            ];
          }
          return [];
        },
```

- [ ] **Step 4: Add coordinator publish routing tests**

Add these tests inside `describe('coordinator publish relay routing', ...)` after the existing author/audience relay test:

```ts
it('passes selected relays to reaction publish transport', async () => {
  const castSigned = vi.fn(async () => {});
  const event = {
    id: 'reaction',
    pubkey: 'alice',
    created_at: 10,
    kind: 7,
    tags: [['e', 'target', 'wss://explicit-target.example']],
    content: '+',
    sig: 'sig'
  } satisfies NostrEvent;

  const coordinator = createResonoteCoordinator({
    runtime: createRuntime(),
    cachedFetchByIdRuntime: {
      cachedFetchById: async () => ({ event: null, settlement: null }),
      invalidateFetchByIdCache: () => {}
    },
    cachedLatestRuntime: { useCachedLatest: () => null },
    publishTransportRuntime: { castSigned },
    pendingPublishQueueRuntime: {
      addPendingPublish: async () => {},
      drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
    },
    relayStatusRuntime: {
      fetchLatestEvent: async () => null,
      setDefaultRelays: async () => {}
    }
  });

  await coordinator.publishSignedEvent(event as EventParameters);

  expect(castSigned).toHaveBeenCalledWith(event, {
    on: {
      relays: [
        'wss://alice-write.example/',
        'wss://default.example/',
        'wss://target-seen.example/',
        'wss://explicit-target.example/'
      ],
      defaultWriteRelays: false
    }
  });
});

it('passes selected audience relays to mention publish transport', async () => {
  const castSigned = vi.fn(async () => {});
  const event = {
    id: 'mention',
    pubkey: 'alice',
    created_at: 10,
    kind: 1,
    tags: [['p', 'bob', 'wss://bob-explicit.example']],
    content: 'mention',
    sig: 'sig'
  } satisfies NostrEvent;

  const coordinator = createResonoteCoordinator({
    runtime: createRuntime(),
    cachedFetchByIdRuntime: {
      cachedFetchById: async () => ({ event: null, settlement: null }),
      invalidateFetchByIdCache: () => {}
    },
    cachedLatestRuntime: { useCachedLatest: () => null },
    publishTransportRuntime: { castSigned },
    pendingPublishQueueRuntime: {
      addPendingPublish: async () => {},
      drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
    },
    relayStatusRuntime: {
      fetchLatestEvent: async () => null,
      setDefaultRelays: async () => {}
    }
  });

  await coordinator.publishSignedEvent(event as EventParameters);

  expect(castSigned).toHaveBeenCalledWith(event, {
    on: {
      relays: [
        'wss://alice-write.example/',
        'wss://default.example/',
        'wss://bob-explicit.example/',
        'wss://bob-read.example/'
      ],
      defaultWriteRelays: false
    }
  });
});

it('passes addressable explicit relay hints to publish transport', async () => {
  const castSigned = vi.fn(async () => {});
  const event = {
    id: 'addressable-explicit',
    pubkey: 'alice',
    created_at: 10,
    kind: 1111,
    tags: [['a', '30023:bob:remote', 'wss://addressable-explicit.example']],
    content: 'reply to addressable',
    sig: 'sig'
  } satisfies NostrEvent;

  const coordinator = createResonoteCoordinator({
    runtime: createRuntime(),
    cachedFetchByIdRuntime: {
      cachedFetchById: async () => ({ event: null, settlement: null }),
      invalidateFetchByIdCache: () => {}
    },
    cachedLatestRuntime: { useCachedLatest: () => null },
    publishTransportRuntime: { castSigned },
    pendingPublishQueueRuntime: {
      addPendingPublish: async () => {},
      drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
    },
    relayStatusRuntime: {
      fetchLatestEvent: async () => null,
      setDefaultRelays: async () => {}
    }
  });

  await coordinator.publishSignedEvent(event as EventParameters);

  expect(castSigned).toHaveBeenCalledWith(event, {
    on: {
      relays: [
        'wss://alice-write.example/',
        'wss://default.example/',
        'wss://addressable-explicit.example/'
      ],
      defaultWriteRelays: false
    }
  });
});

it('passes durable addressable target hints to publish transport', async () => {
  const castSigned = vi.fn(async () => {});
  const event = {
    id: 'addressable-durable',
    pubkey: 'alice',
    created_at: 10,
    kind: 1111,
    tags: [['a', '30023:bob:article']],
    content: 'reply to local addressable',
    sig: 'sig'
  } satisfies NostrEvent;

  const coordinator = createResonoteCoordinator({
    runtime: createRuntime(),
    cachedFetchByIdRuntime: {
      cachedFetchById: async () => ({ event: null, settlement: null }),
      invalidateFetchByIdCache: () => {}
    },
    cachedLatestRuntime: { useCachedLatest: () => null },
    publishTransportRuntime: { castSigned },
    pendingPublishQueueRuntime: {
      addPendingPublish: async () => {},
      drainPendingPublishes: async () => ({ emissions: [], settledCount: 0, retryingCount: 0 })
    },
    relayStatusRuntime: {
      fetchLatestEvent: async () => null,
      setDefaultRelays: async () => {}
    }
  });

  await coordinator.publishSignedEvent(event as EventParameters);

  expect(castSigned).toHaveBeenCalledWith(event, {
    on: {
      relays: [
        'wss://alice-write.example/',
        'wss://default.example/',
        'wss://addressable-seen.example/'
      ],
      defaultWriteRelays: false
    }
  });
});
```

- [ ] **Step 5: Run focused tests and verify the intended failure**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts
```

Expected: FAIL. The addressable explicit relay and durable local target tests fail because `buildPublishRelaySendOptions()` does not inspect `a` tags yet. Existing reply, reaction, mention, and default-only regression tests either pass or fail only because of the missing `a` tag candidate collection.

---

### Task 2: Implement Addressable Outbox Candidate Collection

**Files:**

- Modify: `packages/resonote/src/relay-selection-runtime.ts`
- Modify: `packages/resonote/src/relay-selection-runtime.contract.test.ts`
- Modify: `packages/resonote/src/relay-routing-publish.contract.test.ts`

- [ ] **Step 1: Extend the runtime DB type**

In `packages/resonote/src/relay-selection-runtime.ts`, add `getByReplaceKey` to the object returned by `RelaySelectionRuntime.getEventsDB()`:

```ts
    getByReplaceKey?(pubkey: string, kind: number, dTag: string): Promise<StoredEvent | null>;
```

The interface block becomes:

```ts
export interface RelaySelectionRuntime {
  getDefaultRelays?(): Promise<readonly string[]> | readonly string[];
  getEventsDB(): Promise<{
    getByPubkeyAndKind?(pubkey: string, kind: number): Promise<StoredEvent | null>;
    getByReplaceKey?(pubkey: string, kind: number, dTag: string): Promise<StoredEvent | null>;
    getRelayHints?(eventId: string): Promise<
      Array<{
        readonly eventId: string;
        readonly relayUrl: string;
        readonly source: 'seen' | 'hinted' | 'published' | 'repaired';
        readonly lastSeenAt: number;
      }>
    >;
  }>;
}
```

- [ ] **Step 2: Add addressable candidates to publish routing**

In `buildPublishRelaySendOptions()`, add the addressable target candidate call after the `p` tag audience loop:

```ts
for (const pubkey of collectTagValues(tags, new Set(['p']))) {
  if (typeof input.event.pubkey === 'string' && pubkey === input.event.pubkey) continue;
  candidates.push(...(await audienceRelayCandidates(db, pubkey)));
}
candidates.push(...(await addressableTargetCandidates(db, tags)));
```

- [ ] **Step 3: Add addressable tag helpers**

In `packages/resonote/src/relay-selection-runtime.ts`, add this type after `type RelaySelectionDb`:

```ts
interface AddressableTagReference {
  readonly kind: number;
  readonly pubkey: string;
  readonly dTag: string;
}
```

Add this helper after `audienceRelayCandidates()`:

```ts
async function addressableTargetCandidates(
  db: RelaySelectionDb,
  tags: readonly (readonly string[])[]
): Promise<RelaySelectionCandidate[]> {
  if (typeof db.getByReplaceKey !== 'function') return [];

  const candidates: RelaySelectionCandidate[] = [];
  for (const reference of collectAddressableTagReferences(tags)) {
    const target = await db.getByReplaceKey(reference.pubkey, reference.kind, reference.dTag);
    if (!target) continue;
    candidates.push(...(await durableHintCandidates(db, target.id, 'write')));
  }
  return candidates;
}
```

Add these parsing helpers after `collectTagValues()`:

```ts
function collectAddressableTagReferences(
  tags: readonly (readonly string[])[]
): AddressableTagReference[] {
  const values = new Map<string, AddressableTagReference>();
  for (const tag of tags) {
    if (tag[0] !== 'a' || typeof tag[1] !== 'string') continue;
    const parsed = parseAddressableTagValue(tag[1]);
    if (!parsed) continue;
    values.set(`${parsed.kind}:${parsed.pubkey}:${parsed.dTag}`, parsed);
  }
  return [...values.values()].sort((left, right) => {
    const kindOrder = left.kind - right.kind;
    if (kindOrder !== 0) return kindOrder;
    const pubkeyOrder = left.pubkey.localeCompare(right.pubkey);
    if (pubkeyOrder !== 0) return pubkeyOrder;
    return left.dTag.localeCompare(right.dTag);
  });
}

function parseAddressableTagValue(value: string): AddressableTagReference | null {
  const firstSeparator = value.indexOf(':');
  const secondSeparator = firstSeparator === -1 ? -1 : value.indexOf(':', firstSeparator + 1);
  if (firstSeparator <= 0 || secondSeparator <= firstSeparator + 1) return null;

  const kind = Number(value.slice(0, firstSeparator));
  const pubkey = value.slice(firstSeparator + 1, secondSeparator);
  const dTag = value.slice(secondSeparator + 1);
  if (!Number.isInteger(kind) || kind < 0) return null;
  if (pubkey.length === 0 || dTag.length === 0) return null;

  return { kind, pubkey, dTag };
}
```

- [ ] **Step 4: Include valid `a` tag explicit relay hints**

Replace `collectExplicitRelayHints()` with:

```ts
function collectExplicitRelayHints(tags: readonly (readonly string[])[]): string[] {
  const values = new Set<string>();
  for (const tag of tags) {
    if ((tag[0] === 'e' || tag[0] === 'q' || tag[0] === 'p') && typeof tag[2] === 'string') {
      values.add(tag[2]);
      continue;
    }
    if (
      tag[0] === 'a' &&
      typeof tag[1] === 'string' &&
      parseAddressableTagValue(tag[1]) &&
      typeof tag[2] === 'string'
    ) {
      values.add(tag[2]);
    }
  }
  return [...values].sort();
}
```

- [ ] **Step 5: Run focused tests and verify pass**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit broader outbox routing implementation**

Run:

```bash
git add packages/resonote/src/relay-selection-runtime.ts packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts
git commit -m "feat(auftakt): route addressable outbox candidates"
```

---

### Task 3: Gate Broader Outbox Routing In Strict Audit

**Files:**

- Modify: `scripts/check-auftakt-strict-goal-audit.test.ts`
- Modify: `scripts/check-auftakt-strict-goal-audit.ts`
- Modify: `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`

- [ ] **Step 1: Add failing strict audit checker tests**

In `scripts/check-auftakt-strict-goal-audit.test.ts`, add this sentence to `validAuditText` after the ordinary read capability evidence:

```ts
Broader outbox routing now uses coordinator-selected author, audience, explicit addressable, and durable addressable relay candidates while default-only suppresses broader candidates.
```

Add these proof files to `validRequiredProofFiles`:

```ts
(file(
  'packages/resonote/src/relay-selection-runtime.ts',
  'addressableTargetCandidates\ngetByReplaceKey\ncollectAddressableTagReferences'
),
  file(
    'packages/resonote/src/relay-selection-runtime.contract.test.ts',
    'builds publish options from addressable explicit relay hints\nbuilds publish options from durable hints for local addressable targets\ndefault-only policy suppresses broader outbox publish candidates\nignores malformed addressable tags and invalid addressable relay hints'
  ),
  file(
    'packages/resonote/src/relay-routing-publish.contract.test.ts',
    'passes selected relays to reaction publish transport\npasses selected audience relays to mention publish transport\npasses addressable explicit relay hints to publish transport\npasses durable addressable target hints to publish transport'
  ));
```

Add this test after the ordinary read capability checker test:

```ts
it('requires broader outbox routing implementation proof', () => {
  const result = checkStrictGoalAudit([
    file(
      STRICT_GOAL_AUDIT_PATH,
      validAuditText.replace(
        'Broader outbox routing now uses coordinator-selected author, audience, explicit addressable, and durable addressable relay candidates while default-only suppresses broader candidates.',
        'Broader outbox evidence removed.'
      )
    ),
    ...validRequiredProofFiles
  ]);

  expect(result.ok).toBe(false);
  expect(result.errors).toContain(
    `${STRICT_GOAL_AUDIT_PATH} is missing broader outbox routing implementation evidence`
  );
});
```

- [ ] **Step 2: Run the strict audit test and verify failure**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-goal-audit.test.ts
```

Expected: FAIL. The new broader outbox evidence test passes only after the checker knows the new required evidence and proof files.

- [ ] **Step 3: Require broader outbox evidence in the checker**

In `scripts/check-auftakt-strict-goal-audit.ts`, add this constant after `REQUIRED_ORDINARY_READ_CAPABILITY_FILES`:

```ts
const REQUIRED_BROADER_OUTBOX_AUDIT_EVIDENCE =
  'Broader outbox routing now uses coordinator-selected author, audience, explicit addressable, and durable addressable relay candidates while default-only suppresses broader candidates.';

const REQUIRED_BROADER_OUTBOX_FILES = [
  {
    path: 'packages/resonote/src/relay-selection-runtime.ts',
    text: 'addressableTargetCandidates',
    description: 'addressable target candidate collector'
  },
  {
    path: 'packages/resonote/src/relay-selection-runtime.ts',
    text: 'collectAddressableTagReferences',
    description: 'addressable tag parser'
  },
  {
    path: 'packages/resonote/src/relay-selection-runtime.contract.test.ts',
    text: 'builds publish options from addressable explicit relay hints',
    description: 'addressable explicit relay selection contract'
  },
  {
    path: 'packages/resonote/src/relay-selection-runtime.contract.test.ts',
    text: 'builds publish options from durable hints for local addressable targets',
    description: 'addressable durable relay selection contract'
  },
  {
    path: 'packages/resonote/src/relay-selection-runtime.contract.test.ts',
    text: 'default-only policy suppresses broader outbox publish candidates',
    description: 'default-only broader outbox suppression contract'
  },
  {
    path: 'packages/resonote/src/relay-selection-runtime.contract.test.ts',
    text: 'ignores malformed addressable tags and invalid addressable relay hints',
    description: 'malformed addressable tag suppression contract'
  },
  {
    path: 'packages/resonote/src/relay-routing-publish.contract.test.ts',
    text: 'passes selected relays to reaction publish transport',
    description: 'reaction publish coordinator routing contract'
  },
  {
    path: 'packages/resonote/src/relay-routing-publish.contract.test.ts',
    text: 'passes selected audience relays to mention publish transport',
    description: 'mention publish coordinator routing contract'
  },
  {
    path: 'packages/resonote/src/relay-routing-publish.contract.test.ts',
    text: 'passes addressable explicit relay hints to publish transport',
    description: 'addressable explicit coordinator routing contract'
  },
  {
    path: 'packages/resonote/src/relay-routing-publish.contract.test.ts',
    text: 'passes durable addressable target hints to publish transport',
    description: 'addressable durable coordinator routing contract'
  }
];
```

Add this check after the ordinary read evidence check:

```ts
if (!strictAudit.text.includes(REQUIRED_BROADER_OUTBOX_AUDIT_EVIDENCE)) {
  errors.push(`${strictAudit.path} is missing broader outbox routing implementation evidence`);
}
```

Add this proof loop after the ordinary read proof loop:

```ts
for (const required of REQUIRED_BROADER_OUTBOX_FILES) {
  const text = findFileText(files, required.path);
  if (text === null) {
    errors.push(`${required.path} is missing for strict broader outbox routing audit`);
    continue;
  }
  if (!text.includes(required.text)) {
    errors.push(`${required.path} is missing ${required.description}: ${required.text}`);
  }
}
```

Update `collectFiles()` to include:

```ts
('packages/resonote/src/relay-selection-runtime.ts',
  'packages/resonote/src/relay-selection-runtime.contract.test.ts',
  'packages/resonote/src/relay-routing-publish.contract.test.ts');
```

- [ ] **Step 4: Update strict gap audit documentation**

In `docs/auftakt/2026-04-26-strict-goal-gap-audit.md`, replace follow-up candidate 4 with:

```md
4. Broader outbox routing. `Implemented in this slice; keep broader outbox routing regression gates active.`
```

Add this verification bullet after the ordinary read capability bullet:

```md
- Broader outbox routing now uses coordinator-selected author, audience, explicit addressable, and durable addressable relay candidates while default-only suppresses broader candidates.
```

- [ ] **Step 5: Run the strict audit tests and checker**

Run:

```bash
pnpm exec vitest run scripts/check-auftakt-strict-goal-audit.test.ts
pnpm run check:auftakt:strict-goal-audit
```

Expected: PASS.

- [ ] **Step 6: Commit strict audit gate**

Run:

```bash
git add scripts/check-auftakt-strict-goal-audit.ts scripts/check-auftakt-strict-goal-audit.test.ts docs/auftakt/2026-04-26-strict-goal-gap-audit.md
git commit -m "test(auftakt): gate broader outbox routing proof"
```

---

### Task 4: Run Completion Verification

**Files:**

- No source edits in this task.

- [ ] **Step 1: Run focused broader outbox and audit tests**

Run:

```bash
pnpm exec vitest run packages/resonote/src/relay-selection-runtime.contract.test.ts packages/resonote/src/relay-routing-publish.contract.test.ts scripts/check-auftakt-strict-goal-audit.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run Resonote package tests**

Run:

```bash
pnpm run test:auftakt:resonote
```

Expected: PASS.

- [ ] **Step 3: Run strict gates**

Run:

```bash
pnpm run check:auftakt:strict-goal-audit
pnpm run check:auftakt:strict-closure
pnpm run check:auftakt-migration -- --proof
```

Expected: PASS.

- [ ] **Step 4: Run package-wide tests**

Run:

```bash
pnpm run test:packages
```

Expected: PASS.

- [ ] **Step 5: Inspect final branch state**

Run:

```bash
git status --short
git log --oneline -4
```

Expected: only pre-existing unrelated dirty files remain outside this slice, and the latest commits include:

```text
test(auftakt): gate broader outbox routing proof
feat(auftakt): route addressable outbox candidates
docs(auftakt): design broader outbox routing
```
