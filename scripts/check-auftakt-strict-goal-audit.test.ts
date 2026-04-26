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
`;

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
      )
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
      )
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      `${STRICT_GOAL_AUDIT_PATH} claims strict final completion without preserving scoped-vs-strict distinction`
    );
  });

  it('passes a complete strict goal gap audit artifact', () => {
    const result = checkStrictGoalAudit([file(STRICT_GOAL_AUDIT_PATH, validAuditText)]);

    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('allows raw transport tokens only in approved internal transport zones', () => {
    const result = checkStrictGoalAudit([
      file(STRICT_GOAL_AUDIT_PATH, validAuditText),
      file('packages/resonote/src/runtime.ts', 'const rxNostr = await runtime.getRxNostr();'),
      file('src/shared/nostr/client.ts', 'createRxNostrSession({ defaultRelays: [] });'),
      file('packages/core/src/relay-session.ts', 'export function createRxNostrSession() {}')
    ]);

    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('flags raw transport usage in app production code', () => {
    const result = checkStrictGoalAudit([
      file(STRICT_GOAL_AUDIT_PATH, validAuditText),
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
});
