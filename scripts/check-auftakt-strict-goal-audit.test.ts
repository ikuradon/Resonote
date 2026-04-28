import { describe, expect, it } from 'vitest';

import {
  checkStrictGoalAudit,
  STRICT_GOAL_AUDIT_PATH,
  type StrictGoalAuditFile
} from './check-auftakt-strict-goal-audit.ts';

function file(path: string, text: string): StrictGoalAuditFile {
  return { path, text };
}

const validAuditText = `# Auftakt Strict Goal Gap Audit

## Strict Final Goal

## Scoped Completion Baseline

## Classification Model

Satisfied
Scoped-Satisfied
Partial
Missing

## Seven Goal Matrix

rx-nostr-like reconnect and REQ optimization
NDK-like API convenience
strfry-like local-first event processing
NIP compliance
Offline incremental and kind:5
Minimal core plus plugin extensions
Single coordinator and database mediation

## Coordinator Mediation Audit

app-facing facade
package public API
plugin API
runtime internals
core primitives

## First Implementation Phase

strict coordinator audit closure

## Verification

pnpm run check:auftakt-migration -- --proof
pnpm run check:auftakt:strict-closure

Publish settlement now has core vocabulary and coordinator-owned local materialization, relay hint, and pending queue proof.
Sync cursor incremental repair now persists Dexie ordered cursors and bounds fallback and negentropy repair through coordinator-owned runtime repair.
Ordinary read capability verification now routes latest and backward coordinator reads through negentropy-first RelayGateway verification with REQ fallback.
Broader outbox routing now uses coordinator-selected author, audience, explicit addressable, and durable addressable relay candidates while default-only suppresses broader candidates.
Plugin model API now gives extensions coordinator-mediated event, user, addressable, relay-set, and relay-hint handles without exposing raw storage or transport handles.
Storage hot-path hardening now proves Dexie kind-bounded traversal, projection reads, max-created lookups, and HotEventIndex kind, tag, replaceable, deletion, and relay-hint paths without broad event-table scans.
App-facing local comment, follow graph, and maintenance helpers now call coordinator-owned local store methods without exposing openEventsDb or raw event database handles.
`;

const validRequiredProofFiles = [
  file('packages/core/src/settlement.ts', 'export function reducePublishSettlement() {}'),
  file(
    'packages/resonote/src/event-coordinator.ts',
    'return { settlement: reducePublishSettlement({ localMaterialized: true, relayAccepted: true, queued: false }) };'
  ),
  file(
    'packages/adapter-dexie/src/index.ts',
    "async putSyncCursor(record) { await this.db.sync_cursors.put(record); }\nwhere('[kind+created_at]')\nwhere('[pubkey+kind+created_at]')\nlistOrderedEventsByKind"
  ),
  file(
    'packages/resonote/src/runtime.ts',
    'const cursor = await loadRepairSyncCursor(eventsDB, cursorState);\ncreateOrdinaryReadRelayGateway\nverifyOrdinaryReadRelayCandidates\nResonoteCoordinatorPluginModels\nreadonly models: ResonoteCoordinatorPluginModels\ncreatePluginRegistrationApi(pending, entityHandles)\nreadCommentEventsByTag(tagQuery: string): Promise<StoredEvent[]>;\nclearStoredEvents(): Promise<void>;'
  ),
  file(
    'packages/resonote/src/relay-repair.contract.test.ts',
    'resumes fallback repair from a persisted cursor after runtime recreation'
  ),
  file(
    'packages/resonote/src/public-read-cutover.contract.test.ts',
    'attempts negentropy before ordinary latest REQ verification\nuses capability-aware gateway for backward event reads'
  ),
  file(
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
  ),
  file(
    'packages/resonote/src/plugin-api.contract.test.ts',
    'lets plugins register read models backed by coordinator model handles\nResonoteCoordinatorPluginModels'
  ),
  file(
    'packages/resonote/src/plugin-isolation.contract.test.ts',
    'getAddressable\ngetEvent\ngetRelayHints\ngetRelaySet\ngetUser\nmaterializerQueue'
  ),
  file(
    'packages/adapter-dexie/src/hot-path.contract.test.ts',
    'uses kind index for ordered traversal\nuses kind index for projection source traversal\nuses pubkey kind created_at index for author max created_at lookups\nkeeps tag and relay hint hot paths indexed'
  ),
  file(
    'packages/adapter-dexie/src/schema.ts',
    '[pubkey+kind+created_at]\nthis.version(4).stores(versionFourStores)'
  ),
  file(
    'packages/resonote/src/hot-event-index.contract.test.ts',
    'orders hot kind lookups and applies limit and cursor\nfilters hot tag lookups by kind\nkeeps hot replaceable heads\nremoves deleted events from all hot indexes\nsorts hot relay hints newest first'
  ),
  file(
    'packages/resonote/src/hot-event-index.ts',
    'getByKind(kind, options\ngetReplaceableHead(pubkey, kind, dTag\nreplaceableHeads'
  ),
  file(
    'packages/resonote/src/event-coordinator.contract.test.ts',
    'prefills tag reads from hot index while still checking durable store\nprefills kind reads from hot index while still checking durable store'
  ),
  file(
    'src/shared/auftakt/resonote.ts',
    'return coordinator.readCommentEventsByTag(tagQuery);\nreturn coordinator.clearStoredEvents();'
  ),
  file(
    'packages/resonote/src/local-store-api.contract.test.ts',
    'keeps raw event database handles out of the public coordinator surface'
  )
];

