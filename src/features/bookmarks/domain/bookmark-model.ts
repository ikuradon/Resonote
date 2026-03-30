/**
 * Bookmark domain types and pure functions.
 */

export interface BookmarkEntry {
  type: 'content' | 'event' | 'url';
  value: string;
  hint?: string;
}

/** Parse kind:10003 event tags into BookmarkEntry[] */
export function parseBookmarkTags(tags: string[][]): BookmarkEntry[] {
  const entries: BookmarkEntry[] = [];
  for (const tag of tags) {
    if (tag[0] === 'i' && tag[1]) {
      entries.push({ type: 'content', value: tag[1], hint: tag[2] });
    } else if (tag[0] === 'e' && tag[1]) {
      entries.push({ type: 'event', value: tag[1], hint: tag[2] });
    } else if (tag[0] === 'r' && tag[1]) {
      entries.push({ type: 'url', value: tag[1], hint: tag[2] });
    }
  }
  return entries;
}

/** Check if a value is already in a tag list (i-tag). */
export function isAlreadyBookmarked(tags: string[][], value: string): boolean {
  return tags.some((tag) => tag[0] === 'i' && tag[1] === value);
}

/** Add an i-tag bookmark to existing tags. Returns new tags array. */
export function addBookmarkTag(existingTags: string[][], value: string, hint: string): string[][] {
  return [...existingTags, ['i', value, hint]];
}

/** Remove an i-tag bookmark from existing tags. Returns new tags array. */
export function removeBookmarkTag(existingTags: string[][], value: string): string[][] {
  return existingTags.filter((tag) => !(tag[0] === 'i' && tag[1] === value));
}
