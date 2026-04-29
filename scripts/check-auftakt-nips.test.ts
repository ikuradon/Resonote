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

  it('rejects stale NIP-13 proof-of-work not-required claims', () => {
    const result = checkNipMatrix(
      { nips: ['13'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('13', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Proof-of-work validation not required for current read pipeline'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-13 must stay implemented after proof-of-work helper coverage'
    );
    expect(result.errors).toContain(
      'NIP-13 owner must be packages/core/src/nip13-proof-of-work.ts'
    );
    expect(result.errors).toContain(
      'NIP-13 proof must be packages/core/src/nip13-proof-of-work.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-13 scopeNotes must not use stale not-required/pending wording'
    );
  });

  it('accepts the implemented NIP-13 proof-of-work helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['13'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('13', {
            status: 'implemented',
            owner: 'packages/core/src/nip13-proof-of-work.ts',
            proof: 'packages/core/src/nip13-proof-of-work.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-13 proof-of-work helpers build and parse nonce tags, count leading zero bits from event ids, calculate difficulty, and validate committed target difficulty.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-14 client-layer pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['14'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('14', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Subject tag presentation is client/plugin layer work'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-14 must stay implemented after subject tag helper coverage'
    );
    expect(result.errors).toContain('NIP-14 owner must be packages/core/src/nip14-subject.ts');
    expect(result.errors).toContain(
      'NIP-14 proof must be packages/core/src/nip14-subject.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-14 scopeNotes must not use stale client-layer pending wording'
    );
  });

  it('accepts the implemented NIP-14 subject tag helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['14'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('14', {
            status: 'implemented',
            owner: 'packages/core/src/nip14-subject.ts',
            proof: 'packages/core/src/nip14-subject.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-14 subject tag helpers build, parse, and rewrite kind:1 text event subjects, derive Re: reply subjects, and expose the 80 character recommendation.'
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

  it('rejects stale NIP-24 profile-model pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['24'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('24', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Extra metadata fields require profile model coverage'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-24 must stay implemented after extra metadata model coverage'
    );
    expect(result.errors).toContain(
      'NIP-24 owner must be packages/core/src/nip24-extra-metadata.ts'
    );
    expect(result.errors).toContain(
      'NIP-24 proof must be packages/core/src/nip24-extra-metadata.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-24 scopeNotes must not use stale profile-model-pending wording'
    );
  });

  it('accepts the implemented NIP-24 extra metadata claim', () => {
    const result = checkNipMatrix(
      { nips: ['24'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('24', {
            status: 'implemented',
            owner: 'packages/core/src/nip24-extra-metadata.ts',
            proof: 'packages/core/src/nip24-extra-metadata.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-24 extra metadata helpers parse/build kind:0 profile metadata including display_name, website, banner, bot, and birthday, detect deprecated kind:3 relay maps for NIP-65 migration, and build/parse generic r/i/title/t tags with lowercase hashtag validation.'
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

  it('rejects stale NIP-32 labeling pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['32'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('32', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Labeling model pending'
          })
        ]
      }
    );

    expect(result.errors).toContain('NIP-32 must stay implemented after labeling model coverage');
    expect(result.errors).toContain('NIP-32 owner must be packages/core/src/nip32-label.ts');
    expect(result.errors).toContain(
      'NIP-32 proof must be packages/core/src/nip32-label.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-32 scopeNotes must not use stale labeling-model-pending wording'
    );
  });

  it('accepts the implemented NIP-32 labeling claim', () => {
    const result = checkNipMatrix(
      { nips: ['32'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('32', {
            status: 'implemented',
            owner: 'packages/core/src/nip32-label.ts',
            proof: 'packages/core/src/nip32-label.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-32 labeling helpers build and parse kind:1985 label events, L tag namespaces, l tag label marks, e/p/a/r/t targets with relay hints, and self-report/self-label tags on non-label events.'
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

  it('rejects stale NIP-38 user-status pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['38'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('38', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'User status read model pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-38 must stay implemented after user-status model coverage'
    );
    expect(result.errors).toContain('NIP-38 owner must be packages/core/src/nip38-user-status.ts');
    expect(result.errors).toContain(
      'NIP-38 proof must be packages/core/src/nip38-user-status.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-38 scopeNotes must not use stale user-status-pending wording'
    );
  });

  it('accepts the implemented NIP-38 user-status claim', () => {
    const result = checkNipMatrix(
      { nips: ['38'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('38', {
            status: 'implemented',
            owner: 'packages/core/src/nip38-user-status.ts',
            proof: 'packages/core/src/nip38-user-status.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-38 user status helpers build and parse kind:30315 addressable events, d tag status types including general/music, NIP-40 expiration, r/p/e/a link tags, relay filters, and empty content clear semantics.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-39 external-identity pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['39'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('39', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'External identity parsing pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-39 must stay implemented after external-identity model coverage'
    );
    expect(result.errors).toContain(
      'NIP-39 owner must be packages/core/src/nip39-external-identity.ts'
    );
    expect(result.errors).toContain(
      'NIP-39 proof must be packages/core/src/nip39-external-identity.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-39 scopeNotes must not use stale external-identity-pending wording'
    );
  });

  it('accepts the implemented NIP-39 external-identity claim', () => {
    const result = checkNipMatrix(
      { nips: ['39'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('39', {
            status: 'implemented',
            owner: 'packages/core/src/nip39-external-identity.ts',
            proof: 'packages/core/src/nip39-external-identity.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-39 external identity helpers build and parse kind:10011 events with i tag platform:identity proof claims, preserve future extra parameters, derive github/twitter/mastodon/telegram proof URLs, and build exact #i relay filters.'
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

  it('rejects stale NIP-48 proxy-tag pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['48'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('48', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Proxy tags pending'
          })
        ]
      }
    );

    expect(result.errors).toContain('NIP-48 must stay implemented after proxy-tag helper coverage');
    expect(result.errors).toContain('NIP-48 owner must be packages/core/src/nip48-proxy-tags.ts');
    expect(result.errors).toContain(
      'NIP-48 proof must be packages/core/src/nip48-proxy-tags.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-48 scopeNotes must not use stale proxy-tag-pending wording'
    );
  });

  it('accepts the implemented NIP-48 proxy-tag helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['48'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('48', {
            status: 'implemented',
            owner: 'packages/core/src/nip48-proxy-tags.ts',
            proof: 'packages/core/src/nip48-proxy-tags.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-48 proxy tag helpers build, append, and parse proxy tags on any event kind, covering activitypub/web URL IDs, atproto AT URI IDs, rss URL-with-fragment IDs, custom protocols, and source ID format validation.'
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

  it('rejects stale NIP-52 calendar out-of-scope claims', () => {
    const result = checkNipMatrix(
      { nips: ['52'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('52', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Calendar events outside current scope'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-52 must stay implemented after calendar event helper coverage'
    );
    expect(result.errors).toContain('NIP-52 owner must be packages/core/src/nip52-calendar.ts');
    expect(result.errors).toContain(
      'NIP-52 proof must be packages/core/src/nip52-calendar.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-52 scopeNotes must not use stale calendar-out-of-scope wording'
    );
  });

  it('accepts the implemented NIP-52 calendar helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['52'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('52', {
            status: 'implemented',
            owner: 'packages/core/src/nip52-calendar.ts',
            proof: 'packages/core/src/nip52-calendar.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-52 calendar helpers build and parse kind:31922 date-based events, kind:31923 time-based events with D tag day coverage and tzid tags, kind:31924 calendars with a tag addresses, and kind:31925 RSVP status/free/busy responses.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-53 live-activity out-of-scope claims', () => {
    const result = checkNipMatrix(
      { nips: ['53'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('53', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Live activities outside current scope'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-53 must stay implemented after live-activity helper coverage'
    );
    expect(result.errors).toContain(
      'NIP-53 owner must be packages/core/src/nip53-live-activity.ts'
    );
    expect(result.errors).toContain(
      'NIP-53 proof must be packages/core/src/nip53-live-activity.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-53 scopeNotes must not use stale live-activity-out-of-scope wording'
    );
  });

  it('accepts the implemented NIP-53 live-activity helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['53'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('53', {
            status: 'implemented',
            owner: 'packages/core/src/nip53-live-activity.ts',
            proof: 'packages/core/src/nip53-live-activity.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-53 live activity helpers build and parse kind:30311 live streams, kind:1311 live chat messages, kind:30312 meeting space events, kind:30313 meeting room events, and kind:10312 presence/hand events with status, participant, relays, and address tags.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-55 Android signer pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['55'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('55', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P2',
            scopeNotes: 'Android signer integration pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-55 must stay implemented after Android signer helper coverage'
    );
    expect(result.errors).toContain(
      'NIP-55 owner must be packages/core/src/nip55-android-signer.ts'
    );
    expect(result.errors).toContain(
      'NIP-55 proof must be packages/core/src/nip55-android-signer.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-55 scopeNotes must not use stale Android-signer-pending wording'
    );
  });

  it('accepts the implemented NIP-55 Android signer helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['55'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('55', {
            status: 'implemented',
            owner: 'packages/core/src/nip55-android-signer.ts',
            proof: 'packages/core/src/nip55-android-signer.contract.test.ts',
            priority: 'P2',
            scopeNotes:
              'Core NIP-55 Android signer helpers build and parse nostrsigner URLs, intent extras, content resolver URIs and selection args, permission JSON, callback results, and rejected responses.'
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

  it('rejects stale NIP-58 badge pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['58'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('58', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Badges pending'
          })
        ]
      }
    );

    expect(result.errors).toContain('NIP-58 must stay implemented after badge helper coverage');
    expect(result.errors).toContain('NIP-58 owner must be packages/core/src/nip58-badges.ts');
    expect(result.errors).toContain(
      'NIP-58 proof must be packages/core/src/nip58-badges.contract.test.ts'
    );
    expect(result.errors).toContain('NIP-58 scopeNotes must not use stale badge-pending wording');
  });

  it('accepts the implemented NIP-58 badge helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['58'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('58', {
            status: 'implemented',
            owner: 'packages/core/src/nip58-badges.ts',
            proof: 'packages/core/src/nip58-badges.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-58 badge helpers build and parse kind:30009 badge definition image/thumbnail metadata, kind:8 badge award events, kind:10008 profile badges, kind:30008 badge sets including deprecated profile_badges, and ordered a/e pair display entries.'
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

  it('rejects stale NIP-68 picture-first feed pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['68'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('68', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Picture-first feeds pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-68 must stay implemented after picture event helper coverage'
    );
    expect(result.errors).toContain('NIP-68 owner must be packages/core/src/nip68-picture.ts');
    expect(result.errors).toContain(
      'NIP-68 proof must be packages/core/src/nip68-picture.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-68 scopeNotes must not use stale picture-feed-pending wording'
    );
  });

  it('accepts the implemented NIP-68 picture event helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['68'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('68', {
            status: 'implemented',
            owner: 'packages/core/src/nip68-picture.ts',
            proof: 'packages/core/src/nip68-picture.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-68 helpers build and parse kind:20 picture events with title/content, multiple imeta image tags, accepted image media types, fallback and annotate-user imeta fields, content-warning, tagged pubkeys, image hashes, hashtags, location, geohash, and language tags.'
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

  it('rejects stale NIP-71 video-out-of-scope claims', () => {
    const result = checkNipMatrix(
      { nips: ['71'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('71', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Video events outside current scope'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-71 must stay implemented after video event helper coverage'
    );
    expect(result.errors).toContain('NIP-71 owner must be packages/core/src/nip71-video.ts');
    expect(result.errors).toContain(
      'NIP-71 proof must be packages/core/src/nip71-video.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-71 scopeNotes must not use stale video-out-of-scope wording'
    );
  });

  it('accepts the implemented NIP-71 video event helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['71'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('71', {
            status: 'implemented',
            owner: 'packages/core/src/nip71-video.ts',
            proof: 'packages/core/src/nip71-video.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-71 video helpers build and parse kind:21 normal videos, kind:22 short videos, addressable kind:34235/34236 videos with d tags, imeta video variants with duration and bitrate fields, text-track, segment, origin, participant, hashtag, and reference tags.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-72 moderated community pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['72'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('72', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Moderated communities pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-72 must stay implemented after moderated community helper coverage'
    );
    expect(result.errors).toContain('NIP-72 owner must be packages/core/src/nip72-community.ts');
    expect(result.errors).toContain(
      'NIP-72 proof must be packages/core/src/nip72-community.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-72 scopeNotes must not use stale community-pending wording'
    );
  });

  it('accepts the implemented NIP-72 moderated community helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['72'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('72', {
            status: 'implemented',
            owner: 'packages/core/src/nip72-community.ts',
            proof: 'packages/core/src/nip72-community.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-72 moderated community helpers build and parse kind:34550 community definitions with moderators and relay markers, NIP-22 kind:1111 top-level and reply post tags scoped to communities, and kind:4550 approval events for event IDs or addressable posts.'
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

  it('rejects stale NIP-84 highlight pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['84'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('84', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Highlights pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-84 must stay implemented after highlight event helper coverage'
    );
    expect(result.errors).toContain('NIP-84 owner must be packages/core/src/nip84-highlight.ts');
    expect(result.errors).toContain(
      'NIP-84 proof must be packages/core/src/nip84-highlight.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-84 scopeNotes must not use stale highlight-pending wording'
    );
  });

  it('accepts the implemented NIP-84 highlight helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['84'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('84', {
            status: 'implemented',
            owner: 'packages/core/src/nip84-highlight.ts',
            proof: 'packages/core/src/nip84-highlight.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-84 highlight helpers build and parse kind:9802 highlight events with source event/address/URL references, author/editor attribution p-tags, context tags, quote-highlight comment tags, and mention-marked p/r tags.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-85 trusted assertion pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['85'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('85', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Trusted assertions pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-85 must stay implemented after trusted assertion helper coverage'
    );
    expect(result.errors).toContain(
      'NIP-85 owner must be packages/core/src/nip85-trusted-assertions.ts'
    );
    expect(result.errors).toContain(
      'NIP-85 proof must be packages/core/src/nip85-trusted-assertions.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-85 scopeNotes must not use stale trusted-assertion-pending wording'
    );
  });

  it('accepts the implemented NIP-85 trusted assertion helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['85'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('85', {
            status: 'implemented',
            owner: 'packages/core/src/nip85-trusted-assertions.ts',
            proof: 'packages/core/src/nip85-trusted-assertions.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-85 trusted assertion helpers build and parse kind:30382/30383/30384/30385 addressable assertion events with d-tag subjects, result tags, subject relay hints, NIP-73 k tags, and kind:10040 trusted provider declarations.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-86 relay management outside-runtime claims', () => {
    const result = checkNipMatrix(
      { nips: ['86'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('86', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Relay management API outside current client runtime'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-86 must stay implemented after relay management helper coverage'
    );
    expect(result.errors).toContain(
      'NIP-86 owner must be packages/core/src/nip86-relay-management.ts'
    );
    expect(result.errors).toContain(
      'NIP-86 proof must be packages/core/src/nip86-relay-management.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-86 scopeNotes must not use stale outside-client-runtime wording'
    );
  });

  it('accepts the implemented NIP-86 relay management helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['86'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('86', {
            status: 'implemented',
            owner: 'packages/core/src/nip86-relay-management.ts',
            proof: 'packages/core/src/nip86-relay-management.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-86 relay management JSON-RPC helpers build and parse application/nostr+json+rpc HTTP POST request/response payloads for supportedmethods, banpubkey, allowevent, allowkind, blockip, and related methods while pairing requests with required NIP-98 payload Authorization helpers.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-88 poll pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['88'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('88', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Polls pending'
          })
        ]
      }
    );

    expect(result.errors).toContain('NIP-88 must stay implemented after poll helper coverage');
    expect(result.errors).toContain('NIP-88 owner must be packages/core/src/nip88-polls.ts');
    expect(result.errors).toContain(
      'NIP-88 proof must be packages/core/src/nip88-polls.contract.test.ts'
    );
    expect(result.errors).toContain('NIP-88 scopeNotes must not use stale poll-pending wording');
  });

  it('accepts the implemented NIP-88 poll helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['88'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('88', {
            status: 'implemented',
            owner: 'packages/core/src/nip88-polls.ts',
            proof: 'packages/core/src/nip88-polls.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-88 poll helpers build and parse kind:1068 poll events with option/relay/polltype/endsAt tags, kind:1018 response vote events, singlechoice and multiplechoice normalization, response filters, latest-per-pubkey selection, and tally helpers.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-89 recommended handler pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['89'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('89', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Recommended handlers pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-89 must stay implemented after application handler helper coverage'
    );
    expect(result.errors).toContain(
      'NIP-89 owner must be packages/core/src/nip89-application-handlers.ts'
    );
    expect(result.errors).toContain(
      'NIP-89 proof must be packages/core/src/nip89-application-handlers.contract.test.ts'
    );
    expect(result.errors).toContain('NIP-89 scopeNotes must not use stale handler-pending wording');
  });

  it('accepts the implemented NIP-89 application handler helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['89'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('89', {
            status: 'implemented',
            owner: 'packages/core/src/nip89-application-handlers.ts',
            proof: 'packages/core/src/nip89-application-handlers.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-89 application handler helpers build and parse kind:31989 recommendation events with d-tag supported kinds and a-tag handler pointers, kind:31990 handler information events with k-tag supported kinds and platform URL templates, client tags, metadata, and recommendation/handler filters.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-92 media attachment pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['92'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('92', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Media attachments pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-92 must stay implemented after media attachment helper coverage'
    );
    expect(result.errors).toContain(
      'NIP-92 owner must be packages/core/src/nip92-media-attachments.ts'
    );
    expect(result.errors).toContain(
      'NIP-92 proof must be packages/core/src/nip92-media-attachments.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-92 scopeNotes must not use stale media-attachment-pending wording'
    );
  });

  it('accepts the implemented NIP-92 media attachment helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['92'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('92', {
            status: 'implemented',
            owner: 'packages/core/src/nip92-media-attachments.ts',
            proof: 'packages/core/src/nip92-media-attachments.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-92 media attachment helpers build and parse imeta tags for inline content URLs, enforce required url plus additional NIP-94 file metadata fields including m/x/ox/size/dim, support blurhash/thumb/image/summary/alt/fallback/service fields, content-match filtering, and one-imeta-per-URL dedupe.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-94 file metadata pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['94'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('94', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'File metadata pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-94 must stay implemented after file metadata helper coverage'
    );
    expect(result.errors).toContain(
      'NIP-94 owner must be packages/core/src/nip94-file-metadata.ts'
    );
    expect(result.errors).toContain(
      'NIP-94 proof must be packages/core/src/nip94-file-metadata.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-94 scopeNotes must not use stale file-metadata-pending wording'
    );
  });

  it('accepts the implemented NIP-94 file metadata helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['94'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('94', {
            status: 'implemented',
            owner: 'packages/core/src/nip94-file-metadata.ts',
            proof: 'packages/core/src/nip94-file-metadata.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-94 file metadata helpers build and parse kind:1063 events with required url, m/x SHA-256 media type/hash tags, ox/size/dim/magnet/i/blurhash tags, thumb/image/summary/alt/fallback/service fields, and #x/#m relay filters.'
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

  it('rejects stale NIP-A0 voice message pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['A0'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('A0', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Voice messages pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-A0 must stay implemented after voice message helper coverage'
    );
    expect(result.errors).toContain(
      'NIP-A0 owner must be packages/core/src/nipA0-voice-messages.ts'
    );
    expect(result.errors).toContain(
      'NIP-A0 proof must be packages/core/src/nipA0-voice-messages.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-A0 scopeNotes must not use stale voice-message-pending wording'
    );
  });

  it('accepts the implemented NIP-A0 voice message helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['A0'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('A0', {
            status: 'implemented',
            owner: 'packages/core/src/nipA0-voice-messages.ts',
            proof: 'packages/core/src/nipA0-voice-messages.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-A0 voice message helpers build and parse kind:1222 root voice events and kind:1244 NIP-22 reply events with audio URL content, recommended audio/mp4 duration metadata, NIP-92 imeta waveform previews, root/parent references, and relay filters.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-A4 public message pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['A4'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('A4', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Public messages pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-A4 must stay implemented after public message helper coverage'
    );
    expect(result.errors).toContain(
      'NIP-A4 owner must be packages/core/src/nipA4-public-messages.ts'
    );
    expect(result.errors).toContain(
      'NIP-A4 proof must be packages/core/src/nipA4-public-messages.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-A4 scopeNotes must not use stale public-message-pending wording'
    );
  });

  it('accepts the implemented NIP-A4 public message helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['A4'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('A4', {
            status: 'implemented',
            owner: 'packages/core/src/nipA4-public-messages.ts',
            proof: 'packages/core/src/nipA4-public-messages.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-A4 public message helpers build and parse kind:24 events with p receiver tags, no e tags, NIP-40 expiration, NIP-18 q tags, NIP-92 imeta attachments, response k tags, and #p relay filters.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-C0 code snippet pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['C0'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('C0', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Code snippets pending'
          })
        ]
      }
    );

    expect(result.errors).toContain(
      'NIP-C0 must stay implemented after code snippet helper coverage'
    );
    expect(result.errors).toContain(
      'NIP-C0 owner must be packages/core/src/nipC0-code-snippets.ts'
    );
    expect(result.errors).toContain(
      'NIP-C0 proof must be packages/core/src/nipC0-code-snippets.contract.test.ts'
    );
    expect(result.errors).toContain(
      'NIP-C0 scopeNotes must not use stale code-snippet-pending wording'
    );
  });

  it('accepts the implemented NIP-C0 code snippet helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['C0'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('C0', {
            status: 'implemented',
            owner: 'packages/core/src/nipC0-code-snippets.ts',
            proof: 'packages/core/src/nipC0-code-snippets.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-C0 code snippet helpers build and parse kind:1337 events while preserving code content whitespace, language l tags and #l relay filters, name/extension/description/runtime/license metadata, repeated dep dependencies, and repo tags.'
          })
        ]
      }
    );

    expect(result.errors).toEqual([]);
  });

  it('rejects stale NIP-C7 chat pending claims', () => {
    const result = checkNipMatrix(
      { nips: ['C7'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('C7', {
            status: 'not-started',
            owner: 'docs/auftakt/nip-matrix.json',
            proof: 'docs/auftakt/nip-matrix.json',
            priority: 'P3',
            scopeNotes: 'Chats pending'
          })
        ]
      }
    );

    expect(result.errors).toContain('NIP-C7 must stay implemented after chat helper coverage');
    expect(result.errors).toContain('NIP-C7 owner must be packages/core/src/nipC7-chats.ts');
    expect(result.errors).toContain(
      'NIP-C7 proof must be packages/core/src/nipC7-chats.contract.test.ts'
    );
    expect(result.errors).toContain('NIP-C7 scopeNotes must not use stale chat-pending wording');
  });

  it('accepts the implemented NIP-C7 chat helper claim', () => {
    const result = checkNipMatrix(
      { nips: ['C7'], sourceUrl: 'source', sourceDate: '2026-04-24' },
      {
        sourceUrl: 'source',
        sourceDate: '2026-04-24',
        entries: [
          entry('C7', {
            status: 'implemented',
            owner: 'packages/core/src/nipC7-chats.ts',
            proof: 'packages/core/src/nipC7-chats.contract.test.ts',
            priority: 'P3',
            scopeNotes:
              'Core NIP-C7 chat helpers build and parse kind:9 chat messages, q tag parent replies, message content, reply quote parsing, and author relay filters.'
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
