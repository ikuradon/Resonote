import { describe, expect, it } from 'vitest';

import {
  buildNip50SearchFilter,
  buildNip50SearchQuery,
  filterHasNip50Search,
  parseNip50SearchFilter,
  parseNip50SearchQuery,
  relaySupportsNip50Search
} from './index.js';

describe('NIP-50 search filters', () => {
  it('builds search query strings with extension tokens', () => {
    expect(
      buildNip50SearchQuery({
        terms: [' best ', 'nostr apps'],
        extensions: [
          { key: 'domain', value: 'example.com' },
          { key: 'language', value: 'en' },
          { key: 'include', value: 'spam' }
        ]
      })
    ).toBe('best nostr apps domain:example.com language:en include:spam');
  });

  it('builds filters that preserve normal Nostr constraints', () => {
    expect(
      buildNip50SearchFilter({
        query: { terms: 'relay search', extensions: [{ key: 'nsfw', value: 'false' }] },
        filter: {
          kinds: [1, 30023],
          authors: ['pubkey'],
          limit: 20,
          search: 'overridden'
        }
      })
    ).toEqual({
      kinds: [1, 30023],
      authors: ['pubkey'],
      limit: 20,
      search: 'relay search nsfw:false'
    });
  });

  it('parses query terms and known or unknown extensions', () => {
    expect(parseNip50SearchQuery('  best nostr include:spam custom:value broken:  ')).toEqual({
      raw: 'best nostr include:spam custom:value broken:',
      terms: ['best', 'nostr', 'broken:'],
      extensions: [
        { key: 'include', value: 'spam', known: true },
        { key: 'custom', value: 'value', known: false }
      ]
    });

    expect(
      parseNip50SearchFilter({
        search: 'orange',
        kinds: [1],
        '#t': ['nostr']
      })
    ).toEqual({
      query: { raw: 'orange', terms: ['orange'], extensions: [] },
      constraints: {
        kinds: [1],
        '#t': ['nostr']
      }
    });
  });

  it('detects empty search filters and relay support from supported_nips', () => {
    expect(() => buildNip50SearchFilter({ query: ' ' })).toThrow(
      'NIP-50 search query must not be empty'
    );
    expect(() =>
      buildNip50SearchQuery({ terms: 'nostr', extensions: [{ key: 'bad key', value: 'x' }] })
    ).toThrow('NIP-50 search extension key must be a non-empty single token without colon');
    expect(parseNip50SearchQuery(' ')).toBeNull();
    expect(filterHasNip50Search({ search: 'nostr' })).toBe(true);
    expect(filterHasNip50Search({ search: '' })).toBe(false);
    expect(relaySupportsNip50Search({ supportedNips: [1, 11, 50] })).toBe(true);
    expect(relaySupportsNip50Search({ supportedNips: [1, 11] })).toBe(false);
  });
});
