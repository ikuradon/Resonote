let nextId = 0;

export function allocateEmojiPopoverId(): string {
  return `emoji-popover-${nextId++}`;
}