describe('checkStrictGoalAudit', () => {
  it('requires the strict goal gap audit artifact', () => {
    const result = checkStrictGoalAudit([]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(`${STRICT_GOAL_AUDIT_PATH} is missing`);
  });

  it('requires all seven strict goal areas', () => {
    const result = checkStrictGoalAudit([
      file(
        STRICT_GOAL_AUDIT_PATH,
        validAuditText.replace('NDK-like API convenience', 'NDK API row removed')
      ),
      ...validRequiredProofFiles
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      `${STRICT_GOAL_AUDIT_PATH} is missing required strict goal area: NDK-like API convenience`
    );
  });

  it('rejects ambiguous strict final completion claims', () => {
    const result = checkStrictGoalAudit([
      file(
        STRICT_GOAL_AUDIT_PATH,
        `${validAuditText}\nStrict final completion is Satisfied for all goals.\n`
      ),
      ...validRequiredProofFiles
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      `${STRICT_GOAL_AUDIT_PATH} claims strict final completion without preserving scoped-vs-strict distinction`
    );
  });

  it('passes a complete strict goal gap audit artifact', () => {
    const result = checkStrictGoalAudit([
      file(STRICT_GOAL_AUDIT_PATH, validAuditText),
      ...validRequiredProofFiles
    ]);

    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('requires coordinator-owned publish settlement implementation proof', () => {
    const result = checkStrictGoalAudit([
      file(
        STRICT_GOAL_AUDIT_PATH,
        validAuditText.replace(
          'Publish settlement now has core vocabulary and coordinator-owned local materialization, relay hint, and pending queue proof.',
          'Publish settlement evidence removed.'
        )
      ),
      ...validRequiredProofFiles
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      `${STRICT_GOAL_AUDIT_PATH} is missing coordinator-owned publish settlement implementation evidence`
    );
  });

  it('requires sync cursor incremental repair implementation proof', () => {
    const result = checkStrictGoalAudit([
      file(
        STRICT_GOAL_AUDIT_PATH,
        validAuditText.replace(
          'Sync cursor incremental repair now persists Dexie ordered cursors and bounds fallback and negentropy repair through coordinator-owned runtime repair.',
          'Sync cursor evidence removed.'
        )
      ),
      ...validRequiredProofFiles
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      `${STRICT_GOAL_AUDIT_PATH} is missing sync cursor incremental repair implementation evidence`
    );
  });

  it('requires ordinary read capability verification implementation proof', () => {
    const result = checkStrictGoalAudit([
      file(
        STRICT_GOAL_AUDIT_PATH,
        validAuditText.replace(
          'Ordinary read capability verification now routes latest and backward coordinator reads through negentropy-first RelayGateway verification with REQ fallback.',
          'Ordinary read capability evidence removed.'
        )
      ),
      ...validRequiredProofFiles
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      `${STRICT_GOAL_AUDIT_PATH} is missing ordinary read capability verification implementation evidence`
    );
  });

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

  it('requires plugin model api implementation proof', () => {
    const result = checkStrictGoalAudit([
      file(
        STRICT_GOAL_AUDIT_PATH,
        validAuditText.replace(
          'Plugin model API now gives extensions coordinator-mediated event, user, addressable, relay-set, and relay-hint handles without exposing raw storage or transport handles.',
          'Plugin model API evidence removed.'
        )
      ),
      ...validRequiredProofFiles
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      `${STRICT_GOAL_AUDIT_PATH} is missing plugin model API implementation evidence`
    );
  });

  it('requires storage hot-path hardening implementation proof', () => {
    const result = checkStrictGoalAudit([
      file(
        STRICT_GOAL_AUDIT_PATH,
        validAuditText.replace(
          'Storage hot-path hardening now proves Dexie kind-bounded traversal, projection reads, max-created lookups, and HotEventIndex kind, tag, replaceable, deletion, and relay-hint paths without broad event-table scans.',
          'Storage hot-path evidence removed.'
        )
      ),
      ...validRequiredProofFiles
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      `${STRICT_GOAL_AUDIT_PATH} is missing storage hot-path hardening implementation evidence`
    );
  });

  it('requires coordinator local store api implementation proof', () => {
    const result = checkStrictGoalAudit([
      file(
        STRICT_GOAL_AUDIT_PATH,
        validAuditText.replace(
          'App-facing local comment, follow graph, and maintenance helpers now call coordinator-owned local store methods without exposing openEventsDb or raw event database handles.',
          'Local store API evidence removed.'
        )
      ),
      ...validRequiredProofFiles
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      `${STRICT_GOAL_AUDIT_PATH} is missing coordinator local store API evidence`
    );
  });

  it('rejects raw local store handles on the public coordinator runtime source', () => {
    const result = checkStrictGoalAudit([
      file(STRICT_GOAL_AUDIT_PATH, validAuditText),
      ...validRequiredProofFiles.map((proofFile) =>
        proofFile.path === 'packages/resonote/src/runtime.ts'
          ? file(proofFile.path, `${proofFile.text}\nopenEventsDb(): unknown;`)
          : proofFile
      )
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'packages/resonote/src/runtime.ts exposes raw local store handle openEventsDb'
    );
  });

  it('allows raw transport tokens only in approved internal transport zones', () => {
    const result = checkStrictGoalAudit([
      file(STRICT_GOAL_AUDIT_PATH, validAuditText),
      ...validRequiredProofFiles,
      file('packages/resonote/src/runtime.ts', 'const rxNostr = await runtime.getRxNostr();'),
      file('src/shared/nostr/client.ts', 'createRxNostrSession({ defaultRelays: [] });'),
      file('packages/core/src/relay-session.ts', 'export function createRxNostrSession() {}')
    ]);

    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('flags raw transport usage in app production code', () => {
    const result = checkStrictGoalAudit([
      file(STRICT_GOAL_AUDIT_PATH, validAuditText),
      ...validRequiredProofFiles,
      file('src/features/comments/application/leaky-transport.ts', 'await getRxNostr();')
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'src/features/comments/application/leaky-transport.ts uses raw transport token getRxNostr outside an approved coordinator transport zone'
    );
  });

  it('flags raw storage and transport handles in production plugins', () => {
    const result = checkStrictGoalAudit([
      file(STRICT_GOAL_AUDIT_PATH, validAuditText),
      ...validRequiredProofFiles,
      file(
        'packages/resonote/src/plugins/leaky-plugin.ts',
        'api.registerFlow("leaky", { getEventsDB, createRxBackwardReq });'
      )
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'packages/resonote/src/plugins/leaky-plugin.ts exposes raw plugin handle getEventsDB'
    );
    expect(result.errors).toContain(
      'packages/resonote/src/plugins/leaky-plugin.ts exposes raw plugin handle createRxBackwardReq'
    );
  });

  it('requires spec verdict wording to point strict claims to the strict gap audit', () => {
    const result = checkStrictGoalAudit([
      file(STRICT_GOAL_AUDIT_PATH, validAuditText),
      ...validRequiredProofFiles,
      file(
        'docs/auftakt/spec.md',
        '### 14.3 監査判定マトリクス\n| strict single coordinator model | Satisfied | complete |'
      )
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'docs/auftakt/spec.md must reference docs/auftakt/2026-04-26-strict-goal-gap-audit.md when presenting Auftakt goal verdicts'
    );
  });

  it('accepts spec wording that links scoped completion to strict gap status', () => {
    const result = checkStrictGoalAudit([
      file(STRICT_GOAL_AUDIT_PATH, validAuditText),
      ...validRequiredProofFiles,
      file(
        'docs/auftakt/spec.md',
        '### 14.3 監査判定マトリクス\nStrict final gap details live in docs/auftakt/2026-04-26-strict-goal-gap-audit.md.\nScoped-Satisfied'
      )
    ]);

    expect(result).toEqual({ ok: true, errors: [] });
  });
});
