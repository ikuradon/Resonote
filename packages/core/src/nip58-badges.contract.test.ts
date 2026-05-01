import { describe, expect, it } from 'vitest';

import {
  buildNip58AwardedPubkeyTag,
  buildNip58AwardEventTag,
  buildNip58BadgeAward,
  buildNip58BadgeDefinition,
  buildNip58BadgeDefinitionTag,
  buildNip58BadgeSet,
  buildNip58BadgeSetReferenceTag,
  buildNip58ProfileBadges,
  NIP58_BADGE_AWARD_KIND,
  NIP58_BADGE_DEFINITION_KIND,
  NIP58_BADGE_IMAGE_RECOMMENDED_DIMENSIONS,
  NIP58_BADGE_SET_KIND,
  NIP58_DEPRECATED_PROFILE_BADGES_IDENTIFIER,
  NIP58_PROFILE_BADGES_KIND,
  NIP58_THUMB_RECOMMENDED_DIMENSIONS,
  parseNip58AwardedPubkeyTags,
  parseNip58AwardEventTag,
  parseNip58BadgeAward,
  parseNip58BadgeDefinition,
  parseNip58BadgeDefinitionTag,
  parseNip58BadgeDefinitionTags,
  parseNip58BadgePairs,
  parseNip58BadgeSet,
  parseNip58BadgeSetReferenceTags,
  parseNip58ProfileBadges
} from './index.js';

