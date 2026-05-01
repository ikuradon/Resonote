import { describe, expect, it } from 'vitest';

import {
  buildNip43AddMemberEvent,
  buildNip43InviteClaimEvent,
  buildNip43InviteClaimFilter,
  buildNip43JoinRequestEvent,
  buildNip43LeaveRequestEvent,
  buildNip43MembershipListEvent,
  buildNip43RemoveMemberEvent,
  hasNip43ProtectedTag,
  isNip43AccessKind,
  isNip43RestrictedOkMessage,
  NIP43_ADD_MEMBER_KIND,
  NIP43_INVITE_CLAIM_KIND,
  NIP43_JOIN_REQUEST_KIND,
  NIP43_LEAVE_REQUEST_KIND,
  NIP43_MEMBER_LIST_KIND,
  NIP43_REMOVE_MEMBER_KIND,
  parseNip43ClaimEvent,
  parseNip43ClaimTag,
  parseNip43LeaveRequestEvent,
  parseNip43MemberChangeEvent,
  parseNip43MembershipListEvent,
  parseNip43MemberTags,
  relaySupportsNip43RelayAccess
} from './index.js';

describe('NIP-43 relay access metadata and requests', () => {
  const relayPubkey = 'a'.repeat(64);
  const member = 'b'.repeat(64);
  const nextMember = 'c'.repeat(64);

  it('builds and parses relay membership lists with protected tags', () => {
    const event = buildNip43MembershipListEvent({
      members: [member, nextMember.toUpperCase()],
      tags: [
        ['member', 'ignored'],
        ['client', 'resonote']
      ]
    });
    expect(event).toEqual({
      kind: NIP43_MEMBER_LIST_KIND,
      content: '',
      tags: [['-'], ['member', member], ['member', nextMember], ['client', 'resonote']]
    });
    expect(parseNip43MembershipListEvent({ ...event, pubkey: relayPubkey })).toEqual({
      kind: NIP43_MEMBER_LIST_KIND,
      members: [member, nextMember],
      protected: true,
      customTags: [['client', 'resonote']],
      pubkey: relayPubkey,
      createdAt: null,
      id: null
    });
  });

  it('builds and parses add and remove member relay events', () => {
    const add = buildNip43AddMemberEvent({
      pubkey: member,
      tags: [['client', 'resonote']]
    });
    expect(add).toEqual({
      kind: NIP43_ADD_MEMBER_KIND,
      content: '',
      tags: [['-'], ['p', member], ['client', 'resonote']]
    });
    expect(
      parseNip43MemberChangeEvent({
        ...add,
        pubkey: relayPubkey,
        created_at: 5
      })
    ).toEqual({
      kind: NIP43_ADD_MEMBER_KIND,
      pubkey: member,
      protected: true,
      customTags: [['client', 'resonote']],
      relayPubkey,
      createdAt: 5,
      id: null
    });

    const remove = buildNip43RemoveMemberEvent({ pubkey: member });
    expect(remove).toEqual({
      kind: NIP43_REMOVE_MEMBER_KIND,
      content: '',
      tags: [['-'], ['p', member]]
    });
    expect(parseNip43MemberChangeEvent(remove)).toEqual({
      kind: NIP43_REMOVE_MEMBER_KIND,
      pubkey: member,
      protected: true,
      customTags: [],
      relayPubkey: null,
      createdAt: null,
      id: null
    });
  });

  it('builds and parses join requests, invite claims, and leave requests', () => {
    const join = buildNip43JoinRequestEvent({
      claim: ' invite-code ',
      tags: [['client', 'resonote']]
    });
    expect(join).toEqual({
      kind: NIP43_JOIN_REQUEST_KIND,
      content: '',
      tags: [['-'], ['claim', 'invite-code'], ['client', 'resonote']]
    });
    expect(parseNip43ClaimEvent({ ...join, pubkey: member })).toEqual({
      kind: NIP43_JOIN_REQUEST_KIND,
      claim: 'invite-code',
      protected: true,
      customTags: [['client', 'resonote']],
      pubkey: member,
      createdAt: null,
      id: null
    });

    const invite = buildNip43InviteClaimEvent({ claim: 'generated-code' });
    expect(invite).toEqual({
      kind: NIP43_INVITE_CLAIM_KIND,
      content: '',
      tags: [['-'], ['claim', 'generated-code']]
    });
    const leave = buildNip43LeaveRequestEvent([['client', 'resonote']]);
    expect(leave).toEqual({
      kind: NIP43_LEAVE_REQUEST_KIND,
      content: '',
      tags: [['-'], ['client', 'resonote']]
    });
    expect(parseNip43LeaveRequestEvent({ ...leave, pubkey: member })).toEqual({
      kind: NIP43_LEAVE_REQUEST_KIND,
      protected: true,
      customTags: [['client', 'resonote']],
      pubkey: member,
      createdAt: null,
      id: null
    });
  });

  it('builds relay support helpers, invite filters, and low-level tag parsers', () => {
    expect(isNip43AccessKind(NIP43_JOIN_REQUEST_KIND)).toBe(true);
    expect(isNip43AccessKind(1)).toBe(false);
    expect(relaySupportsNip43RelayAccess({ supported_nips: [1, 43] })).toBe(true);
    expect(relaySupportsNip43RelayAccess({ supported_nips: [1] })).toBe(false);
    expect(isNip43RestrictedOkMessage('restricted: invalid invite')).toBe(true);
    expect(isNip43RestrictedOkMessage('info: welcome')).toBe(false);
    expect(
      buildNip43InviteClaimFilter({
        relayPubkey,
        since: 10,
        until: 20,
        limit: 1
      })
    ).toEqual({
      kinds: [NIP43_INVITE_CLAIM_KIND],
      authors: [relayPubkey],
      since: 10,
      until: 20,
      limit: 1
    });
    expect(parseNip43MemberTags([['member', member]])).toEqual([member]);
    expect(parseNip43ClaimTag([['claim', ' code ']])).toBe('code');
    expect(hasNip43ProtectedTag([['-']])).toBe(true);
  });

  it('rejects invalid inputs and non-matching event kinds', () => {
    expect(() => buildNip43JoinRequestEvent({ claim: '   ' })).toThrow(/claim/);
    expect(() => buildNip43AddMemberEvent({ pubkey: 'not-hex' })).toThrow(/member pubkey/);
    expect(parseNip43MembershipListEvent({ kind: 1, tags: [] })).toBeNull();
    expect(
      parseNip43MemberChangeEvent({
        kind: NIP43_ADD_MEMBER_KIND,
        tags: [['-']]
      })
    ).toBeNull();
    expect(parseNip43ClaimEvent({ kind: NIP43_JOIN_REQUEST_KIND, tags: [['-']] })).toBeNull();
    expect(parseNip43LeaveRequestEvent({ kind: 1, tags: [] })).toBeNull();
  });
});
