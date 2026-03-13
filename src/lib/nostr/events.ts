import type { EventParameters } from 'nostr-typedef';
import type { ContentId, ContentProvider } from '../content/types.js';
import { isShortcode, extractShortcode } from '../utils/emoji.js';

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
 * Parse position string to milliseconds.
 * Accepts seconds ("65") or legacy mm:ss ("1:05"). Returns null on invalid input.
 */
export function parsePosition(str: string): number | null {
  // Seconds format (e.g. "65")
  const secMatch = str.match(/^(\d+)$/);
  if (secMatch) return parseInt(secMatch[1], 10) * 1000;

  // Legacy mm:ss format (e.g. "1:05")
  const mmssMatch = str.match(/^(\d+):(\d{2})$/);
  if (mmssMatch) return (parseInt(mmssMatch[1], 10) * 60 + parseInt(mmssMatch[2], 10)) * 1000;

  return null;
}

const HASHTAG_RE = /(?:^|(?<=\s))#([a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+)/g;

/**
 * Extract unique hashtags from content.
 * Matches `#tag` at word boundaries; supports ASCII alphanumerics, underscores,
 * and Japanese characters (hiragana, katakana, CJK unified ideographs).
 * Returns lowercase tags, deduplicated.
 */
export function extractHashtags(content: string): string[] {
  const tags = new Set<string>();
  let m: RegExpExecArray | null;
  HASHTAG_RE.lastIndex = 0;
  while ((m = HASHTAG_RE.exec(content)) !== null) {
    tags.add(m[1].toLowerCase());
  }
  return [...tags];
}

/**
 * Append emoji tags and hashtag tags extracted from content to a tags array.
 */
function appendContentTags(tags: string[][], content: string, emojiTags?: string[][]): void {
  if (emojiTags) {
    tags.push(...emojiTags);
  }
  for (const t of extractHashtags(content)) {
    tags.push(['t', t]);
  }
}

export interface CommentOptions {
  positionMs?: number;
  emojiTags?: string[][];
  parentEvent?: { id: string; pubkey: string };
}

/**
 * Build a kind:1111 comment event (NIP-22).
 * Tags: ["I", "<platform-uri>", "<hint-url>"], ["k", "1111"]
 * Optionally includes ["position", "<seconds>"] when positionMs is provided.
 * When parentEvent is provided, adds ["e", parentId] and ["p", parentPubkey] for replies.
 * Automatically appends ["t", tag] for any #hashtags found in content.
 */
export function buildComment(
  content: string,
  contentId: ContentId,
  provider: ContentProvider,
  options?: CommentOptions
): EventParameters {
  const { positionMs, emojiTags, parentEvent } = options ?? {};
  const iTag = provider.toNostrTag(contentId);
  const tags: string[][] = [iTag, ['k', '1111']];

  if (parentEvent) {
    tags.push(['e', parentEvent.id], ['p', parentEvent.pubkey]);
  }

  if (positionMs !== undefined && positionMs > 0) {
    tags.push(['position', String(Math.floor(positionMs / 1000))]);
  }

  appendContentTags(tags, content, emojiTags);

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
 * Build a kind:1 note for sharing content on Nostr.
 * Includes NIP-73 ["I", ...] tag to reference external content.
 * Content is passed as-is (caller composes the full text including URLs).
 */
export function buildShare(
  content: string,
  contentId: ContentId,
  provider: ContentProvider,
  emojiTags?: string[][]
): EventParameters {
  const iTag = provider.toNostrTag(contentId);
  const tags: string[][] = [iTag];

  appendContentTags(tags, content, emojiTags);

  return {
    kind: 1,
    content,
    tags
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
  reaction = '+',
  emojiUrl?: string
): EventParameters {
  const iTag = provider.toNostrTag(contentId);
  const tags: string[][] = [['e', targetEventId], ['p', targetPubkey], iTag];

  if (emojiUrl && isShortcode(reaction)) {
    tags.push(['emoji', extractShortcode(reaction), emojiUrl]);
  }

  return {
    kind: 7,
    content: reaction,
    tags
  };
}
