export type EmojiSegment =
  | { type: 'text'; value: string }
  | { type: 'emoji'; shortcode: string; url: string };

const SHORTCODE_RE = /^:([^:\s]+):$/;

/** Check if a Nostr tag is a valid emoji tag (["emoji", shortcode, url]). */
export function isEmojiTag(tag: string[]): boolean {
  return tag[0] === 'emoji' && tag.length >= 3;
}

/** Check if a string is in :shortcode: format. */
export function isShortcode(s: string): boolean {
  return SHORTCODE_RE.test(s);
}

/** Extract the shortcode name from a :shortcode: string. Returns the input if not matching. */
export function extractShortcode(s: string): string {
  const m = SHORTCODE_RE.exec(s);
  return m ? m[1] : s;
}

/**
 * Parse content string replacing :shortcode: references with emoji segments.
 * Builds a mapping from emoji tags (["emoji", shortcode, url]) and splits
 * the content into text and emoji segments.
 */
export function parseEmojiContent(content: string, emojiTags: string[][]): EmojiSegment[] {
  if (emojiTags.length === 0) return [{ type: 'text', value: content }];

  const emojiMap = new Map<string, string>();
  for (const tag of emojiTags) {
    if (tag.length >= 3) {
      emojiMap.set(tag[1], tag[2]);
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
