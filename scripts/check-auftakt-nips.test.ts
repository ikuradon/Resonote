import { describe, expect, it } from 'vitest';

import {
  assertNoRewriteOnRefreshFailure,
  checkCanonicalNipSpecSync,
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

  it('rejects stale NIP-17 encrypted-pipeline pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['17'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('17', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P2',
            scopeNotes: 'Private DMs require encrypted-event pipeline'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-17 must stay implemented after private direct-message model coverage'
    );
    expect(result.errors).toContain(
      'NIP-17 owner must be packages/core/src/nip17-direct-message.ts'
    );
    expect(result.errors).toContain(
      'NIP-17 proof must be packages/core/src/nip17-direct-message.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-17 scopeNotes must not use stale encrypted-pipeline-pending wording'
    );
  });

  it('accepts the implemented NIP-17 private direct-message claim', () => {
    const result = checkNipMatrix(
      { nips: ['17'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('17', {
            status: 'implemented',
            owner: 'packages/core/src/nip17-direct-message.ts',
            proof: 'packages/core/src/nip17-direct-message.contract.test.ts',
            priority: 'P2',
            scopeNotes:
              'Core NIP-17 private direct-message model builds kind:14 chat and kind:15 file rumors, wraps each participant through NIP-59 gift wrap, and builds/parses kind:10050 DM relay lists.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-18 partial repost UI claims', () => {
    const result = checkNipMatrix(
      { nips: ['18'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('18', {
            status: 'partial',
            owner: 'packages/resonote/src/plugins/built-in-plugins.ts',
            proof: 'packages/resonote/src/built-in-plugins.contract.test.ts',
            priority: 'P1',
            scopeNotes: 'Repost relay hints tracked as infrastructure; full UI model pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-18 must stay implemented after repost publish flow coverage'
    );
    expect(result.errors).toContain(
      'NIP-18 owner must be src/features/comments/application/comment-actions.ts'
    );
    expect(result.errors).toContain(
      'NIP-18 proof must be src/features/comments/application/comment-actions.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-18 scopeNotes must not use stale partial UI-pending wording'
    );
  });

  it('accepts the implemented NIP-18 repost publish claim', () => {
    const result = checkNipMatrix(
      { nips: ['18'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('18', {
            status: 'implemented',
            owner: 'src/features/comments/application/comment-actions.ts',
            proof: 'src/features/comments/application/comment-actions.test.ts',
            priority: 'P1',
            scopeNotes:
              'NIP-18 kind:6 text-note and kind:16 generic repost builders require target relay hints; comment ReNote uses coordinator fetch-by-id before publish.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-21 app-routing pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['21'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('21', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P2',
            scopeNotes: 'nostr: URI handling belongs app routing layer'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-21 must stay implemented after nostr URI parser and route coverage'
    );
    expect(result.errors).toContain('NIP-21 owner must be packages/core/src/nip21-uri.ts');
    expect(result.errors).toContain(
      'NIP-21 proof must be packages/core/src/nip21-uri.contract.test.ts'
    );
    expect(result.errors).toContain('NIP-21 scopeNotes must not use stale routing-pending wording');
  });

  it('accepts the implemented NIP-21 nostr URI claim', () => {
    const result = checkNipMatrix(
      { nips: ['21'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('21', {
            status: 'implemented',
            owner: 'packages/core/src/nip21-uri.ts',
            proof: 'packages/core/src/nip21-uri.contract.test.ts',
            priority: 'P2',
            scopeNotes:
              'Core NIP-21 nostr: URI parser accepts non-secret NIP-19 identifiers, rejects nsec payloads, and the app resolver normalizes profile/event routes through existing NIP-19 navigation.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-23 long-form pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['23'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('23', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P2',
            scopeNotes: 'Long-form rendering and indexing pending'
          })
        ]
      }
    );

    expect(result.errors).toContain('NIP-23 must stay implemented after long-form model coverage');
    expect(result.errors).toContain('NIP-23 owner must be packages/core/src/nip23-long-form.ts');
    expect(result.errors).toContain(
      'NIP-23 proof must be packages/core/src/nip23-long-form.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-23 scopeNotes must not use stale long-form-pending wording'
    );
  });

  it('accepts the implemented NIP-23 long-form claim', () => {
    const result = checkNipMatrix(
      { nips: ['23'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('23', {
            status: 'implemented',
            owner: 'packages/core/src/nip23-long-form.ts',
            proof: 'packages/core/src/nip23-long-form.contract.test.ts',
            priority: 'P2',
            scopeNotes:
              'Core NIP-23 long-form model builds and parses kind:30023 articles and kind:30024 drafts with d tag identifiers, Markdown content, standardized title/image/summary/published_at metadata, topics, and reference tags.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-27 text-reference pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['27'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('27', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P2',
            scopeNotes: 'Text note references parsing pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-27 must stay implemented after text reference extraction coverage'
    );
    expect(result.errors).toContain('NIP-27 owner must be packages/core/src/nip27-references.ts');
    expect(result.errors).toContain(
      'NIP-27 proof must be packages/core/src/nip27-references.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-27 scopeNotes must not use stale text-reference-pending wording'
    );
  });

  it('accepts the implemented NIP-27 text-reference claim', () => {
    const result = checkNipMatrix(
      { nips: ['27'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('27', {
            status: 'implemented',
            owner: 'packages/core/src/nip27-references.ts',
            proof: 'packages/core/src/nip27-references.contract.test.ts',
            priority: 'P2',
            scopeNotes:
              'Core NIP-27 parser extracts NIP-21 profile and event references from text content, builds optional p-tag/q-tag/a-tag mention tags, and powers the app content parser.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-30 partial custom emoji claims', () => {
    const result = checkNipMatrix(
      { nips: ['30'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('30', {
            status: 'partial',
            owner: 'packages/resonote/src/plugins/built-in-plugins.ts',
            proof: 'packages/resonote/src/built-in-plugins.contract.test.ts',
            priority: 'P1',
            scopeNotes: 'Custom emoji catalog read model'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-30 must stay implemented after custom emoji read-model coverage'
    );
    expect(result.errors).toContain('NIP-30 owner must be packages/resonote/src/runtime.ts');
    expect(result.errors).toContain(
      'NIP-30 proof must be packages/resonote/src/custom-emoji.contract.test.ts'
    );
    expect(result.errors).toContain('NIP-30 scopeNotes must not use stale partial wording');
  });

  it('accepts the implemented NIP-30 custom emoji claim', () => {
    const result = checkNipMatrix(
      { nips: ['30'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('30', {
            status: 'implemented',
            owner: 'packages/resonote/src/runtime.ts',
            proof: 'packages/resonote/src/custom-emoji.contract.test.ts',
            priority: 'P1',
            scopeNotes:
              'Custom emoji tags enforce NIP-30 shortcode names and the coordinator read model resolves kind:10030 lists plus kind:30030 emoji sets.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-31 unknown-event pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['31'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('31', {
            level: 'internal',
            status: 'partial',
            owner: 'packages/adapter-dexie/src/index.ts',
            proof: 'packages/adapter-dexie/src/materialization.contract.test.ts',
            priority: 'P2',
            scopeNotes: 'Unknown events are storable; dedicated handling pending'
          })
        ]
      }
    );

    expect(result.errors).toContain('NIP-31 must stay implemented after alt-tag fallback coverage');
    expect(result.errors).toContain('NIP-31 owner must be packages/core/src/nip31-alt.ts');
    expect(result.errors).toContain(
      'NIP-31 proof must be packages/core/src/nip31-alt.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-31 scopeNotes must not use stale unknown-event-pending wording'
    );
  });

  it('accepts the implemented NIP-31 alt-tag fallback claim', () => {
    const result = checkNipMatrix(
      { nips: ['31'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('31', {
            level: 'internal',
            status: 'implemented',
            owner: 'packages/core/src/nip31-alt.ts',
            proof: 'packages/core/src/nip31-alt.contract.test.ts',
            priority: 'P2',
            scopeNotes:
              'Core NIP-31 alt-tag fallback helpers parse and build human-readable summaries for unknown/custom events; kind:17 content reaction events now include an alt tag.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-36 sensitive-content pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['36'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('36', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P2',
            scopeNotes: 'Sensitive content moderation pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-36 must stay implemented after content-warning tag coverage'
    );
    expect(result.errors).toContain(
      'NIP-36 owner must be packages/core/src/nip36-content-warning.ts'
    );
    expect(result.errors).toContain(
      'NIP-36 proof must be packages/core/src/nip36-content-warning.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-36 scopeNotes must not use stale moderation-pending wording'
    );
  });

  it('accepts the implemented NIP-36 content-warning claim', () => {
    const result = checkNipMatrix(
      { nips: ['36'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('36', {
            status: 'implemented',
            owner: 'packages/core/src/nip36-content-warning.ts',
            proof: 'packages/core/src/nip36-content-warning.contract.test.ts',
            priority: 'P2',
            scopeNotes:
              'Core NIP-36 content-warning helpers parse optional reasons; comment event builder emits content-warning tags for sensitive comments.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-37 draft event pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['37'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('37', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P2',
            scopeNotes: 'Draft event handling pending'
          })
        ]
      }
    );

    expect(result.errors).toContain('NIP-37 must stay implemented after draft-wrap model coverage');
    expect(result.errors).toContain('NIP-37 owner must be packages/core/src/nip37-draft-wrap.ts');
    expect(result.errors).toContain(
      'NIP-37 proof must be packages/core/src/nip37-draft-wrap.contract.test.ts'
    );
    expect(result.errors).toContain('NIP-37 scopeNotes must not use stale draft-pending wording');
  });

  it('accepts the implemented NIP-37 draft-wrap claim', () => {
    const result = checkNipMatrix(
      { nips: ['37'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('37', {
            status: 'implemented',
            owner: 'packages/core/src/nip37-draft-wrap.ts',
            proof: 'packages/core/src/nip37-draft-wrap.contract.test.ts',
            priority: 'P2',
            scopeNotes:
              'Core NIP-37 draft-wrap helpers build and parse kind:31234 NIP-44 encrypted draft wrappers, blank deletion markers, NIP-40 expiration tags, and kind:10013 private relay tag JSON.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-40 expiration-compaction pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['40'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('40', {
            level: 'internal',
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P2',
            scopeNotes: 'Expiration timestamp compaction pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-40 must stay implemented after expiration compaction coverage'
    );
    expect(result.errors).toContain('NIP-40 owner must be packages/adapter-dexie/src/index.ts');
    expect(result.errors).toContain(
      'NIP-40 proof must be packages/adapter-dexie/src/materialization.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-40 scopeNotes must not use stale compaction-pending wording'
    );
  });

  it('accepts the implemented NIP-40 expiration claim', () => {
    const result = checkNipMatrix(
      { nips: ['40'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('40', {
            level: 'internal',
            status: 'implemented',
            owner: 'packages/adapter-dexie/src/index.ts',
            proof: 'packages/adapter-dexie/src/materialization.contract.test.ts',
            priority: 'P2',
            scopeNotes:
              'Core NIP-40 expiration helpers back Dexie adapter visibility filtering, rejected expired writes, and explicit expired-event compaction.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-42 not-started AUTH relay claims', () => {
    const result = checkNipMatrix(
      { nips: ['42'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('42', {
            level: 'internal',
            status: 'not-started',
            owner: 'packages/core/src/relay-session.ts',
            proof: 'packages/core/src/relay-session.contract.test.ts',
            priority: 'P1',
            scopeNotes: 'AUTH handling not yet implemented'
          })
        ]
      }
    );

    expect(result.errors).toContain('NIP-42 must stay implemented after relay AUTH retry coverage');
    expect(result.errors).toContain('NIP-42 scopeNotes must not use stale not-started wording');
  });

  it('accepts the implemented NIP-42 relay AUTH retry claim', () => {
    const result = checkNipMatrix(
      { nips: ['42'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('42', {
            level: 'internal',
            status: 'implemented',
            owner: 'packages/core/src/relay-session.ts',
            proof: 'packages/core/src/relay-session.contract.test.ts',
            priority: 'P1',
            scopeNotes:
              'Relay AUTH challenge storage, kind:22242 signing, AUTH OK handling, and auth-required EVENT/REQ retry in the core relay session.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-45 COUNT pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['45'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('45', {
            level: 'internal',
            status: 'not-started',
            owner: 'packages/core/src/relay-session.ts',
            proof: 'packages/core/src/relay-session.contract.test.ts',
            priority: 'P2',
            scopeNotes: 'COUNT support pending'
          })
        ]
      }
    );

    expect(result.errors).toContain('NIP-45 must stay implemented after COUNT transport coverage');
    expect(result.errors).toContain('NIP-45 scopeNotes must not use stale COUNT-pending wording');
  });

  it('accepts the implemented NIP-45 COUNT transport claim', () => {
    const result = checkNipMatrix(
      { nips: ['45'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('45', {
            level: 'internal',
            status: 'implemented',
            owner: 'packages/core/src/relay-session.ts',
            proof: 'packages/core/src/relay-session.contract.test.ts',
            priority: 'P2',
            scopeNotes:
              'Core relay session sends NIP-45 COUNT requests, parses COUNT responses including approximate/HLL fields, and maps CLOSED or invalid payloads to unsupported/failed results.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-46 remote signing pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['46'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('46', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P2',
            scopeNotes: 'Remote signing pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-46 must stay implemented after remote signing protocol helper coverage'
    );
    expect(result.errors).toContain(
      'NIP-46 owner must be packages/core/src/nip46-remote-signing.ts'
    );
    expect(result.errors).toContain(
      'NIP-46 proof must be packages/core/src/nip46-remote-signing.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-46 scopeNotes must not use stale remote-signing-pending wording'
    );
  });

  it('accepts the implemented NIP-46 remote signing helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['46'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('46', {
            status: 'implemented',
            owner: 'packages/core/src/nip46-remote-signing.ts',
            proof: 'packages/core/src/nip46-remote-signing.contract.test.ts',
            priority: 'P2',
            scopeNotes:
              'Core NIP-46 remote signing protocol helpers build and parse bunker/nostrconnect URLs, permission strings, JSON-RPC request/response payloads, auth challenges, and kind:24133 encrypted event envelopes.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-50 search pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['50'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('50', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P2',
            scopeNotes: 'Search capability pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-50 must stay implemented after search filter helper coverage'
    );
    expect(result.errors).toContain('NIP-50 owner must be packages/core/src/nip50-search.ts');
    expect(result.errors).toContain(
      'NIP-50 proof must be packages/core/src/nip50-search.contract.test.ts'
    );
    expect(result.errors).toContain('NIP-50 scopeNotes must not use stale search-pending wording');
  });

  it('accepts the implemented NIP-50 search filter claim', () => {
    const result = checkNipMatrix(
      { nips: ['50'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('50', {
            status: 'implemented',
            owner: 'packages/core/src/nip50-search.ts',
            proof: 'packages/core/src/nip50-search.contract.test.ts',
            priority: 'P2',
            scopeNotes:
              'Core NIP-50 search filter helpers build and parse search field queries, preserve normal filter constraints, detect relay support from supported_nips, and parse extension tokens such as include:spam/domain/language/sentiment/nsfw.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-51 partial list claims', () => {
    const result = checkNipMatrix(
      { nips: ['51'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('51', {
            status: 'partial',
            owner: 'packages/resonote/src/runtime.ts',
            proof: 'packages/resonote/src/built-in-plugins.contract.test.ts',
            priority: 'P1',
            scopeNotes: 'Lists used for relay lists, emoji lists, bookmarks'
          })
        ]
      }
    );

    expect(result.errors).toContain('NIP-51 must stay implemented after core list model coverage');
    expect(result.errors).toContain('NIP-51 owner must be packages/core/src/nip51-list.ts');
    expect(result.errors).toContain(
      'NIP-51 proof must be packages/core/src/nip51-list.contract.test.ts'
    );
    expect(result.errors).toContain('NIP-51 scopeNotes must not use stale partial/pending wording');
  });

  it('accepts the implemented NIP-51 list model claim', () => {
    const result = checkNipMatrix(
      { nips: ['51'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('51', {
            status: 'implemented',
            owner: 'packages/core/src/nip51-list.ts',
            proof: 'packages/core/src/nip51-list.contract.test.ts',
            priority: 'P1',
            scopeNotes:
              'Core NIP-51 list model covers standard lists, parameterized sets, deprecated list forms, metadata tags, chronological public tags, and private NIP-44/NIP-04 tag payload parsing used by relay, emoji, bookmark, and mute flows'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-56 reporting pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['56'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('56', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P2',
            scopeNotes: 'Reporting model pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-56 must stay implemented after core report model coverage'
    );
    expect(result.errors).toContain('NIP-56 owner must be packages/core/src/nip56-report.ts');
    expect(result.errors).toContain(
      'NIP-56 proof must be packages/core/src/nip56-report.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-56 scopeNotes must not use stale reporting-pending wording'
    );
  });

  it('accepts the implemented NIP-56 report model claim', () => {
    const result = checkNipMatrix(
      { nips: ['56'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('56', {
            status: 'implemented',
            owner: 'packages/core/src/nip56-report.ts',
            proof: 'packages/core/src/nip56-report.contract.test.ts',
            priority: 'P2',
            scopeNotes:
              'Core NIP-56 kind:1984 report model builds and parses typed p/e/x report tags, related pubkeys, media server tags, and NIP-32 label tags.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-59 gift-wrap required claims', () => {
    const result = checkNipMatrix(
      { nips: ['59'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('59', {
            level: 'internal',
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P1',
            scopeNotes: 'Gift wrap required for private messaging support'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-59 must stay implemented after gift-wrap protocol coverage'
    );
    expect(result.errors).toContain('NIP-59 owner must be packages/core/src/nip59-gift-wrap.ts');
    expect(result.errors).toContain(
      'NIP-59 proof must be packages/core/src/nip59-gift-wrap.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-59 scopeNotes must not use stale required/not-started wording'
    );
  });

  it('accepts the implemented NIP-59 gift-wrap protocol claim', () => {
    const result = checkNipMatrix(
      { nips: ['59'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('59', {
            level: 'internal',
            status: 'implemented',
            owner: 'packages/core/src/nip59-gift-wrap.ts',
            proof: 'packages/core/src/nip59-gift-wrap.contract.test.ts',
            priority: 'P1',
            scopeNotes:
              'Core NIP-59 gift-wrap protocol builds unsigned rumors, kind:13 seals with empty tags, kind:1059 gift wraps with recipient p-tags, randomized past timestamps, ephemeral wrapper keys, and injected NIP-44 encryption for future private-message flows'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-62 retention pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['62'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('62', {
            level: 'internal',
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P2',
            scopeNotes: 'Request to vanish retention handling pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-62 must stay implemented after request-to-vanish retention coverage'
    );
    expect(result.errors).toContain('NIP-62 owner must be packages/adapter-dexie/src/index.ts');
    expect(result.errors).toContain(
      'NIP-62 proof must be packages/adapter-dexie/src/materialization.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-62 scopeNotes must not use stale retention-pending wording'
    );
  });

  it('accepts the implemented NIP-62 request-to-vanish retention claim', () => {
    const result = checkNipMatrix(
      { nips: ['62'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('62', {
            level: 'internal',
            status: 'implemented',
            owner: 'packages/adapter-dexie/src/index.ts',
            proof: 'packages/adapter-dexie/src/materialization.contract.test.ts',
            priority: 'P2',
            scopeNotes:
              'Dexie materialization applies NIP-62 kind:62 request-to-vanish retention with relay/ALL_RELAYS parsing, author cutoff suppression, NIP-09 deletion marker removal, and NIP-59 gift-wrap p-tag cleanup.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-66 seeded relay metrics claims', () => {
    const result = checkNipMatrix(
      { nips: ['66'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('66', {
            level: 'internal',
            status: 'partial',
            owner: 'packages/resonote/src/plugins/built-in-plugins.ts',
            proof: 'packages/resonote/src/built-in-plugins.contract.test.ts',
            priority: 'P1',
            scopeNotes: 'Relay metrics read model seeded'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-66 must stay implemented after relay metrics read-model coverage'
    );
    expect(result.errors).toContain('NIP-66 owner must be packages/resonote/src/runtime.ts');
    expect(result.errors).toContain(
      'NIP-66 proof must be packages/resonote/src/relay-metrics-nip66.contract.test.ts'
    );
    expect(result.errors).toContain('NIP-66 scopeNotes must not use stale seeded/partial wording');
  });

  it('accepts the implemented NIP-66 relay metrics claim', () => {
    const result = checkNipMatrix(
      { nips: ['66'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('66', {
            level: 'internal',
            status: 'implemented',
            owner: 'packages/resonote/src/runtime.ts',
            proof: 'packages/resonote/src/relay-metrics-nip66.contract.test.ts',
            priority: 'P1',
            scopeNotes:
              'Coordinator-local relay metrics parse NIP-66 kind:30166 discovery and kind:10166 monitor announcements; absence of metrics never blocks relay operation.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-70 protected-event policy claims', () => {
    const result = checkNipMatrix(
      { nips: ['70'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('70', {
            level: 'internal',
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P1',
            scopeNotes: 'Protected event validation policy pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-70 must stay implemented after protected publish AUTH coverage'
    );
    expect(result.errors).toContain('NIP-70 owner must be packages/core/src/relay-session.ts');
    expect(result.errors).toContain(
      'NIP-70 proof must be packages/core/src/relay-session.contract.test.ts'
    );
    expect(result.errors).toContain('NIP-70 scopeNotes must not use stale policy-pending wording');
  });

  it('accepts the implemented NIP-70 protected publish AUTH claim', () => {
    const result = checkNipMatrix(
      { nips: ['70'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('70', {
            level: 'internal',
            status: 'implemented',
            owner: 'packages/core/src/relay-session.ts',
            proof: 'packages/core/src/relay-session.contract.test.ts',
            priority: 'P1',
            scopeNotes:
              'Protected publish path recognizes the single-item - tag and authenticates before EVENT retry when relay policy requires NIP-42 AUTH.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-78 application data pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['78'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('78', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P2',
            scopeNotes: 'Application-specific data pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-78 must stay implemented after application data model coverage'
    );
    expect(result.errors).toContain(
      'NIP-78 owner must be packages/core/src/nip78-application-data.ts'
    );
    expect(result.errors).toContain(
      'NIP-78 proof must be packages/core/src/nip78-application-data.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-78 scopeNotes must not use stale application-data-pending wording'
    );
  });

  it('accepts the implemented NIP-78 application data claim', () => {
    const result = checkNipMatrix(
      { nips: ['78'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('78', {
            status: 'implemented',
            owner: 'packages/core/src/nip78-application-data.ts',
            proof: 'packages/core/src/nip78-application-data.contract.test.ts',
            priority: 'P2',
            scopeNotes:
              'Core NIP-78 application data model builds and parses kind:30078 addressable events with required d tags while preserving opaque content and custom tags.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-7D thread pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['7D'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('7D', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P2',
            scopeNotes: 'Threads model pending'
          })
        ]
      }
    );

    expect(result.errors).toContain('NIP-7D must stay implemented after thread model coverage');
    expect(result.errors).toContain('NIP-7D owner must be packages/core/src/nip7d-thread.ts');
    expect(result.errors).toContain(
      'NIP-7D proof must be packages/core/src/nip7d-thread.contract.test.ts'
    );
    expect(result.errors).toContain('NIP-7D scopeNotes must not use stale thread-pending wording');
  });

  it('accepts the implemented NIP-7D thread claim', () => {
    const result = checkNipMatrix(
      { nips: ['7D'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('7D', {
            status: 'implemented',
            owner: 'packages/core/src/nip7d-thread.ts',
            proof: 'packages/core/src/nip7d-thread.contract.test.ts',
            priority: 'P2',
            scopeNotes:
              'Core NIP-7D thread model builds and parses kind:11 threads with title tags and NIP-22 kind:1111 root comment tags for thread replies.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-98 HTTP auth pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['98'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('98', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P2',
            scopeNotes: 'HTTP auth pending'
          })
        ]
      }
    );

    expect(result.errors).toContain('NIP-98 must stay implemented after HTTP auth helper coverage');
    expect(result.errors).toContain('NIP-98 owner must be packages/core/src/nip98-http-auth.ts');
    expect(result.errors).toContain(
      'NIP-98 proof must be packages/core/src/nip98-http-auth.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-98 scopeNotes must not use stale HTTP-auth-pending wording'
    );
  });

  it('accepts the implemented NIP-98 HTTP auth helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['98'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('98', {
            status: 'implemented',
            owner: 'packages/core/src/nip98-http-auth.ts',
            proof: 'packages/core/src/nip98-http-auth.contract.test.ts',
            priority: 'P2',
            scopeNotes:
              'Core NIP-98 HTTP auth helpers build and parse kind:27235 events, sign Nostr Authorization headers, hash payload SHA-256 tags, and validate URL/method/time windows.'
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

describe('checkCanonicalNipSpecSync', () => {
  const canonicalSpec = [
    '| NIP    | Target Level | Current Status | Canonical Owner | Proof / Test Anchor | Scope Notes |',
    '| ------ | ------------ | -------------- | --------------- | ------------------- | ----------- |',
    '| NIP-10 | public | implemented | `src/features/comments/application/comment-actions.ts` | `src/features/comments/application/comment-actions.test.ts`<br>`e2e/reply-thread.test.ts` | reply threading |',
    '| NIP-11 | internal | implemented (runtime-only bounded support) | `packages/core/src/relay-session.ts` | `packages/core/src/relay-session.contract.test.ts` | runtime-only |',
    '| NIP-18 | public | partial | `packages/resonote/src/plugins/built-in-plugins.ts` | `packages/resonote/src/built-in-plugins.contract.test.ts` | not canonical implemented |'
  ].join('\n');

  it('rejects stale matrix rows that disagree with canonical implemented spec rows', () => {
    const result = checkCanonicalNipSpecSync(
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('10', {
            status: 'partial',
            owner: 'packages/resonote/src/runtime.ts',
            proof: 'packages/resonote/src/built-in-plugins.contract.test.ts',
            priority: 'P0'
          }),
          entry('11', {
            level: 'internal',
            status: 'implemented',
            owner: 'packages/core/src/relay-session.ts',
            proof: 'packages/core/src/relay-session.contract.test.ts',
            priority: 'P0'
          })
        ]
      },
      canonicalSpec
    );

    expect(result.errors).toContain(
      'docs/auftakt/nip-matrix.json NIP-10 must match canonical spec status implemented'
    );
    expect(result.errors).toContain(
      'docs/auftakt/nip-matrix.json NIP-10 owner must be src/features/comments/application/comment-actions.ts'
    );
    expect(result.errors).toContain(
      'docs/auftakt/nip-matrix.json NIP-10 proof must be one of src/features/comments/application/comment-actions.test.ts, e2e/reply-thread.test.ts'
    );
  });

  it('accepts implemented matrix rows whose proof is one canonical spec anchor', () => {
    const result = checkCanonicalNipSpecSync(
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('10', {
            status: 'implemented',
            owner: 'src/features/comments/application/comment-actions.ts',
            proof: 'e2e/reply-thread.test.ts',
            priority: 'P0'
          }),
          entry('11', {
            level: 'internal',
            status: 'implemented',
            owner: 'packages/core/src/relay-session.ts',
            proof: 'packages/core/src/relay-session.contract.test.ts',
            priority: 'P0'
          })
        ]
      },
      canonicalSpec
    );

    expect(result.errors).toEqual([]);
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