describe('NIP-58 badges', () => {
  it('builds and parses badge definition events', () => {
    const event = buildNip58BadgeDefinition({
      identifier: 'bravery',
      name: 'Medal of Bravery',
      description: 'Awarded to users demonstrating bravery',
      image: {
        url: 'https://nostr.academy/awards/bravery.png',
        dimensions: '1024x1024'
      },
      thumbs: [
        {
          url: 'https://nostr.academy/awards/bravery_256x256.png',
          dimensions: '256x256'
        }
      ],
      tags: [['client', 'resonote']]
    });

    expect(event).toEqual({
      kind: NIP58_BADGE_DEFINITION_KIND,
      content: '',
      tags: [
        ['d', 'bravery'],
        ['name', 'Medal of Bravery'],
        ['description', 'Awarded to users demonstrating bravery'],
        ['image', 'https://nostr.academy/awards/bravery.png', '1024x1024'],
        ['thumb', 'https://nostr.academy/awards/bravery_256x256.png', '256x256'],
        ['client', 'resonote']
      ]
    });
    expect(parseNip58BadgeDefinition({ ...event, pubkey: 'alice', created_at: 123 })).toEqual({
      identifier: 'bravery',
      content: '',
      name: 'Medal of Bravery',
      description: 'Awarded to users demonstrating bravery',
      image: {
        url: 'https://nostr.academy/awards/bravery.png',
        dimensions: '1024x1024'
      },
      thumbs: [
        {
          url: 'https://nostr.academy/awards/bravery_256x256.png',
          dimensions: '256x256'
        }
      ],
      pubkey: 'alice',
      createdAt: 123
    });
  });

  it('builds and parses badge award events', () => {
    const event = buildNip58BadgeAward({
      badge: { pubkey: 'alice', identifier: 'bravery' },
      awardedPubkeys: [
        { pubkey: 'bob', relayHint: 'wss://relay' },
        { pubkey: 'charlie', relayHint: 'wss://relay' }
      ]
    });

    expect(event).toEqual({
      kind: NIP58_BADGE_AWARD_KIND,
      content: '',
      tags: [
        ['a', '30009:alice:bravery'],
        ['p', 'bob', 'wss://relay'],
        ['p', 'charlie', 'wss://relay']
      ]
    });
    expect(parseNip58BadgeAward({ ...event, pubkey: 'alice', created_at: 456 })).toEqual({
      badge: {
        pubkey: 'alice',
        identifier: 'bravery',
        value: '30009:alice:bravery',
        relayHint: null
      },
      awardedPubkeys: [
        { pubkey: 'bob', relayHint: 'wss://relay' },
        { pubkey: 'charlie', relayHint: 'wss://relay' }
      ],
      content: '',
      pubkey: 'alice',
      createdAt: 456
    });
  });

  it('builds and parses ordered profile badge pairs and badge set references', () => {
    const event = buildNip58ProfileBadges({
      badges: [
        {
          badge: { pubkey: 'alice', identifier: 'bravery' },
          award: { eventId: 'award-event-id', relayHint: 'wss://nostr.academy' }
        },
        {
          badge: { pubkey: 'alice', identifier: 'honor' },
          award: { eventId: 'honor-award-id', relayHint: 'wss://nostr.academy' }
        }
      ],
      badgeSets: [{ pubkey: 'bob', identifier: 'favorites' }]
    });

    expect(event).toEqual({
      kind: NIP58_PROFILE_BADGES_KIND,
      content: '',
      tags: [
        ['a', '30009:alice:bravery'],
        ['e', 'award-event-id', 'wss://nostr.academy'],
        ['a', '30009:alice:honor'],
        ['e', 'honor-award-id', 'wss://nostr.academy'],
        ['a', '30008:bob:favorites']
      ]
    });
    expect(parseNip58ProfileBadges({ ...event, pubkey: 'bob', created_at: 789 })).toEqual({
      kind: 10008,
      deprecated: false,
      identifier: null,
      content: '',
      badges: [
        {
          badge: {
            pubkey: 'alice',
            identifier: 'bravery',
            value: '30009:alice:bravery',
            relayHint: null
          },
          award: { eventId: 'award-event-id', relayHint: 'wss://nostr.academy' }
        },
        {
          badge: {
            pubkey: 'alice',
            identifier: 'honor',
            value: '30009:alice:honor',
            relayHint: null
          },
          award: { eventId: 'honor-award-id', relayHint: 'wss://nostr.academy' }
        }
      ],
      badgeSets: [
        {
          pubkey: 'bob',
          identifier: 'favorites',
          value: '30008:bob:favorites',
          relayHint: null
        }
      ],
      pubkey: 'bob',
      createdAt: 789
    });
  });

  it('builds and parses badge set events and deprecated profile badge events', () => {
    const set = buildNip58BadgeSet({
      identifier: 'favorites',
      title: 'Favorites',
      badges: [
        {
          badge: { pubkey: 'alice', identifier: 'bravery' },
          award: { eventId: 'award-event-id' }
        }
      ],
      tags: [
        ['a', '30009:mallory:forged'],
        ['e', 'forged-award'],
        ['client', 'resonote']
      ]
    });

    expect(set.tags).toEqual([
      ['d', 'favorites'],
      ['title', 'Favorites'],
      ['a', '30009:alice:bravery'],
      ['e', 'award-event-id'],
      ['client', 'resonote']
    ]);

    expect(parseNip58BadgeSet(set)).toEqual({
      kind: NIP58_BADGE_SET_KIND,
      deprecated: false,
      identifier: 'favorites',
      content: '',
      badges: [
        {
          badge: {
            pubkey: 'alice',
            identifier: 'bravery',
            value: '30009:alice:bravery',
            relayHint: null
          },
          award: { eventId: 'award-event-id', relayHint: null }
        }
      ],
      badgeSets: [],
      pubkey: null,
      createdAt: null
    });
    expect(
      parseNip58ProfileBadges({
        kind: 30008,
        content: '',
        tags: [
          ['d', NIP58_DEPRECATED_PROFILE_BADGES_IDENTIFIER],
          ['a', '30009:alice:bravery'],
          ['e', 'award-event-id']
        ]
      })?.deprecated
    ).toBe(true);
    expect(parseNip58BadgeSet({ ...set, tags: [['d', 'profile_badges']] })).toBeNull();
  });

  it('exposes tag helpers, recommendation constants, and direct parsers', () => {
    expect(NIP58_BADGE_IMAGE_RECOMMENDED_DIMENSIONS).toBe('1024x1024');
    expect(NIP58_THUMB_RECOMMENDED_DIMENSIONS).toEqual([
      '512x512',
      '256x256',
      '64x64',
      '32x32',
      '16x16'
    ]);
    expect(
      buildNip58BadgeDefinitionTag({
        pubkey: 'alice',
        identifier: 'bravery',
        relayHint: 'wss://relay'
      })
    ).toEqual(['a', '30009:alice:bravery', 'wss://relay']);
    expect(buildNip58BadgeSetReferenceTag({ pubkey: 'bob', identifier: 'favorites' })).toEqual([
      'a',
      '30008:bob:favorites'
    ]);
    expect(buildNip58AwardEventTag({ eventId: 'award', relayHint: 'wss://relay' })).toEqual([
      'e',
      'award',
      'wss://relay'
    ]);
    expect(buildNip58AwardedPubkeyTag({ pubkey: 'bob', relayHint: 'wss://relay' })).toEqual([
      'p',
      'bob',
      'wss://relay'
    ]);
    expect(parseNip58BadgeDefinitionTag(['a', '30009:alice:bravery'])).toEqual({
      pubkey: 'alice',
      identifier: 'bravery',
      value: '30009:alice:bravery',
      relayHint: null
    });
    expect(parseNip58AwardEventTag(['e', 'award', 'wss://relay'])).toEqual({
      eventId: 'award',
      relayHint: 'wss://relay'
    });
    expect(parseNip58AwardedPubkeyTags([['p', 'bob', 'wss://relay']])).toEqual([
      { pubkey: 'bob', relayHint: 'wss://relay' }
    ]);
    expect(parseNip58BadgeDefinitionTags([['a', '30009:alice:bravery']])).toHaveLength(1);
    expect(parseNip58BadgeSetReferenceTags([['a', '30008:bob:favorites']])).toHaveLength(1);
  });

  it('ignores unmatched profile badge tags and rejects malformed events', () => {
    expect(
      parseNip58BadgePairs([
        ['a', '30009:alice:bravery'],
        ['p', 'not-an-award'],
        ['e', 'orphan-award']
      ])
    ).toEqual([]);
    expect(parseNip58BadgeDefinition({ kind: 30009, content: '', tags: [] })).toBeNull();
    expect(
      parseNip58BadgeAward({ kind: 8, content: '', tags: [['a', '30009:alice:bravery']] })
    ).toBeNull();
    expect(parseNip58ProfileBadges({ kind: 1, content: '', tags: [] })).toBeNull();
    expect(parseNip58BadgeSet({ kind: NIP58_BADGE_SET_KIND, content: '', tags: [] })).toBeNull();
    expect(() =>
      buildNip58BadgeAward({
        badge: { pubkey: 'alice', identifier: 'bravery' },
        awardedPubkeys: []
      })
    ).toThrow('NIP-58 badge award requires at least one awarded pubkey');
  });
});
