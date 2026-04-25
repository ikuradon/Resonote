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
