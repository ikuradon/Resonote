import { describe, expect, it } from 'vitest';

import {
  buildNip72ApprovalEvent,
  buildNip72CommunityAddressTag,
  buildNip72CommunityDefinition,
  buildNip72CommunityPost,
  buildNip72ModeratorTag,
  buildNip72ReplyPostTags,
  buildNip72TopLevelPostTags,
  NIP72_APPROVAL_KIND,
  NIP72_COMMUNITY_DEFINITION_KIND,
  NIP72_COMMUNITY_POST_KIND,
  parseNip72ApprovalEvent,
  parseNip72CommunityAddressTag,
  parseNip72CommunityDefinition,
  parseNip72CommunityPost,
  parseNip72ModeratorTags,
  parseNip72RelayTags
} from './index.js';

describe('NIP-72 moderated communities', () => {
  it('builds and parses community definition events', () => {
    const event = buildNip72CommunityDefinition({
      identifier: 'nostr',
      name: 'Nostr',
      description: 'Nostr discussion',
      image: { url: 'https://example.com/community.png', dimensions: '512x512' },
      moderators: [{ pubkey: 'mod1', relayHint: 'wss://relay' }, { pubkey: 'mod2' }],
      relays: [
        { url: 'wss://author-relay', marker: 'author' },
        { url: 'wss://requests-relay', marker: 'requests' },
        { url: 'wss://approvals-relay', marker: 'approvals' },
        { url: 'wss://general-relay' }
      ],
      tags: [['client', 'resonote']]
    });

    expect(event).toEqual({
      kind: NIP72_COMMUNITY_DEFINITION_KIND,
      content: '',
      tags: [
        ['d', 'nostr'],
        ['name', 'Nostr'],
        ['description', 'Nostr discussion'],
        ['image', 'https://example.com/community.png', '512x512'],
        ['p', 'mod1', 'wss://relay', 'moderator'],
        ['p', 'mod2', '', 'moderator'],
        ['relay', 'wss://author-relay', 'author'],
        ['relay', 'wss://requests-relay', 'requests'],
        ['relay', 'wss://approvals-relay', 'approvals'],
        ['relay', 'wss://general-relay'],
        ['client', 'resonote']
      ]
    });
    expect(parseNip72CommunityDefinition({ ...event, pubkey: 'owner', created_at: 123 })).toEqual({
      identifier: 'nostr',
      name: 'Nostr',
      description: 'Nostr discussion',
      image: { url: 'https://example.com/community.png', dimensions: '512x512' },
      moderators: [
        { pubkey: 'mod1', relayHint: 'wss://relay' },
        { pubkey: 'mod2', relayHint: null }
      ],
      relays: [
        { url: 'wss://author-relay', marker: 'author' },
        { url: 'wss://requests-relay', marker: 'requests' },
        { url: 'wss://approvals-relay', marker: 'approvals' },
        { url: 'wss://general-relay', marker: null }
      ],
      content: '',
      pubkey: 'owner',
      createdAt: 123,
      customTags: [['client', 'resonote']]
    });
  });

  it('builds and parses top-level and reply community post tags', () => {
    const community = { pubkey: 'owner', identifier: 'nostr', relayHint: 'wss://relay' };
    const top = buildNip72CommunityPost({
      community,
      content: 'Hi everyone',
      tags: [['client', 'resonote']]
    });
    expect(top).toEqual({
      kind: NIP72_COMMUNITY_POST_KIND,
      content: 'Hi everyone',
      tags: [
        ['A', '34550:owner:nostr', 'wss://relay'],
        ['a', '34550:owner:nostr', 'wss://relay'],
        ['P', 'owner', 'wss://relay'],
        ['p', 'owner', 'wss://relay'],
        ['K', '34550'],
        ['k', '34550'],
        ['client', 'resonote']
      ]
    });
    expect(parseNip72CommunityPost({ ...top, pubkey: 'alice', created_at: 456 })).toEqual({
      community: {
        pubkey: 'owner',
        identifier: 'nostr',
        value: '34550:owner:nostr',
        relayHint: 'wss://relay'
      },
      topLevel: true,
      parent: null,
      content: 'Hi everyone',
      pubkey: 'alice',
      createdAt: 456,
      customTags: [['client', 'resonote']]
    });

    const replyTags = buildNip72ReplyPostTags({
      community,
      parent: {
        eventId: 'parent-id',
        pubkey: 'parent-pubkey',
        kind: 1111,
        relayHint: 'wss://parent'
      }
    });
    expect(replyTags).toEqual([
      ['A', '34550:owner:nostr', 'wss://relay'],
      ['P', 'owner', 'wss://relay'],
      ['K', '34550'],
      ['e', 'parent-id', 'wss://parent'],
      ['p', 'parent-pubkey', 'wss://parent'],
      ['k', '1111']
    ]);
    const reply = parseNip72CommunityPost({
      kind: NIP72_COMMUNITY_POST_KIND,
      content: 'Agreed',
      tags: replyTags
    });
    expect(reply?.parent).toEqual({
      eventId: 'parent-id',
      pubkey: 'parent-pubkey',
      kind: 1111,
      relayHint: 'wss://parent'
    });
  });

  it('builds and parses approval events for event ids and replaceable addresses', () => {
    const event = buildNip72ApprovalEvent({
      communities: [
        { pubkey: 'owner', identifier: 'nostr', relayHint: 'wss://relay' },
        { pubkey: 'owner2', identifier: 'dev' }
      ],
      post: {
        eventId: 'post-id',
        address: '30023:alice:article',
        authorPubkey: 'alice',
        authorRelayHint: 'wss://author',
        kind: 30023
      },
      approvedEvent: { kind: 30023, content: 'approved', tags: [] },
      tags: [['client', 'resonote']]
    });

    expect(event.kind).toBe(NIP72_APPROVAL_KIND);
    expect(event.tags).toEqual([
      ['a', '34550:owner:nostr', 'wss://relay'],
      ['a', '34550:owner2:dev'],
      ['e', 'post-id'],
      ['a', '30023:alice:article'],
      ['p', 'alice', 'wss://author'],
      ['k', '30023'],
      ['client', 'resonote']
    ]);
    expect(parseNip72ApprovalEvent({ ...event, pubkey: 'mod', created_at: 789 })).toEqual({
      communities: [
        {
          pubkey: 'owner',
          identifier: 'nostr',
          value: '34550:owner:nostr',
          relayHint: 'wss://relay'
        },
        { pubkey: 'owner2', identifier: 'dev', value: '34550:owner2:dev', relayHint: null }
      ],
      post: {
        eventId: 'post-id',
        address: '30023:alice:article',
        authorPubkey: 'alice',
        authorRelayHint: 'wss://author',
        kind: 30023
      },
      content: JSON.stringify({ kind: 30023, content: 'approved', tags: [] }),
      pubkey: 'mod',
      createdAt: 789,
      customTags: [['client', 'resonote']]
    });
  });

  it('exposes direct parsers and rejects malformed community events', () => {
    expect(buildNip72CommunityAddressTag({ pubkey: 'owner', identifier: 'nostr' })).toEqual([
      'a',
      '34550:owner:nostr'
    ]);
    expect(parseNip72CommunityAddressTag(['A', '34550:owner:nostr', 'wss://relay'])).toEqual({
      pubkey: 'owner',
      identifier: 'nostr',
      value: '34550:owner:nostr',
      relayHint: 'wss://relay'
    });
    expect(buildNip72ModeratorTag({ pubkey: 'mod' })).toEqual(['p', 'mod', '', 'moderator']);
    expect(parseNip72ModeratorTags([['p', 'mod', '', 'moderator']])).toEqual([
      { pubkey: 'mod', relayHint: null }
    ]);
    expect(parseNip72RelayTags([['relay', 'wss://relay', 'requests']])).toEqual([
      { url: 'wss://relay', marker: 'requests' }
    ]);
    expect(parseNip72CommunityDefinition({ kind: 1, content: '', tags: [] })).toBeNull();
    expect(parseNip72CommunityDefinition({ kind: 34550, content: '', tags: [] })).toBeNull();
    expect(parseNip72CommunityPost({ kind: 1111, content: '', tags: [] })).toBeNull();
    expect(parseNip72ApprovalEvent({ kind: 4550, content: '', tags: [] })).toBeNull();
    expect(() =>
      buildNip72ApprovalEvent({
        communities: [],
        post: { eventId: 'post-id', authorPubkey: 'alice', kind: 1 }
      })
    ).toThrow('NIP-72 approval requires at least one community');
    expect(() =>
      buildNip72ApprovalEvent({
        communities: [{ pubkey: 'owner', identifier: 'nostr' }],
        post: { authorPubkey: 'alice', kind: 1 }
      })
    ).toThrow('NIP-72 approval requires a post event id or address');
    expect(() => buildNip72TopLevelPostTags({ pubkey: '', identifier: 'nostr' })).toThrow(
      'NIP-72 community pubkey must not be empty'
    );
  });
});
