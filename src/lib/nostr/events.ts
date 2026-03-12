import type { EventParameters } from 'nostr-typedef';
import type { ContentId, ContentProvider } from '../content/types.js';

/**
 * Format milliseconds as mm:ss string.
 */
export function formatPosition(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Parse mm:ss string back to milliseconds. Returns null on invalid input.
 */
export function parsePosition(str: string): number | null {
  const match = str.match(/^(\d+):(\d{2})$/);
  if (!match) return null;
  return (parseInt(match[1], 10) * 60 + parseInt(match[2], 10)) * 1000;
}

/**
 * Build a kind:1111 comment event (NIP-22).
 * Tags: ["I", "<platform-uri>", "<hint-url>"], ["k", "1111"]
 * Optionally includes ["position", "mm:ss"] when positionMs is provided.
 */
export function buildComment(
  content: string,
  contentId: ContentId,
  provider: ContentProvider,
  positionMs?: number
): EventParameters {
  const iTag = provider.toNostrTag(contentId);
  const tags: string[][] = [iTag, ['k', '1111']];

  if (positionMs !== undefined && positionMs > 0) {
    tags.push(['position', formatPosition(positionMs)]);
  }

  return {
    kind: 1111,
    content,
    tags
  };
}

/**
 * Build a kind:5 deletion event (NIP-09).
 */
export function buildDeletion(targetEventIds: string[]): EventParameters {
  return {
    kind: 5,
    content: '',
    tags: targetEventIds.map((id) => ['e', id])
  };
}

/**
 * Build a kind:7 reaction event (NIP-25).
 * Reacts to a specific event with reference to external content.
 */
export function buildReaction(
  targetEventId: string,
  targetPubkey: string,
  contentId: ContentId,
  provider: ContentProvider,
  reaction = '+'
): EventParameters {
  const iTag = provider.toNostrTag(contentId);
  return {
    kind: 7,
    content: reaction,
    tags: [['e', targetEventId], ['p', targetPubkey], iTag]
  };
}
