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
`;

const validRequiredProofFiles = [
  file('packages/core/src/settlement.ts', 'export function reducePublishSettlement() {}'),
  file(
    'packages/resonote/src/event-coordinator.ts',
    'return { settlement: reducePublishSettlement({ localMaterialized: true, relayAccepted: true, queued: false }) };'
  ),
  file(
    'packages/adapter-dexie/src/index.ts',
    'async putSyncCursor(record) { await this.db.sync_cursors.put(record); }'
  ),
  file(
    'packages/resonote/src/runtime.ts',
    'const cursor = await loadRepairSyncCursor(eventsDB, cursorState);\ncreateOrdinaryReadRelayGateway\nverifyOrdinaryReadRelayCandidates'
  ),
  file(
    'packages/resonote/src/relay-repair.contract.test.ts',
    'resumes fallback repair from a persisted cursor after runtime recreation'
  ),
  file(
    'packages/resonote/src/public-read-cutover.contract.test.ts',
    'attempts negentropy before ordinary latest REQ verification\nuses capability-aware gateway for backward event reads'
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
