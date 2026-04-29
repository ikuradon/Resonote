import { describe, expect, it } from 'vitest';

import {
  buildNip85AddressAssertion,
  buildNip85AssertionEvent,
  buildNip85EventAssertion,
  buildNip85ExternalIdentifierAssertion,
  buildNip85ResultTag,
  buildNip85TrustedProviderList,
  buildNip85TrustedProviderTag,
  buildNip85UserAssertion,
  isNip85AssertionKind,
  isNip85ResultTagAllowed,
  NIP85_ADDRESS_ASSERTION_KIND,
  NIP85_EVENT_ASSERTION_KIND,
  NIP85_EXTERNAL_IDENTIFIER_ASSERTION_KIND,
  NIP85_TRUSTED_PROVIDER_LIST_KIND,
  NIP85_USER_ASSERTION_KIND,
  parseNip85AssertionEvent,
  parseNip85TrustedProviderList,
  parseNip85TrustedProviderTagsJson,
  stringifyNip85TrustedProviderTags
} from './index.js';

describe('NIP-85 trusted assertions', () => {
  it('builds and parses user assertion events with declared result tags', () => {
    const event = buildNip85UserAssertion({
      subject: 'user-pubkey',
      subjectRelayHint: 'wss://home.example',
      results: [
        { name: 'rank', value: 89 },
        { name: 'followers', value: 1234 },
        { name: 'first_created_at', value: 1700000000 },
        { name: 't', value: 'nostr' }
      ],
      tags: [
        ['rank', '0'],
        ['client', 'resonote']
      ]
    });

    expect(event).toEqual({
      kind: NIP85_USER_ASSERTION_KIND,
      content: '',
      tags: [
        ['d', 'user-pubkey'],
        ['p', 'user-pubkey', 'wss://home.example'],
        ['rank', '89'],
        ['followers', '1234'],
        ['first_created_at', '1700000000'],
        ['t', 'nostr'],
        ['client', 'resonote']
      ]
    });

    expect(parseNip85AssertionEvent({ ...event, pubkey: 'service', created_at: 456 })).toEqual({
      kind: NIP85_USER_ASSERTION_KIND,
      subjectType: 'user',
      subject: 'user-pubkey',
      subjectRelayHint: 'wss://home.example',
      identifierKinds: [],
      results: [
        { name: 'rank', value: '89', numericValue: 89 },
        { name: 'followers', value: '1234', numericValue: 1234 },
        { name: 'first_created_at', value: '1700000000', numericValue: 1700000000 },
        { name: 't', value: 'nostr', numericValue: null }
      ],
      content: '',
      customTags: [['client', 'resonote']],
      pubkey: 'service',
      createdAt: 456
    });
  });

  it('builds and parses event, address, and NIP-73 external identifier assertions', () => {
    const eventAssertion = buildNip85EventAssertion({
      subject: 'event-id',
      subjectRelayHint: 'wss://events.example',
      results: [
        { name: 'rank', value: 77 },
        { name: 'comment_cnt', value: 12 },
        { name: 'zap_amount', value: 2100 }
      ]
    });
    expect(eventAssertion.tags).toEqual([
      ['d', 'event-id'],
      ['e', 'event-id', 'wss://events.example'],
      ['rank', '77'],
      ['comment_cnt', '12'],
      ['zap_amount', '2100']
    ]);
    expect(parseNip85AssertionEvent(eventAssertion)?.subjectType).toBe('event');

    const addressAssertion = buildNip85AddressAssertion({
      subject: '30023:alice:article',
      subjectRelayHint: 'wss://articles.example',
      results: [{ name: 'repost_cnt', value: 3 }]
    });
    expect(addressAssertion.tags).toEqual([
      ['d', '30023:alice:article'],
      ['a', '30023:alice:article', 'wss://articles.example'],
      ['repost_cnt', '3']
    ]);
    expect(parseNip85AssertionEvent(addressAssertion)?.subjectType).toBe('address');

    const externalAssertion = buildNip85ExternalIdentifierAssertion({
      subject: 'isbn:9780765382030',
      identifierKinds: ['isbn'],
      results: [
        { name: 'rank', value: 92 },
        { name: 'reaction_cnt', value: 8 }
      ]
    });
    expect(externalAssertion).toEqual({
      kind: NIP85_EXTERNAL_IDENTIFIER_ASSERTION_KIND,
      content: '',
      tags: [
        ['d', 'isbn:9780765382030'],
        ['k', 'isbn'],
        ['rank', '92'],
        ['reaction_cnt', '8']
      ]
    });
    expect(parseNip85AssertionEvent(externalAssertion)?.identifierKinds).toEqual(['isbn']);
  });

  it('builds and parses kind:10040 trusted provider declarations', () => {
    const provider = {
      assertionKind: NIP85_USER_ASSERTION_KIND,
      resultTag: 'rank',
      servicePubkey: 'service-pubkey',
      relayHint: 'wss://nip85.example'
    } as const;
    const privateProvidersJson = stringifyNip85TrustedProviderTags([
      {
        assertionKind: NIP85_EVENT_ASSERTION_KIND,
        resultTag: 'rank',
        servicePubkey: 'private-service',
        relayHint: 'wss://private.example'
      }
    ]);
    const event = buildNip85TrustedProviderList({
      providers: [provider],
      content: `nip44:${  privateProvidersJson}`,
      tags: [
        ['30382:rank', 'ignored', 'wss://ignored'],
        ['client', 'resonote']
      ]
    });

    expect(event).toEqual({
      kind: NIP85_TRUSTED_PROVIDER_LIST_KIND,
      content: `nip44:${  privateProvidersJson}`,
      tags: [
        ['30382:rank', 'service-pubkey', 'wss://nip85.example'],
        ['client', 'resonote']
      ]
    });
    expect(parseNip85TrustedProviderList({ ...event, pubkey: 'alice', created_at: 789 })).toEqual({
      providers: [
        {
          assertionKind: NIP85_USER_ASSERTION_KIND,
          resultTag: 'rank',
          tagName: '30382:rank',
          servicePubkey: 'service-pubkey',
          relayHint: 'wss://nip85.example'
        }
      ],
      content: `nip44:${  privateProvidersJson}`,
      pubkey: 'alice',
      createdAt: 789,
      customTags: [['client', 'resonote']]
    });
    expect(parseNip85TrustedProviderTagsJson(privateProvidersJson)).toEqual([
      {
        assertionKind: NIP85_EVENT_ASSERTION_KIND,
        resultTag: 'rank',
        tagName: '30383:rank',
        servicePubkey: 'private-service',
        relayHint: 'wss://private.example'
      }
    ]);
  });

  it('exposes validation helpers and rejects malformed declarations', () => {
    expect(isNip85AssertionKind(NIP85_ADDRESS_ASSERTION_KIND)).toBe(true);
    expect(isNip85AssertionKind(1)).toBe(false);
    expect(isNip85ResultTagAllowed(NIP85_USER_ASSERTION_KIND, 'followers')).toBe(true);
    expect(isNip85ResultTagAllowed(NIP85_EVENT_ASSERTION_KIND, 'followers')).toBe(false);
    expect(
      buildNip85ResultTag(NIP85_EXTERNAL_IDENTIFIER_ASSERTION_KIND, { name: 'rank', value: 1 })
    ).toEqual(['rank', '1']);
    expect(
      buildNip85TrustedProviderTag({
        assertionKind: NIP85_ADDRESS_ASSERTION_KIND,
        resultTag: 'zap_amount',
        servicePubkey: 'service',
        relayHint: 'wss://relay'
      })
    ).toEqual(['30384:zap_amount', 'service', 'wss://relay']);
    expect(parseNip85AssertionEvent({ kind: 1, content: '', tags: [] })).toBeNull();
    expect(parseNip85AssertionEvent({ kind: 30382, content: '', tags: [] })).toBeNull();
    expect(parseNip85TrustedProviderList({ kind: 10002, content: '', tags: [] })).toBeNull();
    expect(parseNip85TrustedProviderTagsJson('not-json')).toBeNull();
    expect(() =>
      buildNip85AssertionEvent({
        kind: 30382,
        subject: 'user',
        results: [{ name: 'zap_amount', value: 1 }]
      })
    ).toThrow('NIP-85 unsupported result tag zap_amount for kind:30382');
    expect(() =>
      buildNip85AssertionEvent({
        kind: 1 as never,
        subject: 'user'
      })
    ).toThrow('NIP-85 unsupported assertion kind: 1');
    expect(() =>
      buildNip85TrustedProviderTag({
        assertionKind: NIP85_USER_ASSERTION_KIND,
        resultTag: 'rank',
        servicePubkey: 'service',
        relayHint: ''
      })
    ).toThrow('NIP-85 trusted provider relay hint must not be empty');
  });
});
