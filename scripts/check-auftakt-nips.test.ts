import { describe, expect, it } from 'vitest';

import {
  assertNoRewriteOnRefreshFailure,
  checkNipMatrix,
  checkNipStatusDocsSync,
  proposeInventoryDrift
} from './check-auftakt-nips.js';

function entry(
  nip: string,
  overrides: Partial<Parameters<typeof checkNipMatrix>[1]['entries'][number]> = {}
) {
  return {
    nip,
    level: 'public',
    status: 'partial',
    owner: 'packages/resonote/src/runtime.ts',
    proof: 'packages/resonote/src/public-api.contract.test.ts',
    priority: 'P1',
    scopeNotes: 'bounded support boundary',
    ...overrides
  };
}

describe('checkNipMatrix', () => {
  it('reports missing NIP classifications', () => {
    const result = checkNipMatrix(
      { nips: ['01', '02'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [entry('01')]
      }
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Missing matrix entry for NIP-02');
  });

  it('reports stale matrix entries outside the official inventory', () => {
    const result = checkNipMatrix(
      { nips: ['01'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [entry('01'), entry('02')]
      }
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Stale matrix entry for NIP-02');
  });

  it('reports inventory and matrix source metadata drift', () => {
    const result = checkNipMatrix(
      { nips: ['01'], sourceUrl: 'official', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'local',
        sourceDate: '2026-04-25',
        entries: [entry('01')]
      }
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Matrix sourceUrl differs from inventory sourceUrl');
    expect(result.errors).toContain('Matrix sourceDate differs from inventory sourceDate');
  });
});

describe('NIP matrix entry validation', () => {
  it('rejects unknown level status and priority values', () => {
    const result = checkNipMatrix(
      { nips: ['01'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [entry('01', { level: 'mystery', status: 'done', priority: 'soon' })]
      }
    );

    expect(result.errors).toContain('NIP-01 has unknown level mystery');
    expect(result.errors).toContain('NIP-01 has unknown status done');
    expect(result.errors).toContain('NIP-01 has unknown priority soon');
  });

  it('rejects implemented or partial claims with docs-only owner or proof', () => {
    const result = checkNipMatrix(
      { nips: ['01'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('01', {
            status: 'implemented',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json'
          })
        ]
      }
    );

    expect(result.errors).toContain('NIP-01 implemented claim cannot use docs-only owner');
    expect(result.errors).toContain('NIP-01 implemented claim cannot use docs-only proof');
  });

  it('rejects missing support boundary notes', () => {
    const result = checkNipMatrix(
      { nips: ['01'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [entry('01', { scopeNotes: 'TBD' })]
      }
    );

    expect(result.errors).toContain('NIP-01 missing support boundary in scopeNotes');
  });

  it('rejects stale NIP-19 parser coverage claims', () => {
    const result = checkNipMatrix(
      { nips: ['19'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('19', {
            status: 'partial',
            owner: 'packages/core/src/vocabulary.ts',
            proof: 'packages/core/src/public-api.contract.test.ts',
            priority: 'P0',
            scopeNotes: 'Entity vocabulary exists; complete parser coverage pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-19 must stay implemented after complete standard prefix parser coverage'
    );
    expect(result.errors).toContain('NIP-19 owner must be packages/core/src/crypto.ts');
    expect(result.errors).toContain('NIP-19 proof must be src/shared/nostr/nip19-decode.test.ts');
    expect(result.errors).toContain(
      'NIP-19 scopeNotes must not use stale parser-coverage-pending wording'
    );
  });

  it('accepts the implemented NIP-19 standard prefix parser claim', () => {
    const result = checkNipMatrix(
      { nips: ['19'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('19', {
            status: 'implemented',
            owner: 'packages/core/src/crypto.ts',
            proof: 'src/shared/nostr/nip19-decode.test.ts',
            priority: 'P0',
            scopeNotes:
              'Core parser and encoders cover npub, nsec, note, nprofile, nevent, naddr, and nrelay; app routes expose the profile/event subset.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-05 not-started identity-resolution claims', () => {
    const result = checkNipMatrix(
      { nips: ['05'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('05', {
            status: 'not-started',
            owner: 'src/shared/nostr',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P1',
            scopeNotes: 'NIP-05 identity resolution remains app-facing work'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-05 must stay implemented after browser verification coverage'
    );
    expect(result.errors).toContain('NIP-05 owner must be src/shared/nostr/nip05.ts');
    expect(result.errors).toContain('NIP-05 proof must be src/shared/nostr/nip05.test.ts');
    expect(result.errors).toContain('NIP-05 scopeNotes must not use stale not-started wording');
  });

  it('accepts the implemented NIP-05 verification claim', () => {
    const result = checkNipMatrix(
      { nips: ['05'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('05', {
            status: 'implemented',
            owner: 'src/shared/nostr/nip05.ts',
            proof: 'src/shared/nostr/nip05.test.ts',
            priority: 'P1',
            scopeNotes:
              'Browser profile verification fetches nostr.json with timeout, cache, redirect rejection, and private-network domain guard.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-07 partial signer bridge claims', () => {
    const result = checkNipMatrix(
      { nips: ['07'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('07', {
            status: 'partial',
            owner: 'src/shared/nostr/client.ts',
            proof: 'src/shared/nostr/client.test.ts',
            priority: 'P0',
            scopeNotes: 'window.nostr signer bridge'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-07 must stay implemented after window.nostr publish integration coverage'
    );
    expect(result.errors).toContain(
      'NIP-07 proof must be src/shared/nostr/client-integration.test.ts'
    );
    expect(result.errors).toContain('NIP-07 status must not return to partial');
  });

  it('accepts the implemented NIP-07 signer integration claim', () => {
    const result = checkNipMatrix(
      { nips: ['07'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('07', {
            status: 'implemented',
            owner: 'src/shared/nostr/client.ts',
            proof: 'src/shared/nostr/client-integration.test.ts',
            priority: 'P0',
            scopeNotes:
              'window.nostr signing is routed through @auftakt/core nip07Signer and proven by relay publish integration.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });
});

describe('checkNipStatusDocsSync', () => {
  it('reports matrix NIPs missing from status-verification docs', () => {
    const result = checkNipStatusDocsSync(
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [entry('01'), entry('02')]
      },
      [
        '| NIP-01 | public | partial |',
        '| scoped NIP compliance | Scoped-Satisfied | proof |'
      ].join('\n')
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('docs/auftakt/status-verification.md missing NIP-02');
  });

  it('rejects stale Partial scoped NIP compliance verdict wording', () => {
    const result = checkNipStatusDocsSync(
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [entry('01')]
      },
      ['| NIP-01 | public | partial |', '| scoped NIP compliance | Partial | stale |'].join('\n')
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'docs/auftakt/status-verification.md must not mark scoped NIP compliance as Partial after matrix proof closure'
    );
    expect(result.errors).toContain(
      'docs/auftakt/status-verification.md must mark scoped NIP compliance as Scoped-Satisfied'
    );
  });
});

describe('refresh safety helpers', () => {
  it('does not rewrite docs when official fetch fails', async () => {
    const writes: string[] = [];
    const result = await assertNoRewriteOnRefreshFailure({
      fetchOfficialInventory: async () => {
        throw new Error('network unavailable');
      },
      writeFile: async (path) => {
        writes.push(path);
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(['Official inventory fetch failed: network unavailable']);
    expect(writes).toEqual([]);
  });

  it('reports inventory drift without auto-promoting support status', () => {
    const result = proposeInventoryDrift(
      { sourceUrl: 'source', sourceDate: '2026-04-24', nips: ['01', '02'] },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [entry('01', { status: 'not-started' })]
      }
    );

    expect(result.addedNips).toEqual(['02']);
    expect(result.statusPromotions).toEqual([]);
  });
});
