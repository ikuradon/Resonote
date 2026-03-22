/**
 * Pure function to compute mention autocomplete candidates.
 * Merges follows, thread participants, and profile cache to produce
 * a ranked, deduplicated candidate list.
 */

import { formatDisplayName, type Profile } from '$features/profiles/domain/profile-model.js';

export interface MentionCandidate {
  pubkey: string;
  displayName: string;
  picture?: string;
  nip05?: string;
  /** Source priority: 'follow' > 'thread' */
  source: 'follow' | 'thread';
}

export interface MentionCandidateInput {
  query: string;
  follows: Set<string>;
  threadPubkeys: string[];
  getProfile: (pubkey: string) => Profile | undefined;
  myPubkey?: string | null;
  limit?: number;
}

function matchesQuery(query: string, profile: Profile | undefined, pubkey: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();

  if (profile?.displayName?.toLowerCase().includes(q)) return true;
  if (profile?.name?.toLowerCase().includes(q)) return true;
  if (profile?.nip05?.toLowerCase().includes(q)) return true;
  if (pubkey.startsWith(q)) return true;

  return false;
}

function toCandidate(
  pubkey: string,
  profile: Profile | undefined,
  source: MentionCandidate['source']
): MentionCandidate {
  return {
    pubkey,
    displayName: formatDisplayName(pubkey, profile),
    picture: profile?.picture,
    nip05: profile?.nip05,
    source
  };
}

/**
 * Compute ranked mention candidates from follows and thread participants.
 * Priority: follows first, then thread participants.
 * Excludes the current user's own pubkey.
 */
export function computeMentionCandidates(input: MentionCandidateInput): MentionCandidate[] {
  const { query, follows, threadPubkeys, getProfile, myPubkey, limit = 8 } = input;
  const seen = new Set<string>();
  const results: MentionCandidate[] = [];

  if (myPubkey) seen.add(myPubkey);

  // 1. Follows (highest priority)
  for (const pubkey of follows) {
    if (seen.has(pubkey)) continue;
    const profile = getProfile(pubkey);
    if (!matchesQuery(query, profile, pubkey)) continue;
    seen.add(pubkey);
    results.push(toCandidate(pubkey, profile, 'follow'));
    if (results.length >= limit) return results;
  }

  // 2. Thread participants
  for (const pubkey of threadPubkeys) {
    if (seen.has(pubkey)) continue;
    const profile = getProfile(pubkey);
    if (!matchesQuery(query, profile, pubkey)) continue;
    seen.add(pubkey);
    results.push(toCandidate(pubkey, profile, 'thread'));
    if (results.length >= limit) return results;
  }

  return results;
}
