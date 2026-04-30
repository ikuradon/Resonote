/**
 * Domain types for the comments feature.
 * No dependencies on infra (relay-session, IndexedDB, fetch, window).
 */

export interface Comment {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
  /** Playback position in milliseconds when comment was posted, or null */
  positionMs: number | null;
  emojiTags: string[][];
  /** Parent comment ID if this is a reply, or null for top-level comments */
  replyTo: string | null;
  /** Content warning reason (NIP-36). Empty string = CW without reason. null = no CW. */
  contentWarning: string | null;
  /** Relay URL where this event was received from, used as relay hint in replies/reactions */
  relayHint?: string;
}

export interface Reaction {
  id: string;
  pubkey: string;
  content: string;
  targetEventId: string;
  emojiUrl?: string;
}

export interface ReactionStats {
  likes: number;
  emojis: { content: string; url?: string; count: number }[];
  reactors: Set<string>;
}

export interface PlaceholderComment {
  id: string;
  status: 'loading' | 'not-found' | 'deleted';
  positionMs: number | null;
}

/** Raw Nostr event shape used by mappers. */
export interface NostrEvent {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string[][];
  kind: number;
}

export interface ContentReaction {
  id: string;
  pubkey: string;
  createdAt: number;
}
