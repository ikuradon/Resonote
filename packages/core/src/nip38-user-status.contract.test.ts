import { describe, expect, it } from 'vitest';

import {
  buildNip38ClearStatusEvent,
  buildNip38StatusLinkTag,
  buildNip38UserStatusEvent,
  buildNip38UserStatusFilter,
  isNip38KnownStatusType,
  isNip38StatusClear,
  isNip38StatusLinkTagName,
  isNip38UserStatusEvent,
  NIP38_LINK_TAGS,
  NIP38_STATUS_TYPES,
  NIP38_USER_STATUS_KIND,
  parseNip38StatusLinks,
  parseNip38StatusType,
  parseNip38UserStatusEvent
} from './index.js';

describe('NIP-38 user statuses', () => {
  it('builds addressable kind:30315 user status events with d tags and links', () => {
    expect(
      buildNip38UserStatusEvent({
        statusType: ' general ',
        content: 'Sign up for nostrasia!',
        links: [{ tagName: 'r', value: ' https://nostr.world ' }],
        tags: [['client', 'resonote']]
      })
    ).toEqual({
      kind: NIP38_USER_STATUS_KIND,
      content: 'Sign up for nostrasia!',
      tags: [
        ['d', 'general'],
        ['r', 'https://nostr.world'],
        ['client', 'resonote']
      ]
    });
  });

  it('builds music statuses with NIP-40 expiration timestamps', () => {
    expect(
      buildNip38UserStatusEvent({
        statusType: 'music',
        content: 'Intergalactic - Beastie Boys',
        links: [{ tagName: 'r', value: 'spotify:search:Intergalactic%20-%20Beastie%20Boys' }],
        expiration: 1_692_845_589
      })
    ).toEqual({
      kind: 30315,
      content: 'Intergalactic - Beastie Boys',
      tags: [
        ['d', 'music'],
        ['r', 'spotify:search:Intergalactic%20-%20Beastie%20Boys'],
        ['expiration', '1692845589']
      ]
    });
  });

  it('parses status type, clear flag, expiration, link tags, and custom tags', () => {
    expect(
      parseNip38UserStatusEvent({
        kind: 30315,
        pubkey: 'author',
        created_at: 123,
        content: 'Working',
        tags: [
          ['d', 'general'],
          ['p', 'profile-pubkey', 'wss://relay.example'],
          ['e', 'event-id', 'wss://relay.example'],
          ['a', '30023:pubkey:d'],
          ['expiration', '200'],
          ['client', 'resonote']
        ]
      })
    ).toEqual({
      statusType: 'general',
      content: 'Working',
      clear: false,
      expiration: 200,
      links: [
        { tagName: 'p', value: 'profile-pubkey', relayHint: 'wss://relay.example' },
        { tagName: 'e', value: 'event-id', relayHint: 'wss://relay.example' },
        { tagName: 'a', value: '30023:pubkey:d', relayHint: null }
      ],
      pubkey: 'author',
      createdAt: 123,
      customTags: [['client', 'resonote']]
    });
  });

  it('builds and detects clear-status events with empty content', () => {
    const event = buildNip38ClearStatusEvent('music');
    expect(event).toEqual({
      kind: 30315,
      content: '',
      tags: [['d', 'music']]
    });
    expect(isNip38StatusClear(event)).toBe(true);
    expect(parseNip38UserStatusEvent(event)?.clear).toBe(true);
  });

  it('builds relay filters for latest user statuses', () => {
    expect(
      buildNip38UserStatusFilter({
        authors: [' pubkey ', 'pubkey', 'other'],
        statusTypes: ['general', 'music', 'general'],
        limit: 20
      })
    ).toEqual({
      kinds: [30315],
      authors: ['pubkey', 'other'],
      '#d': ['general', 'music'],
      limit: 20
    });
  });

  it('exposes status/link constants and guards', () => {
    expect(NIP38_STATUS_TYPES).toEqual(['general', 'music']);
    expect(NIP38_LINK_TAGS).toEqual(['r', 'p', 'e', 'a']);
    expect(isNip38UserStatusEvent({ kind: 30315 })).toBe(true);
    expect(isNip38KnownStatusType('general')).toBe(true);
    expect(isNip38KnownStatusType('custom')).toBe(false);
    expect(isNip38StatusLinkTagName('a')).toBe(true);
    expect(isNip38StatusLinkTagName('t')).toBe(false);
  });

  it('parses helpers directly and rejects malformed events', () => {
    expect(parseNip38StatusType({ tags: [['d', 'music']] })).toBe('music');
    expect(
      parseNip38StatusLinks({
        tags: [
          ['r', 'https://example.com'],
          ['x', 'ignored'],
          ['p', '  ']
        ]
      })
    ).toEqual([{ tagName: 'r', value: 'https://example.com', relayHint: null }]);
    expect(
      parseNip38UserStatusEvent({ kind: 1, content: '', tags: [['d', 'general']] })
    ).toBeNull();
    expect(parseNip38UserStatusEvent({ kind: 30315, content: '', tags: [] })).toBeNull();
  });

  it('rejects empty status types, empty links, and invalid filter limits', () => {
    expect(() => buildNip38UserStatusEvent({ statusType: ' ' })).toThrow(
      'NIP-38 status type must not be empty'
    );
    expect(() => buildNip38StatusLinkTag({ tagName: 'r', value: ' ' })).toThrow(
      'NIP-38 status link value must not be empty'
    );
    expect(() => buildNip38UserStatusFilter({ limit: 0 })).toThrow(
      'NIP-38 filter limit must be a positive safe integer'
    );
  });
});
