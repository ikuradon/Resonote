import { sanitizeUrl } from './url.js';

export type EmojiSegment =
  | { type: 'text'; value: string }
  | { type: 'emoji'; shortcode: string; url: string };

const SHORTCODE_RE = /^:([^:\s]+):$/;

export function isEmojiTag(tag: string[]): boolean {
  return tag[0] === 'emoji' && tag.length >= 3;
}

export function isShortcode(s: string): boolean {
  return SHORTCODE_RE.test(s);
}

export function extractShortcode(s: string): string {
  const match = SHORTCODE_RE.exec(s);
  return match ? match[1] : s;
}

export function addEmojiTag(emojiTags: string[][], shortcode: string, url: string): string[][] {
  if (emojiTags.some((tag) => tag[0] === 'emoji' && tag[1] === shortcode)) return emojiTags;
  return [...emojiTags, ['emoji', shortcode, url]];
}

/**
 * @deprecated Use parseCommentContent from '$shared/nostr/content-parser.js' instead.
 * This function only handles emoji segments; parseCommentContent handles all segment types.
 */
export function parseEmojiContent(content: string, emojiTags: string[][]): EmojiSegment[] {
  if (emojiTags.length === 0) return [{ type: 'text', value: content }];

  const emojiMap = new Map<string, string>();
  for (const tag of emojiTags) {
    if (tag.length >= 3) {
      const safeUrl = sanitizeUrl(tag[2]);
      if (safeUrl) emojiMap.set(tag[1], safeUrl);
    }
  }

  if (emojiMap.size === 0) return [{ type: 'text', value: content }];

  const segments: EmojiSegment[] = [];
  const regex = /:([^:\s]+):/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const shortcode = match[1];
    const url = emojiMap.get(shortcode);
    if (!url) continue;

    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'emoji', shortcode, url });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: content }];
}
