import { npubEncode } from '@auftakt/core';
import { describe, expect, it } from 'vitest';

import type { Profile } from '$features/profiles/domain/profile-model.js';

import { computeMentionCandidates, type MentionCandidateInput } from './mention-candidates.js';

const PK_ALICE = 'aaaa'.repeat(16);
const PK_BOB = 'bbbb'.repeat(16);
const PK_CAROL = 'cccc'.repeat(16);
const PK_DAVE = 'dddd'.repeat(16);
const PK_ME = 'eeee'.repeat(16);

const PROFILES: Record<string, Profile> = {
  [PK_ALICE]: {
    displayName: 'Alice',
    name: 'alice',
    picture: 'https://example.com/alice.png',
    nip05: 'alice@example.com',
    nip05valid: true
  },
  [PK_BOB]: { displayName: 'Bob', name: 'bob' },
  [PK_CAROL]: { displayName: 'Carol', name: 'carol' },
  [PK_DAVE]: { displayName: 'Dave', name: 'dave' }
};

function makeInput(overrides: Partial<MentionCandidateInput> = {}): MentionCandidateInput {
  return {
    query: '',
    follows: new Set<string>(),
    threadPubkeys: [],
    getProfile: (pk) => PROFILES[pk],
    myPubkey: PK_ME,
    ...overrides
  };
}

describe('computeMentionCandidates', () => {
  it('returns empty array when no follows or thread participants', () => {
    const result = computeMentionCandidates(makeInput());
    expect(result).toEqual([]);
  });

  it('returns follows matching empty query', () => {
    const result = computeMentionCandidates(makeInput({ follows: new Set([PK_ALICE, PK_BOB]) }));
    expect(result).toHaveLength(2);
    expect(result[0].pubkey).toBe(PK_ALICE);
    expect(result[0].source).toBe('follow');
    expect(result[1].pubkey).toBe(PK_BOB);
  });

  it('filters by displayName query', () => {
    const result = computeMentionCandidates(
      makeInput({ query: 'ali', follows: new Set([PK_ALICE, PK_BOB]) })
    );
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe('Alice');
  });

  it('filters by name query', () => {
    const result = computeMentionCandidates(
      makeInput({ query: 'bob', follows: new Set([PK_ALICE, PK_BOB]) })
    );
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe('Bob');
  });

  it('filters by nip05 query', () => {
    const result = computeMentionCandidates(
      makeInput({ query: 'alice@', follows: new Set([PK_ALICE, PK_BOB]) })
    );
    expect(result).toHaveLength(1);
    expect(result[0].nip05).toBe('alice@example.com');
  });

  it('filters by pubkey prefix', () => {
    const result = computeMentionCandidates(
      makeInput({ query: 'aaaa', follows: new Set([PK_ALICE, PK_BOB]) })
    );
    expect(result).toHaveLength(1);
    expect(result[0].pubkey).toBe(PK_ALICE);
  });

  it('filters by npub prefix (lazy bech32)', () => {
    const npub = npubEncode(PK_ALICE);
    const query = npub.slice(0, 8); // e.g. "npub1qsp"
    const result = computeMentionCandidates(
      makeInput({ query, follows: new Set([PK_ALICE, PK_BOB]) })
    );
    expect(result).toHaveLength(1);
    expect(result[0].pubkey).toBe(PK_ALICE);
  });

  it('does not trigger npub path for 5-char query (no match, no crash)', () => {
    // "npub1" (5 chars) should not trigger bech32 encoding — falls through to no match
    const result = computeMentionCandidates(
      makeInput({ query: 'npub1', follows: new Set([PK_ALICE]) })
    );
    expect(result).toHaveLength(0);
  });

  it('excludes own pubkey', () => {
    const result = computeMentionCandidates(makeInput({ follows: new Set([PK_ME, PK_ALICE]) }));
    expect(result).toHaveLength(1);
    expect(result[0].pubkey).toBe(PK_ALICE);
  });

  it('deduplicates follow + thread participant', () => {
    const result = computeMentionCandidates(
      makeInput({
        follows: new Set([PK_ALICE]),
        threadPubkeys: [PK_ALICE, PK_BOB]
      })
    );
    expect(result).toHaveLength(2);
    expect(result[0].source).toBe('follow');
    expect(result[1].source).toBe('thread');
  });

  it('prioritizes follows over thread participants', () => {
    const result = computeMentionCandidates(
      makeInput({
        follows: new Set([PK_BOB]),
        threadPubkeys: [PK_ALICE]
      })
    );
    expect(result[0].source).toBe('follow');
    expect(result[0].pubkey).toBe(PK_BOB);
    expect(result[1].source).toBe('thread');
    expect(result[1].pubkey).toBe(PK_ALICE);
  });

  it('respects limit', () => {
    const result = computeMentionCandidates(
      makeInput({
        follows: new Set([PK_ALICE, PK_BOB, PK_CAROL, PK_DAVE]),
        limit: 2
      })
    );
    expect(result).toHaveLength(2);
  });

  it('uses npub fallback display name for unknown profiles', () => {
    const unknownPk = 'ff00'.repeat(16);
    const result = computeMentionCandidates(makeInput({ follows: new Set([unknownPk]) }));
    expect(result).toHaveLength(1);
    const npub = npubEncode(unknownPk);
    expect(result[0].displayName).toBe(`${npub.slice(0, 12)}...${npub.slice(-4)}`);
  });

  it('case-insensitive query matching', () => {
    const result = computeMentionCandidates(
      makeInput({ query: 'ALICE', follows: new Set([PK_ALICE]) })
    );
    expect(result).toHaveLength(1);
  });

  it('works without myPubkey (null)', () => {
    const result = computeMentionCandidates(
      makeInput({ myPubkey: null, follows: new Set([PK_ALICE]) })
    );
    expect(result).toHaveLength(1);
  });

  it('includes picture and verified nip05 from profile', () => {
    const result = computeMentionCandidates(makeInput({ follows: new Set([PK_ALICE]) }));
    expect(result[0].picture).toBe('https://example.com/alice.png');
    expect(result[0].nip05).toBe('alice@example.com');
  });

  it('excludes unverified nip05 from candidate', () => {
    const unverifiedPk = 'dd00'.repeat(16);
    const profiles: Record<string, Profile> = {
      [unverifiedPk]: { displayName: 'Unverified', nip05: 'fake@example.com', nip05valid: false }
    };
    const result = computeMentionCandidates(
      makeInput({
        follows: new Set([unverifiedPk]),
        getProfile: (pk) => profiles[pk]
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0].nip05).toBeUndefined();
  });
});
