const SHORTCODE_VALUE_RE = /^[A-Za-z0-9_]+$/;
const SHORTCODE_RE = /^:([A-Za-z0-9_]+):$/;

export function isEmojiTag(tag: string[]): boolean {
  return (
    tag[0] === 'emoji' &&
    tag.length >= 3 &&
    typeof tag[1] === 'string' &&
    SHORTCODE_VALUE_RE.test(tag[1]) &&
    typeof tag[2] === 'string' &&
    tag[2] !== ''
  );
}

export function isShortcode(s: string): boolean {
  return SHORTCODE_RE.test(s);
}

export function extractShortcode(s: string): string {
  const match = SHORTCODE_RE.exec(s);
  return match ? match[1] : s;
}

export function addEmojiTag(emojiTags: string[][], shortcode: string, url: string): string[][] {
  if (!SHORTCODE_VALUE_RE.test(shortcode)) return emojiTags;
  if (emojiTags.some((tag) => tag[0] === 'emoji' && tag[1] === shortcode)) return emojiTags;
  return [...emojiTags, ['emoji', shortcode, url]];
}
