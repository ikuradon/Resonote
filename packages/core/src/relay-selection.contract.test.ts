import { describe, expect, it } from 'vitest';

import {
  buildRelaySelectionPlan,
  normalizeRelaySelectionPolicy,
  parseNip65RelayListTags,
  relayListEntriesToSelectionCandidates,
  type RelaySelectionPolicyOptions
} from './index.js';

describe('relay selection NIP-65 parsing', () => {
  it('parses NIP-65 r tags into read and write relay entries', () => {
    expect(
      parseNip65RelayListTags([
        ['r', 'wss://read.example', 'read'],
        ['r', 'wss://write.example', 'write'],
        ['r', 'wss://both.example'],
        ['r', 'wss://ignored.example', 'invalid-marker'],
        ['p', 'not-a-relay']
      ])
    ).toEqual([
      { relay: 'wss://read.example/', read: true, write: false },
      { relay: 'wss://write.example/', read: false, write: true },
      { relay: 'wss://both.example/', read: true, write: true },
      { relay: 'wss://ignored.example/', read: true, write: true }
    ]);
  });

  it('ignores malformed, non-websocket, and duplicate relay entries', () => {
    expect(
      parseNip65RelayListTags([
        ['r'],
        ['r', 'https://relay.example'],
        ['r', 'notaurl'],
        ['r', 'wss://relay.example', 'read'],
        ['r', 'wss://relay.example/', 'write']
      ])
    ).toEqual([{ relay: 'wss://relay.example/', read: true, write: true }]);
  });

  it('turns relay-list entries into read and write selection candidates', () => {
    const candidates = relayListEntriesToSelectionCandidates(
      parseNip65RelayListTags([
        ['r', 'wss://read.example', 'read'],
        ['r', 'wss://write.example', 'write'],
        ['r', 'wss://both.example']
      ])
    );

    expect(candidates).toEqual([
      { relay: 'wss://read.example/', source: 'nip65-read', role: 'read' },
      { relay: 'wss://write.example/', source: 'nip65-write', role: 'write' },
      { relay: 'wss://both.example/', source: 'nip65-read', role: 'read' },
      { relay: 'wss://both.example/', source: 'nip65-write', role: 'write' }
    ]);
  });

  it('normalizes preset option defaults', () => {
    const defaultOnly = normalizeRelaySelectionPolicy({ strategy: 'default-only' });
    const conservative = normalizeRelaySelectionPolicy({ strategy: 'conservative-outbox' });
    const strict = normalizeRelaySelectionPolicy({ strategy: 'strict-outbox' });
    const overridden = normalizeRelaySelectionPolicy({
      strategy: 'default-only',
      allowTemporaryHints: true
    } satisfies RelaySelectionPolicyOptions);

    expect(defaultOnly).toMatchObject({
      strategy: 'default-only',
      includeDefaultFallback: true,
      allowTemporaryHints: false,
      includeDurableHints: false,
      includeAudienceRelays: false
    });
    expect(conservative).toMatchObject({
      strategy: 'conservative-outbox',
      includeDefaultFallback: true,
      allowTemporaryHints: true,
      includeDurableHints: true,
      includeAudienceRelays: true
    });
    expect(strict).toMatchObject({
      strategy: 'strict-outbox',
      includeDefaultFallback: true,
      allowTemporaryHints: true,
      includeDurableHints: true,
      includeAudienceRelays: true
    });
    expect(overridden.allowTemporaryHints).toBe(true);
  });
});

describe('relay selection strategy planning', () => {
  it('uses only defaults for default-only unless temporary hints are explicitly allowed', () => {
    const plan = buildRelaySelectionPlan({
      intent: 'read',
      policy: { strategy: 'default-only' },
      candidates: [
        { relay: 'wss://default.example', source: 'default', role: 'read' },
        { relay: 'wss://hint.example', source: 'temporary-hint', role: 'temporary' },
        { relay: 'wss://nip65.example', source: 'nip65-read', role: 'read' }
      ]
    });

    const optInPlan = buildRelaySelectionPlan({
      intent: 'read',
      policy: { strategy: 'default-only', allowTemporaryHints: true },
      candidates: [
        { relay: 'wss://default.example', source: 'default', role: 'read' },
        { relay: 'wss://hint.example', source: 'temporary-hint', role: 'temporary' }
      ]
    });

    expect(plan).toMatchObject({
      readRelays: ['wss://default.example/'],
      temporaryRelays: []
    });
    expect(optInPlan.temporaryRelays).toEqual(['wss://hint.example/']);
  });

  it('clips conservative outbox plans through explicit budgets', () => {
    const plan = buildRelaySelectionPlan({
      intent: 'read',
      policy: {
        strategy: 'conservative-outbox',
        maxReadRelays: 2,
        maxTemporaryRelays: 1
      },
      candidates: [
        { relay: 'wss://default-a.example', source: 'default', role: 'read' },
        { relay: 'wss://default-b.example', source: 'default', role: 'read' },
        { relay: 'wss://durable.example', source: 'durable-hint', role: 'read' },
        { relay: 'wss://temporary-a.example', source: 'temporary-hint', role: 'temporary' },
        { relay: 'wss://temporary-b.example', source: 'temporary-hint', role: 'temporary' }
      ]
    });

    expect(plan.readRelays).toEqual(['wss://default-a.example/', 'wss://default-b.example/']);
    expect(plan.temporaryRelays).toEqual(['wss://temporary-a.example/']);
    expect(plan.diagnostics).toContainEqual(
      expect.objectContaining({
        relay: 'wss://durable.example/',
        clipped: true,
        reason: 'clipped-by-policy'
      })
    );
  });

  it('strict outbox keeps full fan-out unless hard budgets are configured', () => {
    const candidates = [
      { relay: 'wss://author-a.example', source: 'nip65-write' as const, role: 'write' as const },
      { relay: 'wss://author-b.example', source: 'nip65-write' as const, role: 'write' as const },
      { relay: 'wss://audience-a.example', source: 'audience' as const, role: 'write' as const },
      { relay: 'wss://audience-b.example', source: 'audience' as const, role: 'write' as const }
    ];

    const full = buildRelaySelectionPlan({
      intent: 'reply',
      policy: { strategy: 'strict-outbox' },
      candidates
    });
    const clipped = buildRelaySelectionPlan({
      intent: 'reply',
      policy: { strategy: 'strict-outbox', maxWriteRelays: 2 },
      candidates
    });

    expect(full.writeRelays).toEqual([
      'wss://author-a.example/',
      'wss://author-b.example/',
      'wss://audience-a.example/',
      'wss://audience-b.example/'
    ]);
    expect(clipped.writeRelays).toEqual(['wss://author-a.example/', 'wss://author-b.example/']);
  });

  it('produces deterministic plans independent of input order', () => {
    const left = buildRelaySelectionPlan({
      intent: 'read',
      policy: { strategy: 'conservative-outbox', maxReadRelays: 3 },
      candidates: [
        { relay: 'wss://z.example', source: 'durable-hint', role: 'read' },
        { relay: 'wss://a.example', source: 'default', role: 'read' },
        { relay: 'wss://m.example', source: 'default', role: 'read' }
      ]
    });
    const right = buildRelaySelectionPlan({
      intent: 'read',
      policy: { strategy: 'conservative-outbox', maxReadRelays: 3 },
      candidates: [
        { relay: 'wss://m.example', source: 'default', role: 'read' },
        { relay: 'wss://z.example', source: 'durable-hint', role: 'read' },
        { relay: 'wss://a.example', source: 'default', role: 'read' }
      ]
    });

    expect(right.readRelays).toEqual(left.readRelays);
    expect(right.diagnostics).toEqual(left.diagnostics);
  });
});
